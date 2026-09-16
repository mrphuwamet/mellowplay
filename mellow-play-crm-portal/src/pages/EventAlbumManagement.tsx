import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Paper, Typography, Button, Stack, Grid, Card, CardMedia, CardContent, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, IconButton,
  LinearProgress, Checkbox, FormControlLabel, Alert, CircularProgress, Tooltip,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Sync as SyncIcon,
  CloudUpload as UploadIcon, Collections as AlbumIcon, Star as CoverIcon,
  Public as PublishIcon, PublicOff as UnpublishIcon, Face as FaceIcon,
  Link as LinkIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL, CONSUMER_APP_URL } from '../config';
import { copyText } from '../utils/clipboard';
import { resizeToJpeg, uploadRawFile } from '../utils/imageUpload';
import { describeFaces, loadFaceModels, DetectedFace } from '../utils/faceIndexer';

const API_BASE = `${API_URL}/api/v1/admin`;

/**
 * อัลบั้มรูปกิจกรรม — bulk event photos, imported from a shared Google Drive
 * folder and published to families who booked the course.
 *
 * The entire import pipeline runs in THIS browser tab: list the album's Drive
 * folders (API key, public folders — and the folders inside them), download
 * each image, downscale to a display copy + thumbnail (the size-control
 * requirement — R2 never stores camera-size files), detect faces for the
 * search index, upload, register metadata. The Worker only stores results, so
 * the tab must stay open during a sync; the (album_id, drive_file_id) unique
 * key makes re-running it resume where it stopped.
 *
 * The stages overlap (see runImport): the next photos download and shrink
 * while the current one has its faces read, and uploads go out while the next
 * one is being read. Face detection is the one stage that runs alone — it is
 * the GPU, and two at once only take turns.
 */

/**
 * A round travels as one "date|HH:MM" string.
 *
 * The same shape the rest of the CRM uses for a round, so the dropdown value,
 * what goes to the API and what comes back cannot drift into three spellings of
 * one thing. Empty means no particular round.
 */
const roundKey = (date?: string | null, time?: string | null) =>
  date ? `${date}|${String(time || '').slice(0, 5)}` : '';

const roundLabel = (date?: string | null, time?: string | null) =>
  date ? `${date}${time ? ` · ${String(time).slice(0, 5)}` : ''}` : 'ทุกรอบ';

/**
 * The rounds on a card, short enough to sit on one line.
 *
 * Two are named outright; beyond that the count carries more than a truncated
 * list of dates would, and the full set is one click away in the edit dialog.
 */
const roundsSummary = (rounds?: { slot_date: string; slot_start_time?: string | null }[]) => {
  if (!rounds || rounds.length === 0) return '';
  if (rounds.length <= 2) return ' · ' + rounds.map(r => roundLabel(r.slot_date, r.slot_start_time)).join(', ');
  return ` · ${roundLabel(rounds[0].slot_date, rounds[0].slot_start_time)} +อีก ${rounds.length - 1} รอบ`;
};

const splitRound = (key: string): { slotDate: string | null; slotStartTime: string | null } => {
  const [date = '', time = ''] = String(key || '').split('|');
  return { slotDate: date || null, slotStartTime: time || null };
};

interface Album {
  id: number; name: string; description?: string | null;
  /** NULL when the album is not about one activity. */
  course_id?: number | null;
  /** Every round this album covers. Empty means the whole activity. */
  rounds?: { slot_date: string; slot_start_time?: string | null }[];
  /** Set once a share link exists. The token IS the permission to view. */
  share_token?: string | null;
  /** First Drive folder, kept for older clients. Read drive_folders. */
  drive_folder_id?: string | null;
  /** Every Drive folder the sync reads, in order. */
  drive_folders?: string[];
  cover_photo_url?: string | null;
  /** The cover, or the first photo when no cover was chosen. Read-only. */
  preview_url?: string | null;
  is_published: number; news_feed_id?: number | null; course_name?: string;
  photo_count?: number; face_count?: number; created_at?: string;
  visibility?: 'public' | 'booked';
}
interface Photo {
  id: number; image_url: string; thumb_url?: string | null; width?: number; height?: number;
  drive_file_id?: string | null; drive_file_name?: string | null; face_count: number;
}
interface SyncProgress {
  phase: 'listing' | 'importing' | 'done' | 'error';
  total: number; done: number; skipped: number; failed: { name: string; reason: string }[];
  currentName?: string; facesFound: number; message?: string;
}

const DISPLAY_MAX = 1920;
const DISPLAY_QUALITY = 0.82;
const THUMB_MAX = 400;
const THUMB_QUALITY = 0.75;
const FLUSH_EVERY = 15;
/** Photos downloading and shrinking while the current one has its faces read. */
const DOWNLOAD_AHEAD = 3;
/** Finished photos uploading at once. Beyond this the pipeline waits. */
const UPLOADS_IN_FLIGHT = 4;
/** Folders one sync will walk, roots and subfolders together. A guard, not a quota. */
const MAX_FOLDERS = 200;
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

const folderIdsOf = (a: Album): string[] =>
  a.drive_folders && a.drive_folders.length > 0 ? a.drive_folders : (a.drive_folder_id ? [a.drive_folder_id] : []);

const folderLink = (id: string) => `https://drive.google.com/drive/folders/${id}`;

/**
 * Runs `fn` over `items` with up to `ahead` in flight, yielding results in
 * the original order. The consumer decides when to stop asking for more.
 */
async function* prefetch<T, R>(
  items: T[], ahead: number, fn: (item: T) => Promise<R>, stopped: () => boolean,
): AsyncGenerator<{ item: T; result?: R; error?: any }> {
  const inFlight: Promise<{ item: T; result?: R; error?: any }>[] = [];
  let next = 0;
  const start = () => {
    const item = items[next++];
    inFlight.push(fn(item).then(result => ({ item, result }), error => ({ item, error })));
  };
  while (next < items.length && inFlight.length < ahead) start();
  while (inFlight.length > 0) {
    const out = await inFlight.shift()!;
    if (!stopped() && next < items.length) start();
    yield out;
  }
}

/** One photo to import: where it came from, and how to get its bytes. */
interface ImportItem { name: string; driveFileId: string | null; load: () => Promise<Blob> }

const parseDriveFolderId = (input: string): string | null => {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;
  const byPath = trimmed.match(/folders\/([A-Za-z0-9_-]{10,})/);
  if (byPath) return byPath[1];
  const byQuery = trimmed.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (byQuery) return byQuery[1];
  // A bare id pasted directly.
  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
};

const EventAlbumManagement: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [courses, setCourses] = useState<{ id: number; name: string }[]>([]);
  const [driveApiKey, setDriveApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** Confirmations that are not failures — the copied link, the revoked one. */
  const [notice, setNotice] = useState('');

  // create/edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editAlbum, setEditAlbum] = useState<Album | null>(null);
  const [form, setForm] = useState<{
    name: string; courseId: number; rounds: string[]; description: string; driveLinks: string;
    visibility: 'public' | 'booked';
  }>({ name: '', courseId: 0, rounds: [], description: '', driveLinks: '', visibility: 'booked' });
  /**
   * The rounds of the course now chosen, for the round picker.
   *
   * An event runs several rounds in one day and the photos differ per round, so
   * a date on its own cannot say which album is which. Read from the bookings,
   * so the list is the rounds that actually ran with people in them.
   */
  const [rounds, setRounds] = useState<{ slot_date: string; slot_start_time: string | null; booking_count: number }[]>([]);
  const [shareBusy, setShareBusy] = useState(false);

  /**
   * Make the unlisted link, or copy the one that already exists.
   *
   * Creating is idempotent server-side, so pressing this twice cannot
   * invalidate a link someone was already sent — taking it back is the separate
   * ยกเลิกลิงก์ button, which is the only thing that should break an old copy.
   */
  const copyShareLink = async (album: Album) => {
    setShareBusy(true);
    try {
      const { data } = await axios.post(`${API_BASE}/event-albums/${album.id}/share-link`, {});
      if (!data.success) { setError(data.message || 'สร้างลิงก์ไม่สำเร็จ'); return; }
      const link = `${CONSUMER_APP_URL}/shared-albums/${data.shareToken}`;
      setNotice(await copyText(link) ? `คัดลอกลิงก์แล้ว — ${link}` : link);
      fetchAll();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'สร้างลิงก์ไม่สำเร็จ');
    } finally { setShareBusy(false); }
  };

  const revokeShareLink = async (album: Album) => {
    setShareBusy(true);
    try {
      await axios.delete(`${API_BASE}/event-albums/${album.id}/share-link`);
      setNotice('ยกเลิกลิงก์แล้ว — ลิงก์เดิมที่แจกไปจะเปิดไม่ได้อีก');
      fetchAll();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'ยกเลิกลิงก์ไม่สำเร็จ');
    } finally { setShareBusy(false); }
  };
  useEffect(() => {
    if (!form.courseId) { setRounds([]); return; }
    let cancelled = false;
    axios.get(`${API_BASE}/event-albums/rounds`, { params: { courseId: form.courseId } })
      .then(res => { if (!cancelled && res.data?.success) setRounds(res.data.rounds || []); })
      .catch(() => { if (!cancelled) setRounds([]); });
    return () => { cancelled = true; };
  }, [form.courseId]);
  const [saving, setSaving] = useState(false);

  // photos dialog
  const [openAlbum, setOpenAlbum] = useState<Album | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [sync, setSync] = useState<SyncProgress | null>(null);
  const [indexFaces, setIndexFaces] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const syncAbort = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [albumsRes, coursesRes, configRes] = await Promise.all([
        axios.get(`${API_BASE}/event-albums`),
        axios.get(`${API_BASE}/courses`),
        axios.get(`${API_BASE}/event-albums/config`),
      ]);
      if (albumsRes.data.success) setAlbums(albumsRes.data.albums);
      const list = coursesRes.data.courses || coursesRes.data || [];
      setCourses(Array.isArray(list) ? list.map((c: any) => ({ id: c.id, name: c.name })) : []);
      if (configRes.data.success) setDriveApiKey(configRes.data.driveApiKey || '');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, []);

  // A sync in flight must not be lost to a reflexive tab close.
  const syncing = sync?.phase === 'listing' || sync?.phase === 'importing';
  useEffect(() => {
    if (!syncing && !reindexing) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [syncing, reindexing]);

  const openCreate = () => {
    setEditAlbum(null);
    setForm({ name: '', courseId: 0, rounds: [], description: '', driveLinks: '', visibility: 'booked' });
    setEditOpen(true);
  };
  const openEdit = (a: Album) => {
    setEditAlbum(a);
    setForm({
      name: a.name, courseId: a.course_id || 0,
      rounds: (a.rounds || []).map(r => roundKey(r.slot_date, r.slot_start_time)),
      description: a.description || '',
      driveLinks: folderIdsOf(a).map(folderLink).join('\n'),
      visibility: a.visibility === 'public' ? 'public' : 'booked',
    });
    setEditOpen(true);
  };

  const saveAlbum = async () => {
    if (!form.name.trim()) return;
    // One folder per line. Every line has to parse: a link that silently
    // dropped out would be a folder of photos nobody notices is missing.
    const driveFolderIds: string[] = [];
    for (const line of form.driveLinks.split(/\r?\n/).map(l => l.trim()).filter(Boolean)) {
      const id = parseDriveFolderId(line);
      if (!id) {
        setError(`ลิงก์ Google Drive ไม่ถูกต้อง: ${line} — ต้องเป็นลิงก์โฟลเดอร์ (…/drive/folders/…)`);
        return;
      }
      if (!driveFolderIds.includes(id)) driveFolderIds.push(id);
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(), courseId: form.courseId || null,
        rounds: form.rounds,
        description: form.description || null, driveFolderIds,
        coverPhotoUrl: editAlbum?.cover_photo_url || null,
        visibility: form.visibility,
      };
      if (editAlbum) await axios.put(`${API_BASE}/event-albums/${editAlbum.id}`, payload);
      else await axios.post(`${API_BASE}/event-albums`, payload);
      setEditOpen(false);
      fetchAll();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const deleteAlbum = async (a: Album) => {
    if (!window.confirm(`ลบอัลบั้ม "${a.name}" ทั้งอัลบั้ม? รูปและดัชนีใบหน้าทั้งหมดจะถูกลบด้วย`)) return;
    try {
      await axios.delete(`${API_BASE}/event-albums/${a.id}`);
      fetchAll();
    } catch (e: any) { setError(e?.response?.data?.message || 'ลบไม่สำเร็จ'); }
  };

  const loadPhotos = async (albumId: number) => {
    setPhotosLoading(true);
    try {
      const all: Photo[] = [];
      let after = 0;
      // Page through everything: the grid renders thumbs, and staff need the
      // full drive_file_id set anyway for sync dedupe.
      for (;;) {
        const res = await axios.get(`${API_BASE}/event-albums/${albumId}/photos`, { params: { after, limit: 500 } });
        const batch: Photo[] = res.data.photos || [];
        all.push(...batch);
        if (batch.length < 500) break;
        after = batch[batch.length - 1].id;
      }
      setPhotos(all);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'โหลดรูปไม่สำเร็จ');
    } finally { setPhotosLoading(false); }
  };

  const openPhotos = (a: Album) => {
    setOpenAlbum(a);
    setSync(null);
    setPhotos([]);
    loadPhotos(a.id);
  };

  // ── The import pipeline ───────────────────────────────────────────────────

  /** What the browser shows when a request failed. The server explains itself
   *  in JSON, but responseType 'blob' hands even the error body back as a Blob,
   *  so it has to be read back out — or every failure reads "Request failed
   *  with status code 429". */
  const reasonOf = async (err: any): Promise<string> => {
    let reason = err?.message || 'error';
    const body = err?.response?.data;
    if (body instanceof Blob) {
      try { reason = JSON.parse(await body.text())?.message || reason; } catch { /* keep the axios wording */ }
    } else if (body?.message) {
      reason = body.message;
    }
    return reason;
  };

  const flushPending = async (albumId: number, pending: any[]) => {
    if (pending.length === 0) return { inserted: 0, skipped: 0 };
    const res = await axios.post(`${API_BASE}/event-albums/${albumId}/photos`, { photos: pending });
    return { inserted: res.data.inserted ?? 0, skipped: res.data.skipped ?? 0 };
  };

  /**
   * Imports a list of photos as a pipeline.
   *
   * Three stages, overlapping. Downloading and shrinking runs DOWNLOAD_AHEAD
   * photos ahead of the one whose faces are being read; the two uploads of a
   * finished photo go out together and are not waited for before the next
   * photo's faces start. Face detection itself is serial — it owns the GPU,
   * and a second detector alongside only shares the same time. So a run costs
   * about the slowest stage per photo instead of the sum of all of them.
   *
   * Progress counts a photo when its upload has landed, so "done" means safe.
   * Stopping lets the photos already in flight finish and be registered; a
   * later sync skips them by drive_file_id.
   */
  const runImport = async (albumId: number, items: ImportItem[], withFaces: boolean) => {
    let pending: any[] = [];
    let facesFound = 0;
    const uploads = new Set<Promise<void>>();
    const fail = (name: string, reason: string) =>
      setSync(s => s ? { ...s, done: s.done + 1, failed: [...s.failed, { name, reason }] } : s);

    const prepare = async (it: ImportItem) => {
      const blob = await it.load();
      const bitmap = await createImageBitmap(blob);
      try {
        const display = await resizeToJpeg(bitmap, DISPLAY_MAX, DISPLAY_QUALITY);
        const thumb = await resizeToJpeg(bitmap, THUMB_MAX, THUMB_QUALITY);
        if (!display || !thumb) throw new Error('แปลงรูปไม่สำเร็จ');
        return { display, thumb };
      } finally { bitmap.close(); }
    };

    for await (const step of prefetch(items, DOWNLOAD_AHEAD, prepare, () => syncAbort.current)) {
      if (syncAbort.current) break;
      const { item } = step;
      if (step.error || !step.result) {
        fail(item.name, await reasonOf(step.error));
        // A throttle applies to the next file as much as this one, so pushing
        // straight on just collects 120 identical failures. Backing off gives
        // the run a chance to finish instead.
        if (step.error?.response?.status === 429) await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      const { display, thumb } = step.result;
      setSync(s => s ? { ...s, currentName: item.name } : s);

      let faces: DetectedFace[] = [];
      if (withFaces) {
        try {
          const displayBitmap = await createImageBitmap(display.blob);
          try { faces = await describeFaces(displayBitmap); } finally { displayBitmap.close(); }
        } catch (err: any) {
          fail(item.name, err?.message || 'อ่านใบหน้าไม่สำเร็จ');
          continue;
        }
      }
      facesFound += faces.length;
      const found = facesFound;

      const upload = (async () => {
        const base = item.name.replace(/\.[^.]+$/, '') || 'photo';
        const folder = `event-albums/${albumId}`;
        const [displayUp, thumbUp] = await Promise.all([
          uploadRawFile(new File([display.blob], `${base}.jpg`, { type: 'image/jpeg' }), folder),
          uploadRawFile(new File([thumb.blob], `${base}-thumb.jpg`, { type: 'image/jpeg' }), folder),
        ]);
        if (!displayUp || !thumbUp) throw new Error('อัปโหลดไม่สำเร็จ');
        pending.push({
          imageUrl: displayUp.url, thumbUrl: thumbUp.url,
          width: display.width, height: display.height, sizeBytes: display.blob.size,
          driveFileId: item.driveFileId, driveFileName: item.driveFileId ? item.name : null, faces,
        });
        setSync(s => s ? { ...s, done: s.done + 1, facesFound: Math.max(s.facesFound, found) } : s);
      })().catch(async err => fail(item.name, await reasonOf(err)));
      uploads.add(upload);
      upload.finally(() => uploads.delete(upload));
      if (uploads.size >= UPLOADS_IN_FLIGHT) await Promise.race(uploads);

      if (pending.length >= FLUSH_EVERY) {
        const batch = pending;
        pending = [];
        await flushPending(albumId, batch);
      }
    }
    await Promise.all(uploads);
    await flushPending(albumId, pending);
  };

  /**
   * Every file under the album's folders. Subfolders are walked too — a
   * camera dumps by date, a photographer by round — so pasting the top folder
   * is enough. A folder is visited once however many times it is reachable.
   */
  const listDriveFiles = async (roots: string[]) => {
    const files: { id: string; name: string; mimeType: string }[] = [];
    const seen = new Set<string>();
    const queue = [...roots];
    while (queue.length > 0 && seen.size < MAX_FOLDERS) {
      const folderId = queue.shift()!;
      if (seen.has(folderId)) continue;
      seen.add(folderId);
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q: `'${folderId}' in parents and trashed=false`,
          fields: 'nextPageToken,files(id,name,mimeType)',
          pageSize: '1000',
          key: driveApiKey,
        });
        if (pageToken) params.set('pageToken', pageToken);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
        if (!res.ok) {
          const detail = await res.json().catch(() => null) as any;
          throw new Error(detail?.error?.message || `Drive API ตอบกลับ ${res.status} — ตรวจสอบว่าโฟลเดอร์แชร์แบบ "ทุกคนที่มีลิงก์" และ API key ถูกต้อง`);
        }
        const data = await res.json() as any;
        for (const f of (data.files || []) as { id: string; name: string; mimeType: string }[]) {
          if (f.mimeType === DRIVE_FOLDER_MIME) queue.push(f.id);
          else files.push(f);
        }
        pageToken = data.nextPageToken;
      } while (pageToken);
    }
    return files;
  };

  const runSync = async (album: Album) => {
    const roots = folderIdsOf(album);
    if (roots.length === 0) { setError('อัลบั้มนี้ยังไม่ได้ใส่ลิงก์โฟลเดอร์ Google Drive (แก้ไขอัลบั้มก่อน)'); return; }
    if (!driveApiKey) { setError('ยังไม่ได้ตั้งค่า Google Drive API key ในหน้าตั้งค่าระบบ (คีย์ google_drive_api_key)'); return; }
    syncAbort.current = false;
    setError('');
    setSync({ phase: 'listing', total: 0, done: 0, skipped: 0, failed: [], facesFound: 0 });

    try {
      if (indexFaces) await loadFaceModels();

      // 1) list every folder (paginated), subfolders included
      const files = await listDriveFiles(roots);
      const images = files.filter(f => f.mimeType?.startsWith('image/'));
      const skippedNonImage = files.length - images.length;

      // Everything already imported is skipped up front, so the progress bar
      // reflects real work and re-running a sync is nearly instant.
      const known = new Set(photos.map(p => p.drive_file_id).filter(Boolean));
      const todo = images.filter(f => !known.has(f.id));

      setSync({
        phase: 'importing', total: todo.length, done: 0,
        skipped: (images.length - todo.length) + skippedNonImage,
        failed: [], facesFound: 0,
      });

      // 2) import. Through our own Worker, not googleapis.com. Google answers a
      // run of direct downloads with a 403 abuse page that carries no CORS
      // headers, which the browser can only report as "Failed to fetch" — a
      // message naming the wrong problem. Same-origin means the real reason
      // arrives intact, and the key never reaches the browser.
      await runImport(album.id, todo.map(f => ({
        name: f.name, driveFileId: f.id,
        load: async () => (await axios.get(`${API_BASE}/event-albums/drive-file/${f.id}`, { responseType: 'blob' })).data as Blob,
      })), indexFaces);

      setSync(s => s ? { ...s, phase: 'done', currentName: undefined } : s);
      await loadPhotos(album.id);
      fetchAll();
    } catch (e: any) {
      setSync(s => ({ ...(s || { total: 0, done: 0, skipped: 0, failed: [], facesFound: 0 }), phase: 'error', message: e?.message || 'ซิงค์ไม่สำเร็จ' }));
    }
  };

  /** Files picked by hand, or a whole folder from the disk. A folder picker
   *  hands over everything in it, so anything that is not an image is dropped
   *  here rather than failing one by one. */
  const manualUpload = async (fileList: FileList | null) => {
    if (!openAlbum || !fileList || fileList.length === 0) return;
    const all = Array.from(fileList);
    const images = all.filter(f => f.type.startsWith('image/'));
    if (images.length === 0) { setError('ไม่พบไฟล์รูปในสิ่งที่เลือก'); return; }
    syncAbort.current = false;
    setSync({ phase: 'importing', total: images.length, done: 0, skipped: all.length - images.length, failed: [], facesFound: 0 });
    try {
      if (indexFaces) await loadFaceModels();
      await runImport(openAlbum.id, images.map(file => ({ name: file.name, driveFileId: null, load: async () => file })), indexFaces);
      setSync(s => s ? { ...s, phase: 'done', currentName: undefined } : s);
      await loadPhotos(openAlbum.id);
      fetchAll();
    } catch (e: any) {
      setSync(s => ({ ...(s || { total: 0, done: 0, skipped: 0, failed: [], facesFound: 0 }), phase: 'error', message: e?.message || 'อัปโหลดไม่สำเร็จ' }));
    }
  };

  /** Re-run face detection over photos imported without an index (Phase-1
   *  albums, or a model upgrade). Downloads each display copy back from R2 —
   *  same origin as the API, CORS is open there. */
  const reindexFaces = async (onlyMissing: boolean) => {
    if (!openAlbum) return;
    const targets = onlyMissing ? photos.filter(p => p.face_count === 0) : photos;
    if (targets.length === 0) return;
    setReindexing(true);
    setSync({ phase: 'importing', total: targets.length, done: 0, skipped: 0, failed: [], facesFound: 0 });
    try {
      await loadFaceModels();
      let facesFound = 0;
      for (const p of targets) {
        if (syncAbort.current) break;
        setSync(s => s ? { ...s, currentName: p.drive_file_name || `#${p.id}` } : s);
        try {
          const res = await fetch(p.image_url);
          if (!res.ok) throw new Error(`โหลดรูปไม่ได้ (${res.status})`);
          const bitmap = await createImageBitmap(await res.blob());
          let faces: DetectedFace[] = [];
          try { faces = await describeFaces(bitmap); } finally { bitmap.close(); }
          await axios.put(`${API_BASE}/event-albums/photos/${p.id}/faces`, { faces });
          facesFound += faces.length;
          setSync(s => s ? { ...s, done: s.done + 1, facesFound } : s);
        } catch (err: any) {
          setSync(s => s ? { ...s, done: s.done + 1, failed: [...s.failed, { name: p.drive_file_name || `#${p.id}`, reason: err?.message || 'error' }] } : s);
        }
      }
      setSync(s => s ? { ...s, phase: 'done', currentName: undefined } : s);
      await loadPhotos(openAlbum.id);
      fetchAll();
    } finally { setReindexing(false); }
  };

  const deletePhoto = async (p: Photo) => {
    if (!window.confirm('ลบรูปนี้ออกจากอัลบั้ม?')) return;
    try {
      await axios.delete(`${API_BASE}/event-albums/photos/${p.id}`);
      setPhotos(prev => prev.filter(x => x.id !== p.id));
    } catch (e: any) { setError(e?.response?.data?.message || 'ลบรูปไม่สำเร็จ'); }
  };

  const setCover = async (p: Photo) => {
    if (!openAlbum) return;
    try {
      await axios.put(`${API_BASE}/event-albums/${openAlbum.id}`, {
        // No rounds or folders key on purpose. The API treats "not mentioned"
        // as "leave them alone" and an empty array as "none" — so saying
        // nothing here is what stops picking a cover photo from wiping them.
        name: openAlbum.name, courseId: openAlbum.course_id,
        description: openAlbum.description || null,
        // The display image, not the thumb. The cover is shown as a news card
        // the width of a phone at two or three device pixels each; the thumb is
        // 400px for a grid cell, and stretching it there is what made the
        // picture look soft.
        coverPhotoUrl: p.image_url || p.thumb_url,
        // Omitting this would silently reset a public album to 'booked' —
        // the server coerces an absent visibility to the safe default.
        visibility: openAlbum.visibility === 'public' ? 'public' : 'booked',
      });
      setOpenAlbum({ ...openAlbum, cover_photo_url: p.image_url || p.thumb_url });
      fetchAll();
    } catch (e: any) { setError(e?.response?.data?.message || 'ตั้งรูปปกไม่สำเร็จ'); }
  };

  const [publishAsking, setPublishAsking] = useState<Album | null>(null);
  const [createNewsPost, setCreateNewsPost] = useState(true);
  const doPublish = async (album: Album, isPublished: boolean, withNews: boolean) => {
    try {
      await axios.post(`${API_BASE}/event-albums/${album.id}/publish`, { isPublished, createNewsPost: withNews });
      setPublishAsking(null);
      if (openAlbum?.id === album.id) setOpenAlbum({ ...openAlbum, is_published: isPublished ? 1 : 0 });
      fetchAll();
    } catch (e: any) { setError(e?.response?.data?.message || 'เปลี่ยนสถานะไม่สำเร็จ'); }
  };

  const courseName = (id: number) => courses.find(c => c.id === id)?.name || `#${id}`;
  const progressPct = useMemo(() => (sync && sync.total > 0 ? Math.round((sync.done / sync.total) * 100) : 0), [sync]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <AlbumIcon color="primary" />
          <Typography variant="h5" sx={{ fontWeight: 800 }}>อัลบั้มรูปกิจกรรม</Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 2, fontWeight: 700 }}>
          สร้างอัลบั้ม
        </Button>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      {/* The link itself is shown, not just "copied": a clipboard write can be
          refused by the browser, and a message claiming success over an empty
          clipboard is worse than showing the text to copy by hand. */}
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2, wordBreak: 'break-all' }}>
          {notice}
        </Alert>
      )}
      {!driveApiKey && !loading && (
        <Alert severity="info" sx={{ mb: 2 }}>
          ยังไม่ได้ตั้งค่า Google Drive API key — เพิ่มคีย์ <b>google_drive_api_key</b> ในหน้าตั้งค่าระบบเพื่อเปิดใช้การซิงค์จาก Drive
          (อัปโหลดรูปเองได้ตามปกติ)
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : albums.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
          <Typography sx={{ fontWeight: 700, color: 'text.secondary' }}>
            ยังไม่มีอัลบั้ม — สร้างอัลบั้มแรก เลือกกิจกรรม แล้ววางลิงก์โฟลเดอร์ Google Drive
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={2}>
          {albums.map(a => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={a.id}>
              <Card sx={{ borderRadius: 3, cursor: 'pointer', height: '100%' }} onClick={() => openPhotos(a)}>
                <CardMedia
                  component="div"
                  sx={{
                    height: 140, bgcolor: 'grey.100',
                    backgroundImage: a.preview_url ? `url(${a.preview_url})` : undefined,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {!a.preview_url && <AlbumIcon sx={{ fontSize: 42, color: 'grey.400' }} />}
                </CardMedia>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, lineHeight: 1.3 }} noWrap>{a.name}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block' }} noWrap>
                        {a.course_name || (a.course_id ? courseName(a.course_id) : 'ไม่ผูกกับกิจกรรม')}{roundsSummary(a.rounds)}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={a.is_published ? 'เผยแพร่' : 'ฉบับร่าง'}
                      color={a.is_published ? 'success' : 'default'}
                      sx={{ fontWeight: 700, flexShrink: 0 }}
                    />
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
                    <Chip size="small" variant="outlined" label={`${a.photo_count ?? 0} รูป`} sx={{ fontWeight: 700 }} />
                    <Chip size="small" variant="outlined" icon={<FaceIcon />} label={a.face_count ?? 0} sx={{ fontWeight: 700 }} />
                    <Chip size="small" variant="outlined" color={a.visibility === 'public' ? 'info' : 'default'}
                      label={a.visibility === 'public' ? 'สาธารณะ' : 'เฉพาะผู้จอง'} sx={{ fontWeight: 700 }} />
                    <Box sx={{ flex: 1 }} />
                    <IconButton size="small" onClick={e => { e.stopPropagation(); openEdit(a); }}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={e => { e.stopPropagation(); deleteAlbum(a); }}><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* ── create/edit dialog ── */}
      <Dialog open={editOpen} onClose={() => !saving && setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>{editAlbum ? 'แก้ไขอัลบั้ม' : 'สร้างอัลบั้มใหม่'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="ชื่ออัลบั้ม" fullWidth value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            {/* Optional now. Several activities run at once in the same hall
                and the photographer covers the room, not a timetable — tying
                every album to one of them meant picking whichever was least
                wrong and hiding it from everyone who came for the others. */}
            <TextField select label="กิจกรรม / คลาส (ไม่บังคับ)" fullWidth value={form.courseId || 0}
              onChange={e => setForm({ ...form, courseId: Number(e.target.value), rounds: [] })}
              helperText={form.courseId
                ? 'ครอบครัวที่เคยจองกิจกรรมนี้เท่านั้นที่จะเห็นอัลบั้ม'
                : 'ไม่ผูกกับกิจกรรม — เผยแพร่แล้วทุกคนที่ล็อกอินจะเห็น เหมาะกับงานที่จัดหลายกิจกรรมพร้อมกัน'}>
              <MenuItem value={0}>ไม่ผูกกับกิจกรรม</MenuItem>
              {courses.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            {/* A picked round, not a typed date: the rounds are known, and
                typing one invites a date that matches nothing. "ทุกรอบ" stays
                first because an album covering the whole event is still the
                ordinary case. */}
            {/* Several rounds, because one shoot usually spans them: the
                photographer covers both of Saturday's rounds, or the whole
                weekend, and that is one album families should open. Selecting
                none means the whole activity, which stays the ordinary case —
                said in the helper text rather than as a "ทุกรอบ" option, since
                an option that must be unticked to tick a real round is a
                checkbox pretending to be one. */}
            {form.courseId > 0 && (
            <TextField select label="รอบ (ไม่บังคับ)" fullWidth
              value={form.rounds}
              onChange={e => setForm({
                ...form,
                rounds: typeof e.target.value === 'string'
                  ? (e.target.value as string).split(',').filter(Boolean)
                  : (e.target.value as unknown as string[]),
              })}
              SelectProps={{
                multiple: true,
                renderValue: (selected: unknown) => {
                  const list = selected as string[];
                  if (list.length === 0) return 'ทุกรอบ (ทั้งกิจกรรม)';
                  return (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {list.map(k => {
                        const { slotDate, slotStartTime } = splitRound(k);
                        return <Chip key={k} size="small" label={roundLabel(slotDate, slotStartTime)} />;
                      })}
                    </Box>
                  );
                },
                displayEmpty: true,
              }}
              // displayEmpty means the field always renders something — "ทุกรอบ
              // (ทั้งกิจกรรม)" when nothing is ticked — but MUI decides whether
              // to float the label from whether the VALUE is empty, which it
              // still is. Without this the label sat on top of that text.
              InputLabelProps={{ shrink: true }}
              helperText={form.courseId
                ? (rounds.length > 0
                    ? 'เลือกได้หลายรอบ · ไม่เลือกเลย = ทั้งกิจกรรม'
                    : 'กิจกรรมนี้ยังไม่มีการจองในรอบใด')
                : 'เลือกกิจกรรมก่อน'}>
              {rounds.map(r => {
                const key = roundKey(r.slot_date, r.slot_start_time);
                return (
                  <MenuItem key={key} value={key}>
                    <Checkbox size="small" checked={form.rounds.includes(key)} sx={{ p: 0.5, mr: 0.5 }} />
                    {roundLabel(r.slot_date, r.slot_start_time)} · {r.booking_count} คน
                  </MenuItem>
                );
              })}
            </TextField>
            )}
            {/* Named as what it becomes. Publishing turns the album's name and
                this text into the news post, so calling it "description" hid
                the fact that families read it. */}
            <TextField label="รายละเอียด (ใช้เป็นเนื้อหาโพสข่าวสารด้วย)" fullWidth multiline rows={3} value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
            <TextField select label="การมองเห็น" fullWidth value={form.visibility}
              onChange={e => setForm({ ...form, visibility: e.target.value as 'public' | 'booked' })}
              helperText={form.visibility === 'public'
                ? 'ทุกคนที่มีลิงก์เปิดดูได้เลย ไม่ต้องล็อกอิน — เหมาะกับอัลบั้มที่ลิงก์จากโพสข่าวสาร'
                : 'เห็นเฉพาะบัญชีที่มีการจองกิจกรรมนี้ (ต้องล็อกอิน)'}>
              <MenuItem value="booked">เฉพาะครอบครัวที่จองกิจกรรม</MenuItem>
              <MenuItem value="public">สาธารณะ (ไม่ต้องล็อกอิน)</MenuItem>
            </TextField>
            {/* Several folders, one per line. One shoot rarely lands in one
                folder — two photographers, or a folder per round — and the
                sync walks subfolders too, so the top folder alone is enough. */}
            <TextField label="ลิงก์โฟลเดอร์ Google Drive (บรรทัดละ 1 โฟลเดอร์)" fullWidth multiline minRows={2}
              value={form.driveLinks}
              onChange={e => setForm({ ...form, driveLinks: e.target.value })}
              placeholder={'https://drive.google.com/drive/folders/...\nhttps://drive.google.com/drive/folders/...'}
              helperText='ใส่ได้หลายโฟลเดอร์ · โฟลเดอร์ย่อยข้างในจะถูกซิงค์ด้วย · ทุกโฟลเดอร์ต้องแชร์แบบ "ทุกคนที่มีลิงก์ (Viewer)"' />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={saving} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={saveAlbum} disabled={saving || !form.name.trim()} sx={{ fontWeight: 700, borderRadius: 2 }}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── photos / sync dialog ── */}
      <Dialog open={!!openAlbum} onClose={() => { if (!syncing && !reindexing) setOpenAlbum(null); }} maxWidth="lg" fullWidth>
        {openAlbum && (
          <>
            <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
              {openAlbum.name}
              <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 600 }}>
                {openAlbum.course_name || (openAlbum.course_id ? courseName(openAlbum.course_id) : 'ไม่ผูกกับกิจกรรม')}
                {' · '}{photos.length} รูป
                {folderIdsOf(openAlbum).length > 1 ? ` · ${folderIdsOf(openAlbum).length} โฟลเดอร์ Drive` : ''}
              </Typography>
            </DialogTitle>
            <DialogContent>
              <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }} alignItems="center">
                <Button variant="contained" startIcon={<SyncIcon />} disabled={syncing || reindexing || folderIdsOf(openAlbum).length === 0 || !driveApiKey}
                  onClick={() => runSync(openAlbum)} sx={{ borderRadius: 2, fontWeight: 700 }}>
                  ซิงค์จาก Google Drive
                </Button>
                <Button variant="outlined" startIcon={<UploadIcon />} disabled={syncing || reindexing}
                  onClick={() => uploadInputRef.current?.click()} sx={{ borderRadius: 2, fontWeight: 700 }}>
                  อัปโหลดรูปเอง
                </Button>
                <input ref={uploadInputRef} type="file" hidden multiple accept="image/*"
                  onChange={e => { manualUpload(e.target.files); e.target.value = ''; }} />
                <Button variant="outlined" startIcon={<UploadIcon />} disabled={syncing || reindexing}
                  onClick={() => folderInputRef.current?.click()} sx={{ borderRadius: 2, fontWeight: 700 }}>
                  อัปโหลดทั้งโฟลเดอร์
                </Button>
                {/* webkitdirectory is what makes the picker take a folder. Not
                    in React's typings, hence the spread; `accept` is ignored
                    for folders, so manualUpload filters to images itself. */}
                <input ref={folderInputRef} type="file" hidden multiple {...({ webkitdirectory: '' } as any)}
                  onChange={e => { manualUpload(e.target.files); e.target.value = ''; }} />
                <Tooltip title="สร้างดัชนีใบหน้าใหม่สำหรับรูปที่ยังไม่มีดัชนี (ใช้เมื่ออัลบั้มถูกซิงค์ไว้ก่อนเปิดฟีเจอร์ค้นหาใบหน้า)">
                  <span>
                    <Button variant="outlined" startIcon={<FaceIcon />} disabled={syncing || reindexing || photos.every(p => p.face_count > 0)}
                      onClick={() => reindexFaces(true)} sx={{ borderRadius: 2, fontWeight: 700 }}>
                      สร้างดัชนีใบหน้า ({photos.filter(p => p.face_count === 0).length})
                    </Button>
                  </span>
                </Tooltip>
                <FormControlLabel
                  control={<Checkbox checked={indexFaces} onChange={e => setIndexFaces(e.target.checked)} size="small" />}
                  label={<Typography variant="body2" sx={{ fontWeight: 700 }}>ทำดัชนีใบหน้าตอนนำเข้า</Typography>}
                />
                <Box sx={{ flex: 1 }} />
                {openAlbum.is_published ? (
                  <Button variant="outlined" color="warning" startIcon={<UnpublishIcon />} disabled={syncing || reindexing}
                    onClick={() => doPublish(openAlbum, false, false)} sx={{ borderRadius: 2, fontWeight: 700 }}>
                    ปิดการเผยแพร่
                  </Button>
                ) : (
                  <Button variant="contained" color="success" startIcon={<PublishIcon />} disabled={syncing || reindexing || photos.length === 0}
                    onClick={() => { setCreateNewsPost(!openAlbum.news_feed_id); setPublishAsking(openAlbum); }} sx={{ borderRadius: 2, fontWeight: 700 }}>
                    เผยแพร่อัลบั้ม
                  </Button>
                )}

                {/* Separate from publishing on purpose. Publishing decides who
                    SEES the album in their list; this link decides who can open
                    it without being in that list at all — a coach, a
                    grandparent, a school that sent a group. Neither implies the
                    other, so they are two controls rather than one setting. */}
                <Button
                  variant="outlined" startIcon={<LinkIcon />} disabled={shareBusy || photos.length === 0}
                  onClick={() => void copyShareLink(openAlbum)} sx={{ borderRadius: 2, fontWeight: 700 }}
                >
                  {openAlbum.share_token ? 'คัดลอกลิงก์แชร์' : 'สร้างลิงก์แชร์'}
                </Button>
                {openAlbum.share_token && (
                  <Button
                    variant="text" color="error" disabled={shareBusy}
                    onClick={() => void revokeShareLink(openAlbum)} sx={{ borderRadius: 2, fontWeight: 700 }}
                  >
                    ยกเลิกลิงก์
                  </Button>
                )}
              </Stack>

              {openAlbum.share_token && (
                <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                  มีลิงก์แชร์อยู่ — ใครก็ตามที่ได้ลิงก์นี้เปิดดูอัลบั้มได้โดยไม่ต้องล็อกอิน
                  และอัลบั้มจะไม่ไปโผล่ในรายการของใคร
                </Alert>
              )}

              {sync && (
                <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2 }}>
                  {sync.phase === 'listing' && <Typography variant="body2" sx={{ fontWeight: 700 }}>กำลังอ่านรายชื่อไฟล์จาก Google Drive...</Typography>}
                  {sync.phase === 'importing' && (
                    <>
                      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 800 }}>
                          กำลังนำเข้า {sync.done}/{sync.total}{sync.currentName ? ` · ${sync.currentName}` : ''}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                          ใบหน้า {sync.facesFound}{sync.skipped > 0 ? ` · ข้าม ${sync.skipped}` : ''}
                        </Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={progressPct} sx={{ borderRadius: 1, height: 8 }} />
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
                        <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 700 }}>
                          อย่าปิดแท็บนี้ระหว่างนำเข้า — ปิดแล้วกดซิงค์ใหม่ได้ ระบบจะทำต่อจากที่ค้าง
                        </Typography>
                        <Button size="small" color="error" onClick={() => { syncAbort.current = true; }} sx={{ fontWeight: 700 }}>หยุด</Button>
                      </Stack>
                    </>
                  )}
                  {sync.phase === 'done' && (
                    <Typography variant="body2" sx={{ fontWeight: 800, color: 'success.main' }}>
                      เสร็จแล้ว — นำเข้า {sync.done - sync.failed.length} รูป · ข้าม {sync.skipped} · ใบหน้า {sync.facesFound}
                      {sync.failed.length > 0 ? ` · ล้มเหลว ${sync.failed.length}` : ''}
                    </Typography>
                  )}
                  {sync.phase === 'error' && <Alert severity="error">{sync.message}</Alert>}
                  {sync.failed.length > 0 && (
                    <Box sx={{ mt: 1, maxHeight: 120, overflowY: 'auto' }}>
                      {sync.failed.map((f, i) => (
                        <Typography key={i} variant="caption" sx={{ display: 'block', color: 'error.main', fontWeight: 600 }}>
                          {f.name}: {f.reason}
                        </Typography>
                      ))}
                    </Box>
                  )}
                </Paper>
              )}

              {photosLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
              ) : photos.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600, textAlign: 'center', py: 4 }}>
                  ยังไม่มีรูปในอัลบั้ม — ซิงค์จาก Drive หรืออัปโหลดรูปเอง
                </Typography>
              ) : (
                <Grid container spacing={1}>
                  {photos.map(p => (
                    <Grid item xs={4} sm={3} md={2} key={p.id}>
                      <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', aspectRatio: '1', bgcolor: 'grey.100',
                        '&:hover .photo-actions': { opacity: 1 } }}>
                        <img src={p.thumb_url || p.image_url} alt="" loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        {p.face_count > 0 && (
                          <Chip size="small" icon={<FaceIcon />} label={p.face_count}
                            sx={{ position: 'absolute', bottom: 4, left: 4, height: 20, fontWeight: 700, bgcolor: 'rgba(255,255,255,0.85)' }} />
                        )}
                        <Stack direction="row" className="photo-actions" spacing={0.5}
                          sx={{ position: 'absolute', top: 4, right: 4, opacity: 0, transition: 'opacity .15s' }}>
                          <Tooltip title="ตั้งเป็นรูปปก">
                            <IconButton size="small" onClick={() => setCover(p)} sx={{ bgcolor: 'rgba(255,255,255,0.9)' }}>
                              <CoverIcon fontSize="small" color={(openAlbum.cover_photo_url === (p.thumb_url || p.image_url)) ? 'warning' : 'inherit'} />
                            </IconButton>
                          </Tooltip>
                          <IconButton size="small" onClick={() => deletePhoto(p)} sx={{ bgcolor: 'rgba(255,255,255,0.9)' }}>
                            <DeleteIcon fontSize="small" color="error" />
                          </IconButton>
                        </Stack>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOpenAlbum(null)} disabled={syncing || reindexing} sx={{ fontWeight: 700 }}>ปิด</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── publish confirm ── */}
      <Dialog open={!!publishAsking} onClose={() => setPublishAsking(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>เผยแพร่อัลบั้ม?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            {publishAsking?.visibility === 'public'
              ? 'อัลบั้มนี้ตั้งเป็นสาธารณะ — ทุกคนที่มีลิงก์จะเปิดดูได้เลยโดยไม่ต้องล็อกอิน'
              : `ครอบครัวที่เคยจอง "${publishAsking ? (publishAsking.course_name || courseName(publishAsking.course_id)) : ''}" จะเห็นอัลบั้มนี้ในแอป`}
          </Typography>
          {!publishAsking?.news_feed_id && (
            <FormControlLabel sx={{ mt: 1 }}
              control={<Checkbox checked={createNewsPost} onChange={e => setCreateNewsPost(e.target.checked)} />}
              label={<Typography variant="body2" sx={{ fontWeight: 700 }}>สร้างโพสข่าวสารพร้อมลิงก์ไปอัลบั้ม</Typography>}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPublishAsking(null)} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" color="success" sx={{ fontWeight: 700, borderRadius: 2 }}
            onClick={() => publishAsking && doPublish(publishAsking, true, createNewsPost && !publishAsking.news_feed_id)}>
            เผยแพร่
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EventAlbumManagement;

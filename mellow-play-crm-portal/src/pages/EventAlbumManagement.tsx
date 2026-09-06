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
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';
import { resizeToJpeg, uploadRawFile } from '../utils/imageUpload';
import { describeFaces, loadFaceModels, DetectedFace } from '../utils/faceIndexer';

const API_BASE = `${API_URL}/api/v1/admin`;

/**
 * อัลบั้มรูปกิจกรรม — bulk event photos, imported from a shared Google Drive
 * folder and published to families who booked the course.
 *
 * The entire import pipeline runs in THIS browser tab: list the Drive folder
 * (API key, public folder), download each image, downscale to a display copy
 * + thumbnail (the size-control requirement — R2 never stores camera-size
 * files), detect faces for the search index, upload, register metadata. The
 * Worker only stores results, so the tab must stay open during a sync; the
 * (album_id, drive_file_id) unique key makes re-running it resume where it
 * stopped.
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
  id: number; name: string; description?: string | null; course_id: number;
  /** Every round this album covers. Empty means the whole activity. */
  rounds?: { slot_date: string; slot_start_time?: string | null }[];
  drive_folder_id?: string | null; cover_photo_url?: string | null;
  is_published: number; news_feed_id?: number | null; course_name?: string;
  photo_count?: number; face_count?: number; created_at?: string;
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

  // create/edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editAlbum, setEditAlbum] = useState<Album | null>(null);
  const [form, setForm] = useState<{
    name: string; courseId: number; rounds: string[]; description: string; driveLink: string;
  }>({ name: '', courseId: 0, rounds: [], description: '', driveLink: '' });
  /**
   * The rounds of the course now chosen, for the round picker.
   *
   * An event runs several rounds in one day and the photos differ per round, so
   * a date on its own cannot say which album is which. Read from the bookings,
   * so the list is the rounds that actually ran with people in them.
   */
  const [rounds, setRounds] = useState<{ slot_date: string; slot_start_time: string | null; booking_count: number }[]>([]);
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
    setForm({ name: '', courseId: courses[0]?.id || 0, rounds: [], description: '', driveLink: '' });
    setEditOpen(true);
  };
  const openEdit = (a: Album) => {
    setEditAlbum(a);
    setForm({
      name: a.name, courseId: a.course_id,
      rounds: (a.rounds || []).map(r => roundKey(r.slot_date, r.slot_start_time)),
      description: a.description || '',
      driveLink: a.drive_folder_id ? `https://drive.google.com/drive/folders/${a.drive_folder_id}` : '',
    });
    setEditOpen(true);
  };

  const saveAlbum = async () => {
    if (!form.name.trim() || !form.courseId) return;
    const driveFolderId = parseDriveFolderId(form.driveLink);
    if (form.driveLink.trim() && !driveFolderId) {
      setError('ลิงก์ Google Drive ไม่ถูกต้อง — ต้องเป็นลิงก์โฟลเดอร์ (…/drive/folders/…)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(), courseId: form.courseId,
        rounds: form.rounds,
        description: form.description || null, driveFolderId,
        coverPhotoUrl: editAlbum?.cover_photo_url || null,
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

  const processBitmapToPhoto = async (
    bitmap: ImageBitmap, albumId: number, name: string,
    driveFileId: string | null, withFaces: boolean,
  ) => {
    const display = await resizeToJpeg(bitmap, DISPLAY_MAX, DISPLAY_QUALITY);
    const thumb = await resizeToJpeg(bitmap, THUMB_MAX, THUMB_QUALITY);
    if (!display || !thumb) throw new Error('แปลงรูปไม่สำเร็จ');

    let faces: DetectedFace[] = [];
    if (withFaces) {
      const displayBitmap = await createImageBitmap(display.blob);
      try { faces = await describeFaces(displayBitmap); }
      finally { displayBitmap.close(); }
    }

    const base = name.replace(/\.[^.]+$/, '') || 'photo';
    const folder = `event-albums/${albumId}`;
    const displayUp = await uploadRawFile(new File([display.blob], `${base}.jpg`, { type: 'image/jpeg' }), folder);
    const thumbUp = await uploadRawFile(new File([thumb.blob], `${base}-thumb.jpg`, { type: 'image/jpeg' }), folder);
    if (!displayUp || !thumbUp) throw new Error('อัปโหลดไม่สำเร็จ');

    return {
      imageUrl: displayUp.url, thumbUrl: thumbUp.url,
      width: display.width, height: display.height, sizeBytes: display.blob.size,
      driveFileId, driveFileName: driveFileId ? name : null, faces,
    };
  };

  const flushPending = async (albumId: number, pending: any[]) => {
    if (pending.length === 0) return { inserted: 0, skipped: 0 };
    const res = await axios.post(`${API_BASE}/event-albums/${albumId}/photos`, { photos: pending });
    return { inserted: res.data.inserted ?? 0, skipped: res.data.skipped ?? 0 };
  };

  const runSync = async (album: Album) => {
    if (!album.drive_folder_id) { setError('อัลบั้มนี้ยังไม่ได้ใส่ลิงก์โฟลเดอร์ Google Drive (แก้ไขอัลบั้มก่อน)'); return; }
    if (!driveApiKey) { setError('ยังไม่ได้ตั้งค่า Google Drive API key ในหน้าตั้งค่าระบบ (คีย์ google_drive_api_key)'); return; }
    syncAbort.current = false;
    setError('');
    setSync({ phase: 'listing', total: 0, done: 0, skipped: 0, failed: [], facesFound: 0 });

    try {
      if (indexFaces) await loadFaceModels();

      // 1) list the folder (paginated)
      const files: { id: string; name: string; mimeType: string }[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q: `'${album.drive_folder_id}' in parents and trashed=false`,
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
        files.push(...(data.files || []));
        pageToken = data.nextPageToken;
      } while (pageToken);

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

      let pending: any[] = [];
      let facesFound = 0;
      for (const f of todo) {
        if (syncAbort.current) break;
        setSync(s => s ? { ...s, currentName: f.name } : s);
        try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${driveApiKey}`);
          if (!res.ok) throw new Error(`ดาวน์โหลดไม่ได้ (${res.status})`);
          const blob = await res.blob();
          const bitmap = await createImageBitmap(blob);
          try {
            const photo = await processBitmapToPhoto(bitmap, album.id, f.name, f.id, indexFaces);
            facesFound += photo.faces.length;
            pending.push(photo);
          } finally { bitmap.close(); }

          if (pending.length >= FLUSH_EVERY) {
            await flushPending(album.id, pending);
            pending = [];
          }
          setSync(s => s ? { ...s, done: s.done + 1, facesFound } : s);
        } catch (err: any) {
          setSync(s => s ? { ...s, done: s.done + 1, failed: [...s.failed, { name: f.name, reason: err?.message || 'error' }] } : s);
        }
      }
      await flushPending(album.id, pending);

      setSync(s => s ? { ...s, phase: 'done', currentName: undefined } : s);
      await loadPhotos(album.id);
      fetchAll();
    } catch (e: any) {
      setSync(s => ({ ...(s || { total: 0, done: 0, skipped: 0, failed: [], facesFound: 0 }), phase: 'error', message: e?.message || 'ซิงค์ไม่สำเร็จ' }));
    }
  };

  const manualUpload = async (fileList: FileList | null) => {
    if (!openAlbum || !fileList || fileList.length === 0) return;
    syncAbort.current = false;
    setSync({ phase: 'importing', total: fileList.length, done: 0, skipped: 0, failed: [], facesFound: 0 });
    try {
      if (indexFaces) await loadFaceModels();
      let pending: any[] = [];
      let facesFound = 0;
      for (const file of Array.from(fileList)) {
        if (syncAbort.current) break;
        setSync(s => s ? { ...s, currentName: file.name } : s);
        try {
          const bitmap = await createImageBitmap(file);
          try {
            const photo = await processBitmapToPhoto(bitmap, openAlbum.id, file.name, null, indexFaces);
            facesFound += photo.faces.length;
            pending.push(photo);
          } finally { bitmap.close(); }
          if (pending.length >= FLUSH_EVERY) { await flushPending(openAlbum.id, pending); pending = []; }
          setSync(s => s ? { ...s, done: s.done + 1, facesFound } : s);
        } catch (err: any) {
          setSync(s => s ? { ...s, done: s.done + 1, failed: [...s.failed, { name: file.name, reason: err?.message || 'error' }] } : s);
        }
      }
      await flushPending(openAlbum.id, pending);
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
        // No rounds key on purpose. The API treats "not mentioned" as "leave
        // them alone" and an empty array as "none" — so saying nothing here is
        // what stops picking a cover photo from wiping the album's rounds.
        name: openAlbum.name, courseId: openAlbum.course_id,
        description: openAlbum.description || null,
        driveFolderId: openAlbum.drive_folder_id || null,
        coverPhotoUrl: p.thumb_url || p.image_url,
      });
      setOpenAlbum({ ...openAlbum, cover_photo_url: p.thumb_url || p.image_url });
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
                    backgroundImage: a.cover_photo_url ? `url(${a.cover_photo_url})` : undefined,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {!a.cover_photo_url && <AlbumIcon sx={{ fontSize: 42, color: 'grey.400' }} />}
                </CardMedia>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 800, lineHeight: 1.3 }} noWrap>{a.name}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block' }} noWrap>
                        {a.course_name || courseName(a.course_id)}{roundsSummary(a.rounds)}
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
            <TextField select label="กิจกรรม / คลาส" fullWidth value={form.courseId || ''}
              onChange={e => setForm({ ...form, courseId: Number(e.target.value), rounds: [] })}
              helperText="ครอบครัวที่เคยจองกิจกรรมนี้เท่านั้นที่จะเห็นอัลบั้ม">
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
            <TextField label="คำอธิบาย (ไม่บังคับ)" fullWidth multiline rows={2} value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
            <TextField label="ลิงก์โฟลเดอร์ Google Drive" fullWidth value={form.driveLink}
              onChange={e => setForm({ ...form, driveLink: e.target.value })}
              placeholder="https://drive.google.com/drive/folders/..."
              helperText='โฟลเดอร์ต้องแชร์แบบ "ทุกคนที่มีลิงก์ (Viewer)"' />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)} disabled={saving} sx={{ fontWeight: 700 }}>ยกเลิก</Button>
          <Button variant="contained" onClick={saveAlbum} disabled={saving || !form.name.trim() || !form.courseId} sx={{ fontWeight: 700, borderRadius: 2 }}>
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
                {openAlbum.course_name || courseName(openAlbum.course_id)} · {photos.length} รูป
              </Typography>
            </DialogTitle>
            <DialogContent>
              <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }} alignItems="center">
                <Button variant="contained" startIcon={<SyncIcon />} disabled={syncing || reindexing || !openAlbum.drive_folder_id || !driveApiKey}
                  onClick={() => runSync(openAlbum)} sx={{ borderRadius: 2, fontWeight: 700 }}>
                  ซิงค์จาก Google Drive
                </Button>
                <Button variant="outlined" startIcon={<UploadIcon />} disabled={syncing || reindexing}
                  onClick={() => uploadInputRef.current?.click()} sx={{ borderRadius: 2, fontWeight: 700 }}>
                  อัปโหลดรูปเอง
                </Button>
                <input ref={uploadInputRef} type="file" hidden multiple accept="image/*"
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
              </Stack>

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
            ครอบครัวที่เคยจอง "{publishAsking && (publishAsking.course_name || courseName(publishAsking.course_id))}" จะเห็นอัลบั้มนี้ในแอป
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

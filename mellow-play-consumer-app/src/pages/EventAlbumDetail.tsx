import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, CheckSquare, ChevronLeft, Download, Loader2, ScanFace, X, Images } from 'lucide-react';
import apiClient from '../utils/apiClient';
import SkeletonImage from '../components/SkeletonImage';
import { downloadBlobUrl, saveMany, saveViaShare } from '../utils/mediaSave';
import { useTranslation } from '../LanguageContext';
import { formatCustomDate } from '../utils/dateFormat';

interface AlbumMeta {
  id: number; name: string; description?: string | null; slot_date?: string | null;
  course_name: string; photo_count: number; face_count: number;
}
interface Photo { id: number; image_url: string; thumb_url?: string | null; width?: number; height?: number; distance?: number }

/** The long side each stored size was cut to, mirroring the CRM's sync. */
const THUMB_LONG = 400;
const DISPLAY_LONG = 1920;

/**
 * Offer the browser both stored sizes and let it pick per cell and per screen.
 *
 * The widths given are each image's SHORT side, not its long one, because
 * these cells are square and object-cover throws the long side away: a 400px
 * thumb of a 3:2 photo has only 267px left to fill the square, and describing
 * it as 400 is what let a soft image win a cell it could not fill. Understating
 * it this way makes a retina desktop reach for the display image exactly when
 * the thumb would have been stretched, and leaves phones on the small file.
 */
const shortSide = (p: Photo, long: number) =>
  p.width && p.height ? Math.round(long * Math.min(p.width, p.height) / Math.max(p.width, p.height)) : long;

const srcSetFor = (p: Photo) =>
  p.thumb_url ? `${p.thumb_url} ${shortSide(p, THUMB_LONG)}w, ${p.image_url} ${shortSide(p, DISPLAY_LONG)}w` : undefined;

/** Roughly one cell, tracking the column counts on the grid below. */
const GRID_SIZES = '(min-width: 1280px) 16vw, (min-width: 1024px) 19vw, (min-width: 640px) 24vw, 32vw';

const PAGE = 60;

/**
 * One event album: infinite-scroll photo grid, lightbox, and face search.
 *
 * Face search runs on-device: the reference photo the parent picks is never
 * uploaded — face-api (lazy-loaded, ~7MB of model weights the first time)
 * computes a 512-byte embedding locally and only that is sent. Matches
 * replace the grid until cleared.
 */
const EventAlbumDetail: React.FC = () => {
  const navigate = useNavigate();
  // Two ways in, one page. /event-albums/:id is the signed-in route; the album
  // is found by id and the server checks the account booked the course.
  // /shared-albums/:token is the link staff hand out, where the token itself is
  // the permission and there may be no account at all. Only the two URLs below
  // differ — everything the page does with the album is the same, and keeping
  // it one component is what stops the shared view quietly drifting behind.
  const { id, token } = useParams<{ id: string; token: string }>();
  const base = token ? `/shared-albums/${token}` : `/event-albums/${id}`;
  const key = token || id;
  const { lang } = useTranslation();
  const t = (th: string, en: string) => (lang === 'en' ? en : th);

  const [album, setAlbum] = useState<AlbumMeta | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  // Whether the full-size copy has decoded; until then the lightbox shows the
  // (already cached) thumbnail blurred up, so opening a photo is never a
  // black screen while the 1920px file downloads.
  const [lightboxLoaded, setLightboxLoaded] = useState(false);
  const openLightbox = (p: Photo) => { setLightboxLoaded(false); setLightbox(p); };

  // ── multi-select (long-press to enter, tap to toggle) ─────────────────────
  // Capped like the journey Album page: the share sheet and the browser both
  // get unhappy past a few dozen files at once.
  const MAX_SELECTION = 30;
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Blob fetches are the slow part on a phone; this feeds the progress label.
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const longPress = useRef<{ timer: number; x: number; y: number } | null>(null);

  const toggleSelect = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX_SELECTION) next.add(id);
    return next;
  });
  const enterSelectMode = (firstId?: number) => {
    setSelectMode(true);
    if (firstId != null) setSelectedIds(new Set([firstId]));
    (navigator as any).vibrate?.(10);
  };
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };

  // A long-press is a press that neither ends nor travels: scrolling with a
  // thumb resting on a tile must never flip the page into select mode.
  const pressStart = (id: number) => (e: React.PointerEvent) => {
    if (selectMode) return;
    const x = e.clientX, y = e.clientY;
    const timer = window.setTimeout(() => { longPress.current = null; enterSelectMode(id); }, 450);
    longPress.current = { timer, x, y };
  };
  const pressCancel = (e?: React.PointerEvent) => {
    if (!longPress.current) return;
    if (e && Math.hypot(e.clientX - longPress.current.x, e.clientY - longPress.current.y) < 10) return;
    window.clearTimeout(longPress.current.timer);
    longPress.current = null;
  };
  const pressEnd = () => {
    if (!longPress.current) return;
    window.clearTimeout(longPress.current.timer);
    longPress.current = null;
  };

  const saveSelected = async () => {
    const urls = shown.filter(p => selectedIds.has(p.id)).map(p => p.image_url);
    if (urls.length === 0) return;
    setSaveProgress({ done: 0, total: urls.length });
    try {
      await saveMany(urls, (done, total) => setSaveProgress({ done, total }));
    } finally {
      setSaveProgress(null);
      exitSelectMode();
    }
  };

  /**
   * One photo, to the device. iOS has no download UX — the share sheet's
   * "Save Image" IS saving there, so that path goes first; desktop falls
   * back to the cross-origin-safe blob download.
   */
  const savePhoto = async (p: Photo) => {
    if (await saveViaShare([p.image_url])) return;
    await downloadBlobUrl(p.image_url, `photo-${p.id}.jpg`);
  };

  // face search state
  const [matches, setMatches] = useState<Photo[] | null>(null);
  const [searchState, setSearchState] = useState<'' | 'loading-model' | 'detecting' | 'searching'>('');
  const [searchError, setSearchError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadPage = useCallback(async (after: number) => {
    const res = await apiClient.get(base, { params: { after, limit: PAGE } });
    if (!res.data.success) throw new Error(res.data.message);
    return res.data as { album: AlbumMeta; photos: Photo[] };
  }, [base]);

  useEffect(() => {
    if (!key) return;
    loadPage(0)
      .then(data => {
        setAlbum(data.album);
        setPhotos(data.photos);
        setHasMore(data.photos.length === PAGE);
      })
      .catch(() => setAlbum(null));
  }, [id, loadPage]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || matches !== null) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(async entries => {
      if (!entries[0].isIntersecting || loadingMore || photos.length === 0) return;
      setLoadingMore(true);
      try {
        const data = await loadPage(photos[photos.length - 1].id);
        setPhotos(prev => [...prev, ...data.photos]);
        setHasMore(data.photos.length === PAGE);
      } catch { setHasMore(false); }
      finally { setLoadingMore(false); }
    }, { rootMargin: '600px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, photos, loadPage, matches]);

  const runFaceSearch = async (file: File) => {
    setSearchError('');
    try {
      setSearchState('loading-model');
      const { embedReferencePhoto } = await import('../utils/faceEmbedding');
      setSearchState('detecting');
      const embedding = await embedReferencePhoto(file);
      if (!embedding) {
        setSearchError(t('ไม่พบใบหน้าในรูปนี้ ลองรูปที่เห็นหน้าชัดๆ ตรงๆ', 'No face found — try a clear, front-facing photo'));
        setSearchState('');
        return;
      }
      setSearchState('searching');
      const res = await apiClient.post(`${base}/face-search`, { embedding });
      if (!res.data.success) throw new Error(res.data.message);
      setMatches(res.data.matches);
    } catch (e: any) {
      setSearchError(e?.response?.data?.message || e?.message || t('ค้นหาไม่สำเร็จ', 'Search failed'));
    } finally { setSearchState(''); }
  };

  const shown = matches ?? photos;
  const searching = searchState !== '';

  if (album === undefined) {
    // Skeleton of the real layout — header lines plus a full grid of pulsing
    // tiles — instead of a lone spinner, so the page reads as "photos are
    // coming" and nothing jumps when they do.
    return (
      <div className="pb-24 min-h-screen bg-[#fbfaf7]">
        <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform shrink-0">
            <ChevronLeft size={24} className="mr-0.5" />
          </button>
          <div className="min-w-0 flex-1 animate-pulse space-y-1.5">
            <div className="h-4 bg-slate-200 rounded-full w-40" />
            <div className="h-3 bg-slate-100 rounded-full w-56" />
          </div>
        </header>
        <main className="p-4">
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-xl bg-slate-200 animate-pulse" />
            ))}
          </div>
        </main>
      </div>
    );
  }
  if (album === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#fbfaf7]">
        <div className="max-w-sm w-full bg-white rounded-3xl shadow-sm p-6 text-center space-y-2">
          <Images size={40} className="mx-auto text-slate-300" />
          <h1 className="text-[17px] font-black text-slate-800">{t('ไม่พบอัลบั้มนี้', 'Album not found')}</h1>
          <p className="text-sm font-medium text-slate-500 leading-relaxed">
            {t('อัลบั้มอาจยังไม่เผยแพร่ หรือเปิดได้เฉพาะครอบครัวที่จองกิจกรรมนั้น', 'It may be unpublished, or visible only to families who booked the activity')}
          </p>
          {/* A guest hitting a booked-only album is the likeliest case here —
              logging in is the fix, so offer it directly. */}
          {!localStorage.getItem('mellow_token') && (
            <button onClick={() => navigate(`/login?redirect=${encodeURIComponent(`/event-albums/${id}`)}`)}
              className="mt-2 px-6 py-2.5 bg-mellow-purple text-white rounded-2xl text-sm font-black w-full">
              {t('เข้าสู่ระบบเพื่อดูอัลบั้ม', 'Log in to view')}
            </button>
          )}
          <button onClick={() => navigate(-1)} className="mt-2 px-6 py-2.5 bg-slate-100 text-slate-600 rounded-2xl text-sm font-black">
            {t('ย้อนกลับ', 'Back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 min-h-screen bg-[#fbfaf7]">
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform shrink-0">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[16px] font-black tracking-tight leading-none mb-0.5 truncate">{album.name}</h1>
          <span className="text-[12px] font-bold text-slate-500 truncate block">
            {album.course_name}{album.slot_date ? ` · ${formatCustomDate(album.slot_date, lang, 'full')}` : ''} · {album.photo_count} {t('รูป', 'photos')}
          </span>
        </div>
        {photos.length > 0 && !selectMode && (
          <button
            onClick={() => enterSelectMode()}
            title={t('เลือกหลายรูป', 'Select photos')}
            className="shrink-0 w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center active:scale-95 transition-transform"
          >
            <CheckSquare size={18} />
          </button>
        )}
        {selectMode && (
          <button
            onClick={exitSelectMode}
            className="shrink-0 px-3.5 h-10 rounded-full bg-slate-100 text-slate-600 text-xs font-black flex items-center gap-1 active:scale-95 transition-transform"
          >
            <X size={14} /> {t('ยกเลิก', 'Cancel')}
          </button>
        )}
        {album.face_count > 0 && !selectMode && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={searching}
            className="shrink-0 px-3.5 h-10 rounded-full bg-mellow-purple text-white text-xs font-black flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
          >
            <ScanFace size={16} />
            {t('ค้นหาใบหน้า', 'Face search')}
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) runFaceSearch(f); e.target.value = ''; }} />
      </header>

      <main className="p-4">
        {album.description && matches === null && (
          <p className="text-sm font-medium text-slate-500 leading-relaxed mb-3 px-1">{album.description}</p>
        )}

        {searching && (
          <div className="mb-3 px-4 py-3 bg-white rounded-2xl shadow-sm flex items-center gap-3">
            <Loader2 size={18} className="animate-spin text-mellow-purple shrink-0" />
            <p className="text-xs font-bold text-slate-600">
              {searchState === 'loading-model' && t('กำลังโหลดตัวค้นหาใบหน้า (ครั้งแรกอาจใช้เวลาสักครู่ ~7MB)...', 'Loading face model (first time ~7MB)...')}
              {searchState === 'detecting' && t('กำลังอ่านใบหน้าจากรูปของคุณ (รูปไม่ถูกส่งขึ้นระบบ)...', 'Reading the face on your device (photo never uploaded)...')}
              {searchState === 'searching' && t('กำลังค้นหารูปที่มีใบหน้าคล้ายกัน...', 'Searching matching photos...')}
            </p>
          </div>
        )}
        {searchError && (
          <div className="mb-3 px-4 py-3 bg-red-50 rounded-2xl">
            <p className="text-xs font-bold text-mellow-red">{searchError}</p>
          </div>
        )}
        {matches !== null && !searching && (
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-sm font-black text-slate-700">
              {matches.length > 0
                ? `${t('พบ', 'Found')} ${matches.length} ${t('รูป', 'photos')}`
                : t('ไม่พบรูปที่มีใบหน้าคล้ายกัน ลองรูปอ้างอิงอื่น', 'No matches — try another reference photo')}
            </p>
            <button onClick={() => { setMatches(null); setSearchError(''); }}
              className="px-3 py-1.5 bg-slate-100 rounded-full text-xs font-black text-slate-600 flex items-center gap-1 active:scale-95">
              <X size={14} /> {t('ล้างการค้นหา', 'Clear')}
            </button>
          </div>
        )}

        {/* Three columns is a phone layout. Left at three on a desktop the
            cells grow past 350px and the thumb is asked for pixels it never
            had; more columns on a wider screen keeps every cell near the size
            the thumb was cut for. */}
        {selectMode && (
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-sm font-black text-slate-700">
              {t('เลือกแล้ว', 'Selected')} {selectedIds.size}{selectedIds.size >= MAX_SELECTION ? ` (${t('สูงสุด', 'max')})` : ''}
            </p>
            <button
              onClick={() => setSelectedIds(new Set(shown.slice(0, MAX_SELECTION).map(p => p.id)))}
              className="px-3 py-1.5 bg-slate-100 rounded-full text-xs font-black text-slate-600 active:scale-95"
            >
              {t('เลือกทั้งหมด', 'Select all')}
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
          {shown.map(p => {
            const isSelected = selectedIds.has(p.id);
            return (
            // The iOS image callout is suppressed on the TILES only — here a
            // long press means "start selecting", and the callout fighting the
            // gesture is what made it feel broken. The lightbox keeps the
            // native callout so long-press-to-save still works there.
            <button key={p.id}
              onClick={() => selectMode ? toggleSelect(p.id) : openLightbox(p)}
              onPointerDown={pressStart(p.id)}
              onPointerUp={pressEnd}
              onPointerCancel={pressEnd}
              onPointerMove={pressCancel}
              onContextMenu={e => e.preventDefault()}
              style={{ WebkitTouchCallout: 'none' } as React.CSSProperties}
              className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 active:scale-95 transition-transform select-none">
              <SkeletonImage src={p.thumb_url || p.image_url}
                srcSet={srcSetFor(p)} sizes={GRID_SIZES}
                className={`object-cover ${isSelected ? 'opacity-60' : ''}`} />
              {selectMode && (
                <span className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 ${
                  isSelected ? 'bg-mellow-purple border-mellow-purple text-white' : 'bg-white/70 border-white'}`}>
                  {isSelected && <Check size={14} strokeWidth={3.5} />}
                </span>
              )}
            </button>
            );
          })}
          {/* Loading more looks like more photos arriving, not a spinner
              interrupting the grid. */}
          {loadingMore && Array.from({ length: 6 }).map((_, i) => (
            <div key={`sk-${i}`} className="aspect-square rounded-xl bg-slate-200 animate-pulse" />
          ))}
        </div>

        {matches === null && hasMore && <div ref={sentinelRef} className="h-8" />}
        {shown.length === 0 && matches === null && (
          <p className="text-center text-sm font-bold text-slate-400 py-12">{t('ยังไม่มีรูปในอัลบั้ม', 'No photos yet')}</p>
        )}

        {album.face_count > 0 && matches === null && (
          <p className="text-[11px] font-medium text-slate-400 text-center mt-6 px-6 leading-relaxed">
            {t('การค้นหาด้วยใบหน้าประมวลผลรูปอ้างอิงบนเครื่องของคุณเท่านั้น รูปที่เลือกจะไม่ถูกอัปโหลด',
               'Face search processes your reference photo on your device only — it is never uploaded')}
          </p>
        )}
      </main>

      {/* Bulk-save bar — pinned so it stays reachable however deep the grid
          has been scrolled. */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-4 bg-white/95 backdrop-blur-md border-t border-slate-100">
          <button
            onClick={() => void saveSelected()}
            disabled={!!saveProgress}
            className="w-full py-3.5 bg-mellow-purple text-white rounded-2xl text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-70"
          >
            {saveProgress
              ? (<><Loader2 size={16} className="animate-spin" /> {t('กำลังเตรียมรูป', 'Preparing')} {saveProgress.done}/{saveProgress.total}</>)
              : (<><Download size={16} /> {t('บันทึก', 'Save')} {selectedIds.size} {t('รูป', 'photos')}</>)}
          </button>
        </div>
      )}

      {/* lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setLightbox(null)}>
          <div className="flex justify-between items-center p-4">
            <button onClick={e => { e.stopPropagation(); void savePhoto(lightbox); }}
              className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-white active:scale-90">
              <Download size={20} />
            </button>
            <button onClick={() => setLightbox(null)}
              className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-white active:scale-90">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-2 min-h-0 relative">
            {!lightboxLoaded && lightbox.thumb_url && (
              <img src={lightbox.thumb_url} alt=""
                className="absolute inset-0 w-full h-full object-contain p-2 blur-sm scale-105 opacity-70" />
            )}
            {!lightboxLoaded && (
              <Loader2 className="absolute animate-spin text-white/80" size={28} />
            )}
            {/* Tapping the photo itself does NOT close the lightbox (only the
                backdrop does): a long press releasing over the image must not
                dismiss it, or iOS's native "Save to Photos" callout — which we
                deliberately leave enabled here — closes the viewer under the
                user's finger. */}
            <img src={lightbox.image_url} alt=""
              onClick={e => e.stopPropagation()}
              onLoad={() => setLightboxLoaded(true)}
              onError={() => setLightboxLoaded(true)}
              className={`max-w-full max-h-full object-contain rounded-lg relative transition-opacity duration-200 ${lightboxLoaded ? 'opacity-100' : 'opacity-0'}`} />
          </div>
        </div>
      )}
    </div>
  );
};

export default EventAlbumDetail;

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download, Loader2, ScanFace, X, Images } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import { formatCustomDate } from '../utils/dateFormat';

interface AlbumMeta {
  id: number; name: string; description?: string | null; slot_date?: string | null;
  course_name: string; photo_count: number; face_count: number;
}
interface Photo { id: number; image_url: string; thumb_url?: string | null; width?: number; height?: number; distance?: number }

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

  const download = async (p: Photo) => {
    try {
      const res = await fetch(p.image_url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `photo-${p.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch { window.open(p.image_url, '_blank'); }
  };

  const shown = matches ?? photos;
  const searching = searchState !== '';

  if (album === undefined) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-mellow-purple" /></div>;
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
          <button onClick={() => navigate(-1)} className="mt-2 px-6 py-2.5 bg-mellow-purple text-white rounded-2xl text-sm font-black">
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
        {album.face_count > 0 && (
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

        <div className="grid grid-cols-3 gap-1.5">
          {shown.map(p => (
            <button key={p.id} onClick={() => setLightbox(p)}
              className="aspect-square rounded-xl overflow-hidden bg-slate-100 active:scale-95 transition-transform">
              <img src={p.thumb_url || p.image_url} alt="" loading="lazy" decoding="async"
                className="w-full h-full object-cover" />
            </button>
          ))}
        </div>

        {matches === null && hasMore && <div ref={sentinelRef} className="h-8" />}
        {loadingMore && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-mellow-purple" size={20} /></div>}
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

      {/* lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setLightbox(null)}>
          <div className="flex justify-between items-center p-4">
            <button onClick={e => { e.stopPropagation(); download(lightbox); }}
              className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-white active:scale-90">
              <Download size={20} />
            </button>
            <button onClick={() => setLightbox(null)}
              className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-white active:scale-90">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-2 min-h-0">
            <img src={lightbox.image_url} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
};

export default EventAlbumDetail;

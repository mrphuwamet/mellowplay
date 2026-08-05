import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Calendar, Download, Share2, Grid, List, Loader2, Play, CheckSquare, Square, X, AlertCircle } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import { formatCustomDate } from '../utils/dateFormat';

const MAX_SELECTION = 30;
const PAGE_SIZE = 30;

interface MediaItem {
  id: number;
  url: string;
  type: string;
  caption: string;
  dateKey: string; // ISO yyyy-mm-dd, for date filtering
  completedAt: string;
}

const Album = () => {
  const navigate = useNavigate();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [groupMode, setGroupMode] = useState<'timeline' | 'all'>('timeline');
  const [selectedMedia, setSelectedMedia] = useState<{ url: string; type: string } | null>(null);
  const [rawMedia, setRawMedia] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { t, lang } = useTranslation();

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');

  // Smart/incremental loading — render a capped number of items at a time
  // (like Apple Photos) instead of the whole library at once.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchAlbum = async () => {
      if (!selectedChild) {
        setRawMedia([]);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const response = await apiClient.get(`/journey/album/${selectedChild.id}`);
        if (response.data.success) {
          const items: MediaItem[] = response.data.album.map((curr: any) => {
            // Group/display by the class's actual scheduled date, not
            // when the CRM staff happened to file the report.
            const classDate = curr.class_date || curr.completed_at;
            const d = new Date(classDate);
            const label = curr.course_name || curr.activity_title;
            return {
              id: curr.id,
              url: curr.media_url,
              type: curr.media_type,
              caption: label,
              dateKey: d.toISOString().slice(0, 10),
              completedAt: classDate,
            };
          });
          // Newest first, top-left to bottom-right.
          items.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
          setRawMedia(items);
        }
      } catch (err) {
        console.error('Failed to fetch album:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAlbum();
  }, [selectedChild]);

  const filteredMedia = useMemo(
    () => dateRange ? rawMedia.filter(m => m.dateKey >= dateRange.start && m.dateKey <= dateRange.end) : rawMedia,
    [rawMedia, dateRange]
  );
  const totalMedia = filteredMedia.length;

  // Timeline grouping: by date + class attended.
  const groupedMedia = useMemo(() => {
    const groups: { key: string; date: string; activity: string; images: MediaItem[] }[] = [];
    for (const item of filteredMedia) {
      const groupKey = `${item.dateKey}-${item.caption}`;
      let group = groups.find(g => g.key === groupKey);
      if (!group) {
        group = { key: groupKey, date: formatCustomDate(item.completedAt, lang, 'full'), activity: item.caption, images: [] };
        groups.push(group);
      }
      group.images.push(item);
    }
    return groups;
  }, [filteredMedia, lang]);

  // Reset pagination whenever the underlying data view changes.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [groupMode, dateRange, rawMedia]);

  const visibleFlatMedia = filteredMedia.slice(0, visibleCount);
  const visibleGroups = useMemo(() => {
    let remaining = visibleCount;
    const result: typeof groupedMedia = [];
    for (const g of groupedMedia) {
      if (remaining <= 0) break;
      result.push({ ...g, images: g.images.slice(0, remaining) });
      remaining -= g.images.length;
    }
    return result;
  }, [groupedMedia, visibleCount]);

  const hasMore = visibleCount < totalMedia;

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount(c => Math.min(totalMedia, c + PAGE_SIZE));
      }
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, totalMedia]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_SELECTION) {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAllVisible = () => {
    const ids = filteredMedia.slice(0, MAX_SELECTION).map(m => m.id);
    setSelectedIds(new Set(ids));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  // Media lives on the BACKEND API's own origin (adminController.uploadFile
  // returns an absolute URL on the worker's domain), never the consumer
  // app's — a plain `<a download>` to a cross-origin URL is silently
  // ignored by the browser per spec (it just navigates instead of saving),
  // which is exactly why this looked broken. Fetching the bytes and saving
  // a blob: URL instead works regardless of origin, since the download
  // attribute always honors blob: URLs.
  const downloadOne = async (url: string, type: string = 'image') => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = blob.type.split('/')[1] || (type === 'video' ? 'mp4' : 'jpg');
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `mellow-play-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('Download failed, falling back to opening in a new tab:', err);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const downloadSelected = () => {
    const items = filteredMedia.filter(m => selectedIds.has(m.id));
    items.forEach((item, idx) => setTimeout(() => downloadOne(item.url, item.type), idx * 300));
  };

  // Sharing just the remote URL leaves whatever app the user picks to fetch
  // and preview it itself, which some in-app share targets handle poorly
  // (or not at all) for a plain API URL with no page around it. Sharing the
  // actual file gives recipients the real photo/video directly, the way a
  // native photo app would — falls back to a URL share, then to download,
  // for browsers that don't support file sharing at all.
  const shareOne = async (url: string, type: string) => {
    try {
      if (navigator.share) {
        if (navigator.canShare) {
          const res = await fetch(url);
          const blob = await res.blob();
          const ext = blob.type.split('/')[1] || (type === 'video' ? 'mp4' : 'jpg');
          const file = new File([blob], `mellow-play.${ext}`, { type: blob.type || (type === 'video' ? 'video/mp4' : 'image/jpeg') });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
            return;
          }
        }
        await navigator.share({ url });
        return;
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return; // user cancelled the share sheet
      console.error('Share failed, falling back to download:', err);
    }
    downloadOne(url, type);
  };

  if (isLoading) {
    return (
      <div className="mellow-page animate-pulse">
        <div className="h-[64px] px-5 bg-white/80 border-b border-black/5 flex items-center justify-between">
          <div className="w-10 h-10 rounded-full bg-slate-200" />
          <div className="h-4 w-24 bg-slate-200 rounded-full" />
          <div className="w-10 h-10 rounded-full bg-slate-200" />
        </div>
        <div className="p-4">
          <div className="h-3 w-20 bg-slate-200 rounded-full mb-3" />
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-[24px] bg-slate-200" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // No child selected — guests never have one, and neither does a logged-in
  // user who hasn't added a child yet. Mirrors Roadmap's guest/empty state
  // so the two nav tabs feel consistent instead of this one looking broken.
  if (!selectedChild) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center pb-24">
        <div className="bg-white p-8 rounded-[32px] shadow-sm max-w-sm w-full">
          <div className="w-16 h-16 bg-mellow-purple/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="text-mellow-purple" size={32} />
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">
            {lang === 'en' ? 'Select a Child' : 'กรุณาเลือกข้อมูลเด็ก'}
          </h2>
          <p className="text-slate-500 mb-6">
            {lang === 'en' ? 'Please select a child profile first.' : 'โปรดเลือกข้อมูลเด็กก่อนเพื่อดูอัลบั้มภาพ'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold"
          >
            {lang === 'en' ? 'Back to Home' : 'กลับไปหน้าหลัก'}
          </button>
        </div>
      </div>
    );
  }

  const renderThumb = (img: MediaItem) => {
    const isSelected = selectedIds.has(img.id);
    const datetimeLabel = `${formatCustomDate(img.completedAt, lang, 'short')} ${new Date(img.completedAt).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'th-TH', { hour: '2-digit', minute: '2-digit' })}`;
    return (
      <div
        key={img.id}
        className="group relative"
        onClick={() => selectMode ? toggleSelect(img.id) : setSelectedMedia({ url: img.url, type: img.type })}
      >
        <div className={`
          overflow-hidden rounded-[24px] bg-slate-200 shadow-lg transition-all active:scale-[0.98]
          ${viewMode === 'grid' ? 'aspect-square' : 'aspect-[4/3]'}
          ${isSelected ? 'ring-4 ring-mellow-blue' : ''}
        `}>
          {img.type === 'video' ? (
            <video
              src={img.url}
              preload="metadata"
              muted
              playsInline
              // Some browsers (notably Safari/iOS) don't clip <video> to a
              // parent's overflow-hidden + rounded corners, unlike <img> —
              // so the radius has to be set on the element itself too.
              className={`w-full h-full object-cover rounded-[24px] transition-transform duration-500 ${!selectMode ? 'group-hover:scale-110' : ''} ${isSelected ? 'opacity-80' : ''}`}
            />
          ) : (
            <img
              src={img.url}
              alt={img.caption}
              loading="lazy"
              decoding="async"
              className={`w-full h-full object-cover transition-transform duration-500 ${!selectMode ? 'group-hover:scale-110' : ''} ${isSelected ? 'opacity-80' : ''}`}
            />
          )}
          {img.type === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-12 h-12 bg-white/85 rounded-full flex items-center justify-center shadow-sm">
                <Play size={20} className="text-mellow-blue fill-mellow-blue ml-0.5" />
              </div>
            </div>
          )}

          {!selectMode && (
            <div className="absolute inset-0 rounded-[24px] bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4 pointer-events-none">
               <p className="text-white text-[15px] font-bold leading-tight">{datetimeLabel}</p>
            </div>
          )}

          {selectMode && (
            <div className="absolute top-2 right-2 z-10">
              {isSelected ? (
                <CheckSquare size={22} className="text-white drop-shadow" fill="#4facfe" />
              ) : (
                <Square size={22} className="text-white drop-shadow" />
              )}
            </div>
          )}

          {!selectMode && viewMode === 'grid' && (
            <div className="absolute top-2 right-2 z-10 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={e => { e.stopPropagation(); downloadOne(img.url, img.type); }}
                className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
              >
                <Download size={14} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); shareOne(img.url, img.type); }}
                className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
              >
                <Share2 size={14} />
              </button>
            </div>
          )}

          {/* List view: save/share centered on the thumbnail instead of a
              below-image row — the course name is dropped here too since
              the timeline group header above already shows it. */}
          {!selectMode && viewMode === 'list' && (
            <div className="absolute inset-0 rounded-[24px] flex items-center justify-center gap-3 bg-black/10">
              <button
                onClick={e => { e.stopPropagation(); downloadOne(img.url, img.type); }}
                className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
              >
                <Download size={18} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); shareOne(img.url, img.type); }}
                className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform"
              >
                <Share2 size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mellow-page bg-[#fbfaf7] pb-10">
      {/* Media Preview Modal */}
      {selectedMedia && (
        <div
          className="fixed inset-0 z-[100] bg-mellow-ink/95 flex items-center justify-center p-5 backdrop-blur-sm"
          onClick={() => setSelectedMedia(null)}
        >
          <div className="relative w-full max-w-[400px] md:max-w-[600px] lg:max-w-[720px]" onClick={e => e.stopPropagation()}>
             {selectedMedia.type === 'video' ? (
               <video src={selectedMedia.url} controls autoPlay className="w-full rounded-[32px] shadow-2xl" />
             ) : (
               <img src={selectedMedia.url} alt="Preview" className="w-full rounded-[32px] shadow-2xl" />
             )}
             <button onClick={() => setSelectedMedia(null)} className="absolute -top-12 right-0 text-white font-black text-sm uppercase tracking-widest">
                {t.album.close}
             </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform shrink-0">
            <ChevronLeft size={24} className="mr-0.5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[17px] font-black tracking-tight leading-none mb-0.5 truncate">{t.album.title}</h1>
            <span className="text-[15px] font-bold text-mellow-blue uppercase tracking-[0.2em] truncate block">{t.album.memoriesPrefix}{selectedChild?.nickname}{t.album.memoriesSuffix}</span>
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => {
              setDraftStart(dateRange?.start || '');
              setDraftEnd(dateRange?.end || '');
              setPickerOpen(v => !v);
            }}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${dateRange ? 'bg-mellow-blue text-white' : 'bg-slate-100 text-slate-400'}`}
          >
             <Calendar size={20} />
          </button>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
              <div className="absolute right-0 top-12 z-40 w-[260px] bg-white rounded-2xl shadow-xl border border-slate-100 p-4">
                <label className="block text-[13px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.album.fromDate}</label>
                <input
                  type="date" value={draftStart} max={draftEnd || undefined}
                  onChange={e => setDraftStart(e.target.value)}
                  className="w-full mb-3 px-3 py-2 rounded-xl border border-slate-200 text-[15px] font-bold"
                />
                <label className="block text-[13px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t.album.toDate}</label>
                <input
                  type="date" value={draftEnd} min={draftStart || undefined}
                  onChange={e => setDraftEnd(e.target.value)}
                  className="w-full mb-4 px-3 py-2 rounded-xl border border-slate-200 text-[15px] font-bold"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setDateRange(null); setPickerOpen(false); }}
                    className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-500 text-[14px] font-black uppercase tracking-widest"
                  >
                    {t.album.clearDates}
                  </button>
                  <button
                    onClick={() => { if (draftStart && draftEnd) { setDateRange({ start: draftStart, end: draftEnd }); setPickerOpen(false); } }}
                    disabled={!draftStart || !draftEnd}
                    className="flex-1 py-2 rounded-xl bg-mellow-purple text-white text-[14px] font-black uppercase tracking-widest disabled:opacity-40"
                  >
                    {t.album.apply}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {dateRange && (
        <div className="px-5 pt-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-mellow-blue/10 text-mellow-blue rounded-full text-[14px] font-bold">
            {formatCustomDate(dateRange.start, lang, 'short')} - {formatCustomDate(dateRange.end, lang, 'short')}
            <button onClick={() => setDateRange(null)}><X size={14} /></button>
          </div>
        </div>
      )}

      {/* Album Summary */}
      <div className="p-5">
        {totalMedia === 0 ? (
          <div className="mellow-card bg-white border border-slate-100 text-center py-14 px-6">
            <div className="w-16 h-16 rounded-full bg-mellow-blue/10 flex items-center justify-center mx-auto mb-4">
              <Calendar size={28} className="text-mellow-blue" />
            </div>
            <h3 className="font-black text-lg text-mellow-ink mb-1">
              {dateRange ? t.album.noPhotosForDate : t.album.noPhotosTitle}
            </h3>
            {!dateRange && <p className="text-sm text-slate-400 font-bold mb-5">{t.album.noPhotosDesc}</p>}
            <button
              onClick={() => dateRange ? setDateRange(null) : navigate('/explore')}
              className="px-6 py-3 bg-mellow-purple text-white text-[15px] font-black rounded-xl uppercase tracking-widest shadow-md active:scale-95 transition-all"
            >
              {dateRange ? t.album.allDates : t.album.bookNow}
            </button>
          </div>
        ) : (
          <>
            <div className="mellow-card bg-gradient-to-br from-mellow-blue to-[#4facfe] text-white border-none flex items-center justify-between mb-6">
              <div>
                 <h2 className="text-2xl font-black mb-1">{totalMedia} {t.album.photos}</h2>
              </div>
              <button
                onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                className="px-4 py-2 rounded-xl bg-white/20 backdrop-blur-md text-[14px] font-black uppercase tracking-widest"
              >
                {selectMode ? t.album.cancel : t.album.select}
              </button>
            </div>

            {/* Grouping + View Toggle */}
            <div className="flex justify-between items-center mb-3 gap-2">
               <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
                  <button
                    onClick={() => setGroupMode('timeline')}
                    className={`px-3 py-1.5 rounded-lg text-[14px] font-black transition-all ${groupMode === 'timeline' ? 'bg-white shadow-sm text-mellow-blue' : 'text-slate-400'}`}
                  >
                    {t.album.groupTimeline}
                  </button>
                  <button
                    onClick={() => setGroupMode('all')}
                    className={`px-3 py-1.5 rounded-lg text-[14px] font-black transition-all ${groupMode === 'all' ? 'bg-white shadow-sm text-mellow-blue' : 'text-slate-400'}`}
                  >
                    {t.album.groupAll}
                  </button>
               </div>
               <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-mellow-blue' : 'text-slate-400'}`}
                  >
                    <Grid size={18} />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-mellow-blue' : 'text-slate-400'}`}
                  >
                    <List size={18} />
                  </button>
               </div>
            </div>

            {selectMode && (
              <p className="text-[13px] text-slate-400 font-bold mb-6">{t.album.maxSelection}</p>
            )}

            {/* Album Content */}
            {groupMode === 'timeline' ? (
              <div className="space-y-10">
                {visibleGroups.map((group, gIdx) => (
                  <div key={gIdx} className="relative">
                    <div className="flex items-center gap-3 mb-4">
                       <div className="w-1.5 h-6 bg-mellow-blue rounded-full" />
                       <div>
                          <b className="text-[15px] text-mellow-ink block leading-none mb-1">{group.date}</b>
                          <span className="text-[15px] font-bold text-slate-400 uppercase tracking-widest">{group.activity}</span>
                       </div>
                    </div>
                    <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}`}>
                      {group.images.map(renderThumb)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}`}>
                {visibleFlatMedia.map(renderThumb)}
              </div>
            )}

            {hasMore ? (
              <div ref={sentinelRef} className="flex justify-center py-8">
                <Loader2 className="animate-spin text-slate-300" size={24} />
              </div>
            ) : (
              <div className="mt-10 text-center pb-4">
                 <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full text-[15px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    {t.album.endOfGallery}
                 </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Select-mode action bar */}
      {selectMode && totalMedia > 0 && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] md:max-w-[680px] lg:max-w-[900px] xl:max-w-[1100px] p-4 bg-white/95 backdrop-blur-xl border-t border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] z-40 flex items-center gap-3">
          <button onClick={selectAllVisible} className="text-[14px] font-black text-mellow-blue uppercase tracking-widest shrink-0">
            {t.album.selectAll}
          </button>
          <div className="flex-1 text-center text-[14px] font-bold text-slate-500">
            {selectedIds.size} / {MAX_SELECTION}
          </div>
          <button
            onClick={downloadSelected}
            disabled={selectedIds.size === 0}
            className="px-4 py-2.5 bg-mellow-purple text-white text-[14px] font-black rounded-xl uppercase tracking-widest disabled:opacity-40 active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
          >
            <Download size={14} /> {t.album.downloadSelected}
          </button>
        </div>
      )}
    </div>
  );
};

export default Album;

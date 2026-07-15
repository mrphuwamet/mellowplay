import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Calendar, Download, Share2, Grid, List, Loader2, Play, CheckSquare, Square, X } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';

const MAX_SELECTION = 30;
const PAGE_SIZE = 30;

interface MediaItem {
  id: number;
  url: string;
  type: string;
  caption: string;
  dateKey: string; // ISO yyyy-mm-dd, for date filtering
  dateLabel: string;
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
  const [dateFilter, setDateFilter] = useState<string>('');
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Smart/incremental loading — render a capped number of items at a time
  // (like Apple Photos) instead of the whole library at once.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchAlbum = async () => {
      if (!selectedChild) return;
      setIsLoading(true);
      try {
        const response = await apiClient.get(`/journey/album/${selectedChild.id}`);
        if (response.data.success) {
          const items: MediaItem[] = response.data.album.map((curr: any) => {
            const d = new Date(curr.completed_at);
            const label = curr.course_name || curr.activity_title;
            return {
              id: curr.id,
              url: curr.media_url,
              type: curr.media_type,
              caption: label,
              dateKey: d.toISOString().slice(0, 10),
              dateLabel: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
              completedAt: curr.completed_at,
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
    () => dateFilter ? rawMedia.filter(m => m.dateKey === dateFilter) : rawMedia,
    [rawMedia, dateFilter]
  );
  const totalMedia = filteredMedia.length;

  // Timeline grouping: by date + class attended.
  const groupedMedia = useMemo(() => {
    const groups: { key: string; date: string; activity: string; images: MediaItem[] }[] = [];
    for (const item of filteredMedia) {
      const groupKey = `${item.dateKey}-${item.caption}`;
      let group = groups.find(g => g.key === groupKey);
      if (!group) {
        group = { key: groupKey, date: item.dateLabel, activity: item.caption, images: [] };
        groups.push(group);
      }
      group.images.push(item);
    }
    return groups;
  }, [filteredMedia]);

  // Reset pagination whenever the underlying data view changes.
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [groupMode, dateFilter, rawMedia]);

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

  const downloadOne = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadSelected = () => {
    const items = filteredMedia.filter(m => selectedIds.has(m.id));
    items.forEach((item, idx) => setTimeout(() => downloadOne(item.url), idx * 300));
  };

  if (isLoading) {
    return (
      <div className="mellow-page flex items-center justify-center">
        <Loader2 className="animate-spin text-mellow-blue" size={40} />
      </div>
    );
  }

  const renderThumb = (img: MediaItem) => {
    const isSelected = selectedIds.has(img.id);
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
          <img
            src={img.url}
            alt={img.caption}
            loading="lazy"
            decoding="async"
            className={`w-full h-full object-cover transition-transform duration-500 ${!selectMode ? 'group-hover:scale-110' : ''} ${isSelected ? 'opacity-80' : ''}`}
          />
          {img.type === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-12 h-12 bg-white/85 rounded-full flex items-center justify-center">
                <Play size={20} className="text-mellow-blue fill-mellow-blue ml-0.5" />
              </div>
            </div>
          )}

          {selectMode ? (
            <div className="absolute top-2 right-2">
              {isSelected ? (
                <CheckSquare size={22} className="text-white drop-shadow" fill="#4facfe" />
              ) : (
                <Square size={22} className="text-white drop-shadow" />
              )}
            </div>
          ) : (
            <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={e => { e.stopPropagation(); downloadOne(img.url); }}
                className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
              >
                <Download size={14} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); navigator.share ? navigator.share({ url: img.url }).catch(() => {}) : downloadOne(img.url); }}
                className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white"
              >
                <Share2 size={14} />
              </button>
            </div>
          )}

          {!selectMode && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4 pointer-events-none">
               <p className="text-white text-[14px] font-bold leading-tight">{img.caption}</p>
            </div>
          )}
        </div>
        {viewMode === 'list' && !selectMode && (
           <div className="mt-3 px-2">
              <p className="text-[14px] font-bold text-mellow-ink">{img.caption}</p>
              <div className="flex gap-4 mt-2">
                 <button onClick={e => { e.stopPropagation(); downloadOne(img.url); }} className="text-[14px] font-black text-mellow-blue uppercase tracking-widest flex items-center gap-1">
                    <Download size={12} /> {t.album.save}
                 </button>
                 <button
                   onClick={e => { e.stopPropagation(); navigator.share ? navigator.share({ url: img.url }).catch(() => {}) : downloadOne(img.url); }}
                   className="text-[14px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"
                 >
                    <Share2 size={12} /> {t.album.share}
                 </button>
              </div>
           </div>
        )}
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
          <div className="relative w-full max-w-[400px]" onClick={e => e.stopPropagation()}>
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
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <div className="text-center">
          <h1 className="text-[16px] font-black tracking-tight leading-none mb-0.5">{t.album.title}</h1>
          <span className="text-[14px] font-bold text-mellow-blue uppercase tracking-[0.2em]">{t.album.memoriesPrefix}{selectedChild?.name}{t.album.memoriesSuffix}</span>
        </div>
        <button
          onClick={() => dateInputRef.current?.showPicker ? dateInputRef.current.showPicker() : dateInputRef.current?.click()}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${dateFilter ? 'bg-mellow-blue text-white' : 'bg-slate-100 text-slate-400'}`}
        >
           <Calendar size={20} />
           <input
             ref={dateInputRef}
             type="date"
             value={dateFilter}
             onChange={e => setDateFilter(e.target.value)}
             className="sr-only"
           />
        </button>
      </header>

      {dateFilter && (
        <div className="px-5 pt-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-mellow-blue/10 text-mellow-blue rounded-full text-[13px] font-bold">
            {new Date(dateFilter).toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
            <button onClick={() => setDateFilter('')}><X size={14} /></button>
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
              {dateFilter ? t.album.noPhotosForDate : t.album.noPhotosTitle}
            </h3>
            {!dateFilter && <p className="text-sm text-slate-400 font-bold mb-5">{t.album.noPhotosDesc}</p>}
            <button
              onClick={() => dateFilter ? setDateFilter('') : navigate('/explore')}
              className="px-6 py-3 bg-mellow-purple text-white text-[14px] font-black rounded-xl uppercase tracking-widest shadow-md active:scale-95 transition-all"
            >
              {dateFilter ? t.album.allDates : t.album.bookNow}
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
                className="px-4 py-2 rounded-xl bg-white/20 backdrop-blur-md text-[13px] font-black uppercase tracking-widest"
              >
                {selectMode ? t.album.cancel : t.album.select}
              </button>
            </div>

            {/* Grouping + View Toggle */}
            <div className="flex justify-between items-center mb-3 gap-2">
               <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
                  <button
                    onClick={() => setGroupMode('timeline')}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-black transition-all ${groupMode === 'timeline' ? 'bg-white shadow-sm text-mellow-blue' : 'text-slate-400'}`}
                  >
                    {t.album.groupTimeline}
                  </button>
                  <button
                    onClick={() => setGroupMode('all')}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-black transition-all ${groupMode === 'all' ? 'bg-white shadow-sm text-mellow-blue' : 'text-slate-400'}`}
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
              <p className="text-[12px] text-slate-400 font-bold mb-6">{t.album.maxSelection}</p>
            )}

            {/* Album Content */}
            {groupMode === 'timeline' ? (
              <div className="space-y-10">
                {visibleGroups.map((group, gIdx) => (
                  <div key={gIdx} className="relative">
                    <div className="flex items-center gap-3 mb-4">
                       <div className="w-1.5 h-6 bg-mellow-blue rounded-full" />
                       <div>
                          <b className="text-[14px] text-mellow-ink block leading-none mb-1">{group.date}</b>
                          <span className="text-[14px] font-bold text-slate-400 uppercase tracking-widest">{group.activity}</span>
                       </div>
                    </div>
                    <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2 gap-3' : 'grid-cols-1 gap-6'}`}>
                      {group.images.map(renderThumb)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2 gap-3' : 'grid-cols-1 gap-6'}`}>
                {visibleFlatMedia.map(renderThumb)}
              </div>
            )}

            {hasMore ? (
              <div ref={sentinelRef} className="flex justify-center py-8">
                <Loader2 className="animate-spin text-slate-300" size={24} />
              </div>
            ) : (
              <div className="mt-10 text-center pb-4">
                 <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full text-[14px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    {t.album.endOfGallery}
                 </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Select-mode action bar */}
      {selectMode && totalMedia > 0 && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-4 bg-white/95 backdrop-blur-xl border-t border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] z-40 flex items-center gap-3">
          <button onClick={selectAllVisible} className="text-[13px] font-black text-mellow-blue uppercase tracking-widest shrink-0">
            {t.album.selectAll}
          </button>
          <div className="flex-1 text-center text-[13px] font-bold text-slate-500">
            {selectedIds.size} / {MAX_SELECTION}
          </div>
          <button
            onClick={downloadSelected}
            disabled={selectedIds.size === 0}
            className="px-4 py-2.5 bg-mellow-purple text-white text-[13px] font-black rounded-xl uppercase tracking-widest disabled:opacity-40 active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
          >
            <Download size={14} /> {t.album.downloadSelected}
          </button>
        </div>
      )}
    </div>
  );
};

export default Album;

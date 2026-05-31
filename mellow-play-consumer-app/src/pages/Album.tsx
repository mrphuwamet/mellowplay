import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Calendar, Download, Share2, Grid, List, Loader2 } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';

const Album = () => {
  const navigate = useNavigate();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [albumData, setAlbumData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchAlbum = async () => {
      if (!selectedChild) return;
      setIsLoading(true);
      try {
        const response = await apiClient.get(`/journey/album/${selectedChild.id}`);
        if (response.data.success) {
          // Group flat media list by date and activity
          const grouped = response.data.album.reduce((acc: any[], curr: any) => {
            const dateStr = new Date(curr.completed_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'long', year: 'numeric'
            });
            const groupKey = `${dateStr}-${curr.activity_title}`;
            
            let group = acc.find(g => g.key === groupKey);
            if (!group) {
              group = { key: groupKey, date: dateStr, activity: curr.activity_title, images: [] };
              acc.push(group);
            }
            group.images.push({
              id: curr.id,
              url: curr.media_url,
              caption: curr.activity_title
            });
            return acc;
          }, []);
          setAlbumData(grouped);
        }
      } catch (err) {
        console.error('Failed to fetch album:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAlbum();
  }, [selectedChild]);

  if (isLoading) {
    return (
      <div className="mellow-page flex items-center justify-center">
        <Loader2 className="animate-spin text-mellow-blue" size={40} />
      </div>
    );
  }

  return (
    <div className="mellow-page bg-[#fbfaf7]">
      {/* Image Preview Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-mellow-ink/95 flex items-center justify-center p-5 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative w-full max-w-[400px]">
             <img src={selectedImage} alt="Preview" className="w-full rounded-[32px] shadow-2xl" />
             <button className="absolute -top-12 right-0 text-white font-black text-sm uppercase tracking-widest">
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
        <div className="w-10 h-10 flex items-center justify-center">
           <Calendar size={20} className="text-slate-400" />
        </div>
      </header>

      {/* Album Summary */}
      <div className="p-5">
        <div className="mellow-card bg-gradient-to-br from-mellow-blue to-[#4facfe] text-white border-none flex items-center justify-between mb-6">
          <div>
             <h2 className="text-2xl font-black mb-1">7 {t.album.photos}</h2>
             <p className="text-[14px] font-bold text-white/80 uppercase tracking-widest">{t.album.capturedBy}</p>
          </div>
          <div className="flex gap-2">
             <button className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                <Download size={18} />
             </button>
             <button className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                <Share2 size={18} />
             </button>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex justify-between items-center mb-6">
           <h3 className="font-black text-lg text-mellow-ink">{t.album.timeline}</h3>
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

        {/* Album Content */}
        <div className="space-y-10">
          {albumData.map((group, gIdx) => (
            <div key={gIdx} className="relative">
              {/* Date & Activity Sticky Label */}
              <div className="flex items-center gap-3 mb-4">
                 <div className="w-1.5 h-6 bg-mellow-blue rounded-full" />
                 <div>
                    <b className="text-[14px] text-mellow-ink block leading-none mb-1">{group.date}</b>
                    <span className="text-[14px] font-bold text-slate-400 uppercase tracking-widest">{group.activity}</span>
                 </div>
              </div>

              {/* Photos Grid */}
              <div className={`grid ${viewMode === 'grid' ? 'grid-cols-2 gap-3' : 'grid-cols-1 gap-6'}`}>
                {group.images.map((img) => (
                  <div key={img.id} className="group relative" onClick={() => setSelectedImage(img.url)}>
                    <div className={`
                      overflow-hidden rounded-[24px] bg-slate-200 shadow-lg transition-all active:scale-[0.98]
                      ${viewMode === 'grid' ? 'aspect-square' : 'aspect-[4/3]'}
                    `}>
                      <img 
                        src={img.url} 
                        alt={img.caption}
                        className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                         <p className="text-white text-[14px] font-bold leading-tight">{img.caption}</p>
                      </div>
                    </div>
                    {viewMode === 'list' && (
                       <div className="mt-3 px-2">
                          <p className="text-[14px] font-bold text-mellow-ink">{img.caption}</p>
                          <div className="flex gap-4 mt-2">
                             <button className="text-[14px] font-black text-mellow-blue uppercase tracking-widest flex items-center gap-1">
                                <Download size={12} /> {t.album.save}
                             </button>
                             <button className="text-[14px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                <Share2 size={12} /> {t.album.share}
                             </button>
                          </div>
                       </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div className="mt-20 text-center pb-10">
           <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full text-[14px] font-black text-slate-400 uppercase tracking-[0.2em]">
              {t.album.endOfGallery}
           </div>
        </div>
      </div>
    </div>
  );
};

export default Album;

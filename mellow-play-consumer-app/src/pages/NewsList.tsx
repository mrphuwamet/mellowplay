import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Play } from 'lucide-react';
import apiClient from '../utils/apiClient';
import logo from '../assets/ui/logo.svg';
import { useTranslation } from '../LanguageContext';
import { resolveImageUrl } from '../utils/courseImage';

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// "View all" list for a News_Feed type (news | media), reached from
// Explore's "ดูข่าวทั้งหมด" / "ดูทั้งหมด" buttons.
const NewsList = () => {
  const navigate = useNavigate();
  const { type } = useParams<{ type: 'news' | 'media' }>();
  const { lang } = useTranslation();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiClient.get('/news-feed', { params: { type } })
      .then(res => setItems(res.data.success ? res.data.items : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [type]);

  const title = type === 'media'
    ? (lang === 'en' ? 'Fun Facts' : 'เรื่องน่ารู้')
    : (lang === 'en' ? 'News' : 'ข่าวสาร');

  return (
    <div className="mellow-page bg-[#fbfaf7] min-h-screen">
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform shrink-0">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <h1 className="text-[16px] font-black tracking-tight leading-none">{title}</h1>
      </header>

      <main className="p-5">
        {loading ? (
          <div className="flex flex-col gap-4 animate-pulse md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden flex w-full md:flex-col">
                <div className="w-28 h-28 md:w-full md:h-40 bg-slate-200 shrink-0" />
                <div className="flex-1 min-w-0 p-4 space-y-2">
                  <div className="h-4 w-3/4 bg-slate-200 rounded-full" />
                  <div className="h-3 w-full bg-slate-100 rounded-full" />
                  <div className="h-3 w-2/3 bg-slate-100 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-slate-400 font-bold">
            {lang === 'en' ? 'No content yet' : 'ยังไม่มีเนื้อหา'}
          </div>
        ) : (
          <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
            {items.map(item => {
              const imageUrl = resolveImageUrl(item.image_url);
              const itemTitle = lang === 'en' && item.title_en ? item.title_en : item.title;
              const content = (lang === 'en' && item.content_en ? item.content_en : item.content) || '';
              return (
                <div
                  key={item.id}
                  onClick={() => navigate(`/news/${item.id}`)}
                  className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer active:scale-95 transition-transform flex w-full md:flex-col"
                >
                  <div className="w-28 h-28 md:w-full md:h-40 bg-slate-100 relative shrink-0 overflow-hidden">
                    {imageUrl ? (
                      <img src={imageUrl} alt={itemTitle} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-4 opacity-30">
                        <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
                      </div>
                    )}
                    {item.video_url && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-8 h-8 bg-white/85 rounded-full flex items-center justify-center shadow-sm">
                          <Play size={14} className="text-mellow-blue fill-mellow-blue ml-0.5" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 p-4">
                    <h4 className="font-black text-[15px] text-slate-800 leading-tight mb-1 line-clamp-2">{itemTitle}</h4>
                    {content && <p className="text-[12px] text-slate-500 line-clamp-2 leading-snug">{stripHtml(content)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default NewsList;

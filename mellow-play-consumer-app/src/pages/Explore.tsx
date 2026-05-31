import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, Calendar, BookOpen, Search, Filter, ArrowRight } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import { useTranslation } from '../LanguageContext';

const Explore = () => {
  const navigate = useNavigate();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const { t } = useTranslation();

  const categories = [
    { id: 'all', label: t.explore.categories.all, icon: '✨' },
    { id: 'media', label: t.explore.categories.media, icon: '📺' },
    { id: 'events', label: t.explore.categories.events, icon: '🎪' },
    { id: 'courses', label: t.explore.categories.courses, icon: '🎓' },
  ];

  const onlineMedia = [
    { id: 1, title: 'Mellow Song: The Builder', duration: '3:24', thumb: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=400', type: 'Music' },
    { id: 2, title: 'Story: Brave Little Otter', duration: '12:05', thumb: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&q=80&w=400', type: 'Story' },
  ];

  const upcomingEvents = [
    { id: 1, title: 'Mellow Expo 2026', date: '15-17 May', branch: 'Central World', color: 'bg-mellow-purple' },
    { id: 2, title: 'Science Camp', date: '22 May', branch: 'Chidlom', color: 'bg-mellow-red' },
  ];

  return (
    <div className="mellow-page bg-[#fbfaf7]">
      {/* Header */}
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <div className="text-center">
          <h1 className="text-[16px] font-black tracking-tight leading-none mb-0.5">{t.explore.title}</h1>
          <span className="text-[14px] font-bold text-mellow-yellow uppercase tracking-[0.2em]">{t.explore.subtitle}</span>
        </div>
        <button className="w-10 h-10 flex items-center justify-center">
           <Search size={20} className="text-slate-400" />
        </button>
      </header>

      <main className="p-5">
        {/* Personalized Banner */}
        <div className="mellow-card bg-mellow-yellow text-white border-none mb-6 relative overflow-hidden">
           <div className="absolute -bottom-4 -right-4 opacity-20 rotate-12">
              <BookOpen size={120} />
           </div>
           <div className="relative z-10">
              <h2 className="text-xl font-black mb-1">{t.explore.recommendedFor} {selectedChild?.name}</h2>
              <p className="text-sm font-bold text-white/80 mb-4 italic">{t.explore.basedOn}</p>
              <button className="px-4 py-2 bg-white text-mellow-yellow rounded-xl text-[14px] font-black uppercase tracking-wider flex items-center gap-2">
                 {t.explore.seeRecommendations} <ArrowRight size={14} />
              </button>
           </div>
        </div>

        {/* Categories Scroller */}
        <div className="flex gap-3 overflow-x-auto pb-6 -mx-5 px-5 scrollbar-hide">
           {categories.map(cat => (
             <button key={cat.id} className="flex-shrink-0 px-5 py-3 rounded-2xl bg-white border border-mellow-line flex items-center gap-2 shadow-sm active:scale-95 transition-all">
                <span className="text-lg">{cat.icon}</span>
                <b className="text-[14px] font-black">{cat.label}</b>
             </button>
           ))}
        </div>

        {/* Online Media Section */}
        <section className="mb-8">
           <div className="flex justify-between items-end mb-4 px-1">
              <div>
                 <h3 className="font-black text-lg leading-tight uppercase tracking-tight">{t.explore.mellowMedia}</h3>
                 <p className="text-[14px] text-slate-400 font-bold uppercase tracking-widest">{t.explore.songsStories}</p>
              </div>
              <button className="text-[14px] font-black text-mellow-blue">{t.common.viewAll}</button>
           </div>
           
           <div className="grid grid-cols-2 gap-4">
              {onlineMedia.map(item => (
                <div key={item.id} className="group cursor-pointer">
                   <div className="relative aspect-[4/3] rounded-[24px] overflow-hidden bg-slate-200 mb-2 shadow-md">
                      <img src={item.thumb} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center text-mellow-ink">
                            <Play size={20} fill="currentColor" />
                         </div>
                      </div>
                      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 rounded text-[14px] text-white font-bold">
                         {item.duration}
                      </div>
                   </div>
                   <h4 className="text-[14px] font-black text-mellow-ink leading-tight line-clamp-1">{item.title}</h4>
                   <span className="text-[14px] font-bold text-slate-400">{item.type}</span>
                </div>
              ))}
           </div>
        </section>

        {/* Upcoming Events Section */}
        <section className="mb-8">
           <div className="flex justify-between items-end mb-4 px-1">
              <div>
                 <h3 className="font-black text-lg leading-tight uppercase tracking-tight">{t.explore.joinUs}</h3>
                 <p className="text-[14px] text-slate-400 font-bold uppercase tracking-widest">{t.explore.eventsAndCamps}</p>
              </div>
              <button className="text-[14px] font-black text-mellow-blue">{t.common.viewAll}</button>
           </div>

           <div className="space-y-3">
              {upcomingEvents.map(event => (
                <div key={event.id} className="mellow-card !p-4 flex gap-4 items-center group active:scale-[0.98] transition-all">
                   <div className={`w-14 h-14 rounded-2xl ${event.color} flex flex-col items-center justify-center text-white`}>
                      <Calendar size={20} className="mb-1" />
                      <b className="text-[14px] font-black">MAY</b>
                   </div>
                   <div className="flex-1">
                      <h4 className="text-[14px] font-black text-mellow-ink mb-0.5">{event.title}</h4>
                      <div className="flex items-center gap-2 text-[14px] text-slate-400 font-bold uppercase tracking-widest">
                         <span>{event.date}</span>
                         <span>•</span>
                         <span>{event.branch}</span>
                      </div>
                   </div>
                   <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-mellow-blue-soft group-hover:text-mellow-blue transition-colors">
                      <ArrowRight size={18} />
                   </div>
                </div>
              ))}
           </div>
        </section>

        {/* Recommend Course Banner */}
        <div className="mellow-card bg-mellow-green-soft border-mellow-green/10 !p-6 flex flex-col items-center text-center">
           <div className="w-16 h-16 bg-white rounded-[24px] shadow-sm flex items-center justify-center text-3xl mb-4">🧪</div>
           <h3 className="text-lg font-black text-mellow-ink mb-1 uppercase">{t.explore.littleScientist}</h3>
           <p className="text-xs text-slate-500 font-bold mb-6 max-w-[240px]">{t.explore.systematicThinking.replace('{name}', selectedChild?.name || '')}</p>
           <button className="w-full mellow-btn bg-mellow-green text-white text-[14px] uppercase tracking-widest">
              {t.explore.bookTrial}
           </button>
        </div>
      </main>
    </div>
  );
};

export default Explore;

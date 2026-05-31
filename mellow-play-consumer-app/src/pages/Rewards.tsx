import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Gift, Star, Clock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import { useTranslation } from '../LanguageContext';

const Rewards = () => {
  const navigate = useNavigate();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const { t } = useTranslation();

  const points = 450; // Mock current points

  const rewards = [
    { id: 1, name: t.rewards.items.stickerSet, points: 50, icon: '🌈', color: 'bg-mellow-red-soft text-mellow-red' },
    { id: 2, name: t.rewards.items.tshirt, points: 200, icon: '👕', color: 'bg-mellow-blue-soft text-mellow-blue' },
    { id: 3, name: t.rewards.items.freeClass, points: 500, icon: '🧪', color: 'bg-mellow-green-soft text-mellow-green' },
  ];

  const history = [
    { id: 1, title: t.rewards.history.blockMaster, points: +50, date: t.rewards.history.today },
    { id: 2, title: t.rewards.history.firstArt, points: +50, date: '28 Apr' },
    { id: 3, title: t.rewards.history.dailyLogin, points: +10, date: '27 Apr' },
  ];

  return (
    <div className="mellow-page bg-[#fbfaf7]">
      {/* Header */}
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <div className="text-center">
          <h1 className="text-[16px] font-black tracking-tight leading-none mb-0.5">{t.rewards.title}</h1>
          <span className="text-[14px] font-bold text-mellow-green uppercase tracking-[0.2em]">{t.rewards.subtitle}</span>
        </div>
        <div className="w-10 h-10 flex items-center justify-center">
           <Clock size={20} className="text-slate-400" />
        </div>
      </header>

      <main className="p-5">
        {/* Points Summary Card */}
        <div className="mellow-card bg-gradient-to-br from-mellow-green to-[#10b981] text-white border-none mb-8 p-8 flex flex-col items-center shadow-xl relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
              <Star size={80} fill="currentColor" />
           </div>
           <span className="text-[14px] font-black uppercase tracking-[0.2em] mb-2 opacity-80">{t.rewards.availablePoints}</span>
           <div className="flex items-baseline gap-2 mb-4">
              <span className="text-6xl font-black">{points}</span>
              <span className="text-xl font-black opacity-60">PTS</span>
           </div>
           <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-white rounded-full" style={{ width: `${(points/500) * 100}%` }} />
           </div>
           <p className="text-[14px] font-bold text-white/80 uppercase tracking-widest">{t.rewards.freeClassHint}</p>
        </div>

        {/* Rewards Catalog */}
        <section className="mb-10">
           <div className="flex items-center justify-between mb-5 px-1">
              <h3 className="font-black text-lg uppercase tracking-tight">{t.rewards.catalog}</h3>
              <button className="text-[14px] font-black text-mellow-blue">{t.common.viewAll}</button>
           </div>
           
           <div className="space-y-4">
              {rewards.map(item => {
                const canAfford = points >= item.points;
                return (
                  <div key={item.id} className={`mellow-card !p-4 flex items-center gap-4 ${!canAfford ? 'opacity-60' : ''}`}>
                     <div className={`w-14 h-14 rounded-2xl ${item.color} flex items-center justify-center text-3xl`}>
                        {item.icon}
                     </div>
                     <div className="flex-1">
                        <h4 className="text-[14px] font-black text-mellow-ink mb-0.5">{item.name}</h4>
                        <b className="text-[14px] text-mellow-green">{item.points} PTS</b>
                     </div>
                     <button 
                       disabled={!canAfford}
                       className={`px-4 py-2 rounded-xl text-[14px] font-black uppercase tracking-wider transition-all
                         ${canAfford ? 'bg-mellow-green text-white active:scale-95 shadow-lg shadow-mellow-green/20' : 'bg-slate-100 text-slate-400'}
                       `}
                     >
                        {canAfford ? t.rewards.redeem : t.rewards.locked}
                     </button>
                  </div>
                );
              })}
           </div>
        </section>

        {/* Points History */}
        <section>
           <div className="flex items-center gap-2 mb-5 px-1">
              <CheckCircle2 size={18} className="text-mellow-green" />
              <h3 className="font-black text-lg uppercase tracking-tight">{t.rewards.pointsHistory}</h3>
           </div>
           
           <div className="bg-white border border-mellow-line rounded-[32px] overflow-hidden">
              {history.map((item, idx) => (
                <div key={item.id} className={`p-5 flex items-center justify-between ${idx !== history.length - 1 ? 'border-b border-slate-50' : ''}`}>
                   <div>
                      <b className="text-[14px] text-mellow-ink block mb-0.5">{item.title}</b>
                      <span className="text-[14px] font-bold text-slate-400 uppercase tracking-widest">{item.date}</span>
                   </div>
                   <b className="text-mellow-green text-sm">+{item.points}</b>
                </div>
              ))}
           </div>
        </section>
      </main>
    </div>
  );
};

export default Rewards;

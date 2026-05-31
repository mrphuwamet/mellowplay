import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, MessageCircle, Heart, Star, ShieldCheck } from 'lucide-react';
import { useTranslation } from '../LanguageContext';

const PCGDetail = () => {
  const { type } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const visualConfig = {
    play: { title: 'PLAY', icon: '🐰', color: 'from-mellow-red/10 to-white', textColor: 'text-mellow-red' },
    create: { title: 'CREATE', icon: '🦦', color: 'from-mellow-yellow/10 to-white', textColor: 'text-mellow-yellow' },
    grow: { title: 'GROW', icon: '🐺', color: 'from-mellow-blue/10 to-white', textColor: 'text-mellow-blue' },
  };

  const contentMap = {
    play: t.pcgDetail.play,
    create: t.pcgDetail.create,
    grow: t.pcgDetail.grow,
  };

  const currentVisual = visualConfig[type as keyof typeof visualConfig] || visualConfig.play;
  const currentContent = contentMap[type as keyof typeof contentMap] || contentMap.play;

  return (
    <div className="pb-24 min-h-screen bg-[#fbfaf7]">
      <header className="p-4 bg-white/90 backdrop-blur-md sticky top-0 z-20 border-b border-slate-100 flex items-center">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl active:bg-slate-100">
          <ChevronLeft size={24} />
        </button>
        <h1 className="flex-1 text-center font-black text-lg">{currentVisual.title}</h1>
        <div className="w-10" /> {/* Spacer */}
      </header>

      <main className="p-5">
        <div className={`mellow-card bg-gradient-to-br ${currentVisual.color} border-none mb-6 flex flex-col items-center text-center p-8`}>
          <div className="text-7xl mb-4">{currentVisual.icon}</div>
          <h2 className={`text-4xl font-black ${currentVisual.textColor} mb-1`}>{currentVisual.title}</h2>
          <p className="text-slate-500 font-bold">{currentContent.subtitle}</p>
        </div>

        {/* Section 1: Signals */}
        <div className="mb-8">
           <h3 className="font-black text-lg mb-4">{t.pcgDetail.behaviorTitle}</h3>
           <div className="grid gap-3">
              {currentContent.signals.map((s, i) => (
                <div key={i} className="mellow-card !p-4">
                   <b className={`block text-sm font-black mb-1 ${currentVisual.textColor}`}>{s.title}</b>
                   <p className="text-xs text-slate-500 font-medium leading-relaxed">{s.desc}</p>
                </div>
              ))}
           </div>
        </div>

        {/* Section 2: Happiness */}
        <div className="mellow-card bg-green-50/50 border-green-100 mb-6">
           <div className="flex items-center gap-2 mb-3 text-green-600">
              <Heart size={18} fill="currentColor" />
              <h3 className="font-black text-sm uppercase">{t.pcgDetail.happyTitle}</h3>
           </div>
           <ul className="space-y-2">
              {currentContent.happy.map((h, i) => (
                <li key={i} className="flex gap-2 text-xs font-bold text-slate-600">
                   <span className="text-green-400">•</span> {h}
                </li>
              ))}
           </ul>
        </div>

        {/* Section 3: Parent Support */}
        <div className="mellow-card bg-orange-50/50 border-orange-100 mb-8">
           <div className="flex items-center gap-2 mb-3 text-orange-600">
              <ShieldCheck size={18} fill="currentColor" />
              <h3 className="font-black text-sm uppercase">{t.pcgDetail.supportTitle}</h3>
           </div>
           <ul className="space-y-2">
              {currentContent.support.map((s, i) => (
                <li key={i} className="flex gap-2 text-xs font-bold text-slate-600">
                   <span className="text-orange-400">•</span> {s}
                </li>
              ))}
           </ul>
        </div>

        {/* Conversation Starter */}
        <div className="p-6 bg-mellow-purple/5 border border-mellow-purple/10 rounded-[32px] text-center">
           <div className="w-10 h-10 bg-white rounded-xl shadow-sm mx-auto flex items-center justify-center mb-3">
              <MessageCircle size={20} className="text-mellow-purple" />
           </div>
           <p className="text-sm font-black text-mellow-purple italic mb-1">
              {currentContent.prompt}
           </p>
           <span className="text-[14px] text-slate-400 font-bold uppercase tracking-widest">{t.pcgDetail.conversationStarter}</span>
         </div>
       </main>
     </div>
   );
};

export default PCGDetail;
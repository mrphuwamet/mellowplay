import React from 'react';
import { ChevronLeft, Info, HelpCircle, Lightbulb, Heart, Brain, Zap, Target, Star, Compass } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../LanguageContext';

const KnowMyChild = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // This would eventually come from the API
  const mockHDData = {
    type: "The Builder",
    typeTh: "นักสร้างสรรค์พลังล้น",
    profile: "6/2",
    heroLine: "พร้อมสร้าง เล่น ลอง และเติบโตจากสิ่งที่ทำด้วยตัวเอง",
    centers: [
      { id: 'emotion', label: t.knowMyChild.centers.emotion.label, state: 'open', sub: t.knowMyChild.centers.emotion.sub, icon: <Heart size={18} /> },
      { id: 'mind', label: t.knowMyChild.centers.mind.label, state: 'defined', sub: t.knowMyChild.centers.mind.sub, icon: <Brain size={18} /> },
      { id: 'will', label: t.knowMyChild.centers.will.label, state: 'open', sub: t.knowMyChild.centers.will.sub, icon: <Star size={18} /> },
      { id: 'focus', label: t.knowMyChild.centers.focus.label, state: 'defined', sub: t.knowMyChild.centers.focus.sub, icon: <Target size={18} /> },
    ]
  };

  return (
    <div className="pb-24 min-h-screen bg-[#fbfaf7]">
      {/* Header */}
      <header className="p-4 bg-white/90 backdrop-blur-md sticky top-0 z-20 border-b border-slate-100 flex items-center">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl active:bg-slate-100">
          <ChevronLeft size={24} />
        </button>
        <h1 className="flex-1 text-center font-black text-lg">{t.knowMyChild.title}</h1>
        <button className="p-2 -mr-2 rounded-xl active:bg-slate-100">
          <HelpCircle size={22} className="text-slate-400" />
        </button>
      </header>

      <main className="p-5">
        {/* Child Type Section */}
        <div className="mellow-card bg-white mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
             <Star size={80} strokeWidth={3} />
          </div>
          <div className="relative z-10">
            <span className="px-3 py-1 bg-mellow-yellow text-white rounded-full text-[14px] font-black uppercase mb-3 inline-block">
              {t.knowMyChild.typeAnalysis}
            </span>
            <h2 className="text-3xl font-black text-[#111] mb-1">{mockHDData.typeTh}</h2>
            <p className="text-slate-400 font-bold mb-4">({mockHDData.type})</p>
            <div className="p-4 bg-mellow-yellow/10 rounded-2xl border border-mellow-yellow/20">
               <p className="text-sm font-bold text-mellow-yellow leading-relaxed italic">
                 " {t.knowMyChild.heroLine} "
               </p>
            </div>
          </div>
        </div>

        {/* Learning Overview */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-mellow-purple/10 text-mellow-purple rounded-lg flex items-center justify-center">
              <Lightbulb size={18} />
            </div>
            <h3 className="font-black text-lg">{t.knowMyChild.learningOverview}</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
             <div className="bg-white p-4 rounded-2xl border border-slate-100 text-center flex flex-col items-center gap-2">
                <span className="text-2xl">🧩</span>
                <b className="text-[14px] font-black leading-tight">{t.knowMyChild.trait1}</b>
             </div>
             <div className="bg-white p-4 rounded-2xl border border-slate-100 text-center flex flex-col items-center gap-2">
                <span className="text-2xl">💬</span>
                <b className="text-[14px] font-black leading-tight">{t.knowMyChild.trait2}</b>
             </div>
             <div className="bg-white p-4 rounded-2xl border border-slate-100 text-center flex flex-col items-center gap-2">
                <span className="text-2xl">♡</span>
                <b className="text-[14px] font-black leading-tight">{t.knowMyChild.trait3}</b>
             </div>
          </div>
        </div>

        {/* 9 Centers Grid (Sample) */}
        <div className="mb-8">
           <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-lg">{t.knowMyChild.nineTraits}</h3>
              <div className="flex gap-4 text-[14px] font-bold text-slate-400 uppercase tracking-widest">
                 <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-mellow-green rounded-full" /> {t.knowMyChild.defined}
                 </div>
                 <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-mellow-yellow rounded-full" /> {t.knowMyChild.open}
                 </div>
              </div>
           </div>
           
           <div className="grid grid-cols-2 gap-3">
              {mockHDData.centers.map(center => (
                <div key={center.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col gap-1 relative overflow-hidden group active:border-mellow-purple/30 transition-colors">
                   <div className={`absolute top-0 right-0 w-1 h-full ${center.state === 'defined' ? 'bg-mellow-green' : 'bg-mellow-yellow'}`} />
                   <div className="flex items-center gap-2 mb-1">
                      <div className={`p-1.5 rounded-lg ${center.state === 'defined' ? 'bg-mellow-green/10 text-mellow-green' : 'bg-mellow-yellow/10 text-mellow-yellow'}`}>
                        {center.icon}
                      </div>
                      <b className="text-sm font-black">{center.label}</b>
                   </div>
                   <p className="text-[14px] text-slate-400 font-bold leading-tight">{center.sub}</p>
                </div>
              ))}
           </div>
        </div>

        {/* PCG Framework Tabs */}
        <div className="space-y-4">
           <button 
             onClick={() => navigate('/know-my-child/play')}
             className="w-full mellow-card !p-4 flex items-center justify-between bg-gradient-to-r from-red-50 to-white group active:scale-[0.98] transition-all"
           >
              <div className="flex items-center gap-4">
                 <div className="text-3xl">🐰</div>
                 <div className="text-left">
                    <h4 className="font-black text-mellow-red uppercase text-sm tracking-widest">PLAY</h4>
                    <p className="text-xs text-slate-500 font-medium">{t.knowMyChild.playSubtitle}</p>
                 </div>
              </div>
              <ChevronLeft size={20} className="rotate-180 text-slate-300" />
           </button>

           <button 
             onClick={() => navigate('/know-my-child/create')}
             className="w-full mellow-card !p-4 flex items-center justify-between bg-gradient-to-r from-yellow-50 to-white group active:scale-[0.98] transition-all"
           >
              <div className="flex items-center gap-4">
                 <div className="text-3xl">🦦</div>
                 <div className="text-left">
                    <h4 className="font-black text-mellow-yellow uppercase text-sm tracking-widest">CREATE</h4>
                    <p className="text-xs text-slate-500 font-medium">{t.knowMyChild.createSubtitle}</p>
                 </div>
              </div>
              <ChevronLeft size={20} className="rotate-180 text-slate-300" />
           </button>

           <button 
             onClick={() => navigate('/know-my-child/grow')}
             className="w-full mellow-card !p-4 flex items-center justify-between bg-gradient-to-r from-blue-50 to-white group active:scale-[0.98] transition-all"
           >
              <div className="flex items-center gap-4">
                 <div className="text-3xl">🐺</div>
                 <div className="text-left">
                    <h4 className="font-black text-mellow-blue uppercase text-sm tracking-widest">GROW</h4>
                    <p className="text-xs text-slate-500 font-medium">{t.knowMyChild.growSubtitle}</p>
                 </div>
              </div>
              <ChevronLeft size={20} className="rotate-180 text-slate-300" />
           </button>
        </div>

        <div className="mt-8 p-6 bg-mellow-purple/5 border border-mellow-purple/10 rounded-[32px] text-center">
           <div className="w-12 h-12 bg-white rounded-2xl shadow-sm mx-auto flex items-center justify-center mb-3">
              <Compass className="text-mellow-purple" />
           </div>
           <p className="text-xs text-mellow-purple font-black italic">
              “{t.knowMyChild.parentalPrompt}”
           </p>
           <span className="text-[14px] text-slate-400 font-bold block mt-2 uppercase tracking-widest">{t.knowMyChild.parentalPromptLabel}</span>
        </div>

      </main>
    </div>
  );
};

export default KnowMyChild;

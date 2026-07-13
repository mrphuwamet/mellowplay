import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, ArrowRight, Lock, Image, Video, Brain, Handshake, Hand, Lightbulb, Sparkles } from 'lucide-react';
import { useTranslation } from '../LanguageContext';

interface ReportDisplayProps {
  isGuest: boolean;
  isLocked: boolean;
  hasData?: boolean;
  onRegister: () => void;
  onRenew: () => void;
}

const ReportDisplay: React.FC<ReportDisplayProps> = ({ isGuest, isLocked, hasData = true, onRegister, onRenew }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const locked = isGuest || isLocked;

  // Mock data for the simplified display
  const learnedSkills = [
    { label: 'การแก้ปัญหา', icon: Brain, color: 'bg-blue-400' },
    { label: 'ความคิดสร้างสรรค์', icon: Lightbulb, color: 'bg-purple-400' },
    { label: 'ความร่วมมือ', icon: Handshake, color: 'bg-yellow-400' },
    { label: 'พัฒนากล้ามเนื้อ', icon: Hand, color: 'bg-red-400' },
  ];

  return (
    <div className="mb-8 relative">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">{t.report.sectionTitle}</h3>
        {hasData && <p className="text-[14px] font-black text-slate-400 uppercase tracking-widest">{t.report.today}</p>}
      </div>

      <div className="relative group">
        {/* Main Card / Fallback */}
        {!hasData ? (
          <div className="bg-white/85 backdrop-blur-xl rounded-[32px] p-6 border border-white/60 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.1)] relative overflow-hidden">
            {/* Decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-100/50 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-mellow-blue-soft/50 rounded-full blur-2xl -ml-12 -mb-12" />

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-lg">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h4 className="text-[16px] font-black text-slate-800 leading-tight">{t.report.coursePromoTitle}</h4>
                  <p className="text-[14px] font-bold text-slate-400">{t.report.coursePromoDesc}</p>
                </div>
              </div>

              {/* Mockup Course Card */}
              <div className="bg-slate-50 rounded-2xl p-4 mb-6 border border-slate-100 flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-mellow-purple to-indigo-400 flex items-center justify-center text-2xl shadow-inner">
                  🚀
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="px-2 py-0.5 bg-mellow-purple/10 text-mellow-purple text-[10px] font-black rounded-md uppercase">Popular</span>
                  </div>
                  <p className="text-[14px] font-black text-slate-700">Mellow Space Explorer</p>
                  <p className="text-[12px] font-bold text-slate-400">8 Sessions • Ages 4-6</p>
                </div>
              </div>

              <button 
                onClick={() => navigate('/explore')}
                className="w-full py-4 bg-slate-900 text-white rounded-[22px] font-black text-[14px] uppercase tracking-[0.15em] flex items-center justify-center gap-2 shadow-xl active:scale-[0.98] transition-all"
              >
                {t.report.bookLesson}
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        ) : (
          <div className={`bg-white rounded-[32px] p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.1)] border border-slate-50 transition-all ${locked ? 'blur-[3px] pointer-events-none' : ''}`}>
            
            {/* Summary Tags - Show all tags now */}
            <div className="flex flex-wrap gap-2 mb-5">
              {learnedSkills.map((skill, idx) => (
                <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100">
                  <skill.icon size={12} className="text-slate-500" />
                  <span className="text-[14px] font-black text-slate-600 uppercase">{skill.label}</span>
                </div>
              ))}
            </div>

            {/* Thumbnails Row (1:1 Ratio) */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {/* Photo Thumbnail */}
              <div className="aspect-square rounded-[24px] overflow-hidden bg-gradient-to-br from-orange-100 to-orange-200 relative">
                 <div className="absolute inset-0 flex items-center justify-center text-4xl">🏗️</div>
                 <div className="absolute top-3 left-3 px-2 py-1 bg-white/90 backdrop-blur-md rounded-lg flex items-center gap-1 shadow-sm">
                    <Image size={10} className="text-slate-600" />
                    <span className="text-[14px] font-black text-slate-600 uppercase tracking-wider">{t.report.photo}</span>
                 </div>
              </div>

              {/* Video Thumbnail */}
              <div className="aspect-square rounded-[24px] overflow-hidden bg-gradient-to-br from-pink-100 to-pink-200 relative group/vid cursor-pointer" onClick={() => navigate('/report')}>
                 <div className="absolute inset-0 flex items-center justify-center text-4xl">🎨</div>
                 <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                    <div className="w-10 h-10 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg transform group-hover/vid:scale-110 transition-transform">
                      <Play size={18} className="text-pink-500 fill-pink-500 ml-0.5" />
                    </div>
                 </div>
                 <div className="absolute top-3 left-3 px-2 py-1 bg-white/90 backdrop-blur-md rounded-lg flex items-center gap-1 shadow-sm">
                    <Video size={10} className="text-slate-600" />
                    <span className="text-[14px] font-black text-slate-600 uppercase tracking-wider">{t.report.video}</span>
                 </div>
                 <div className="absolute bottom-3 right-3 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded-md">
                    <span className="text-[14px] font-black text-white">0:45</span>
                 </div>
              </div>
            </div>

            {/* Details Button - Renamed to Full Report */}
            <button 
              onClick={() => navigate('/report')}
              className="w-full py-4 bg-slate-900 text-white rounded-[22px] font-black text-[14px] uppercase tracking-[0.15em] flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
            >
              {t.report.viewFullReport}
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* Lock overlay - ONLY show if there is learning data but user is restricted */}
        {locked && hasData && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/20 backdrop-blur-[1px] rounded-[32px] p-4 text-center">
            <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-2xl mb-4">
              <Lock size={24} className="text-mellow-purple" />
            </div>
            <p className="text-[14px] font-black text-slate-800 uppercase tracking-tight mb-4 px-8 leading-tight">
              {isGuest ? t.report.joinToSee : t.report.renewToSee}
            </p>
            <button
              onClick={isGuest ? onRegister : onRenew}
              className="px-6 py-3 bg-mellow-purple text-white text-[14px] font-black rounded-2xl uppercase tracking-widest shadow-xl active:scale-95 transition-all"
            >
              {isGuest ? t.report.registerBtn : t.report.renewBtn}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportDisplay;

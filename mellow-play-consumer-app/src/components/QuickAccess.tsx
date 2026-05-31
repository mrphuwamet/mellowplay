import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, FileText, Heart, Compass, Star, Map, Calendar } from 'lucide-react';
import { useTranslation } from '../LanguageContext';

const QuickAccess = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const menuItems = [
    { label: t.home.quickAccess.album, icon: Camera, path: '/album', color: 'bg-mellow-blue' },
    { label: t.home.quickAccess.report, icon: FileText, path: '/report', color: 'bg-mellow-purple' },
    { label: t.home.quickAccess.knowMyChild, icon: Heart, path: '/know-my-child', color: 'bg-mellow-red' },
    { label: t.home.quickAccess.explore, icon: Compass, path: '/explore', color: 'bg-mellow-yellow' },
    { label: t.home.quickAccess.rewards, icon: Star, path: '/rewards', color: 'bg-mellow-green' },
    { label: t.home.quickAccess.journey, icon: Map, path: '/journey', color: 'bg-cyan-500' },
    { label: t.home.quickAccess.booking, icon: Calendar, path: '/explore', color: 'bg-orange-500' },
  ];

  return (
    <div className="mb-8 mt-8">
      <h3 className="text-sm font-black text-slate-700 mb-5 px-2 uppercase tracking-widest">
        {t.home.quickAccess.title}
      </h3>
      <div className="grid grid-cols-4 gap-y-6 gap-x-3 px-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={() => navigate(item.path)}
              className="flex flex-col items-center gap-2.5 group active:scale-95 transition-all"
            >
              <div className={`w-14 h-14 rounded-[22px] ${item.color} text-white flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(0,0,0,0.2)] group-hover:shadow-xl transition-all relative overflow-hidden`}>
                <div className="absolute inset-0 bg-white/10 group-active:bg-black/10 transition-colors" />
                <Icon size={24} className="relative z-10" />
              </div>
              <span className="text-[12px] font-black text-slate-600 text-center leading-tight px-1">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default QuickAccess;

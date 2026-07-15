import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Heart, Compass, Star, Map, Calendar, Lock, Ticket, Users } from 'lucide-react';
import { useTranslation } from '../LanguageContext';
import GuestUnlockModal from './GuestUnlockModal';

const QuickAccess = () => {
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const isGuest = localStorage.getItem('mellow_guest') === 'true';
  const [lockedFeature, setLockedFeature] = React.useState<string | null>(null);

  const menuItems = [
    { label: t.home.quickAccess.booking, icon: Calendar, path: '/booking', color: 'bg-orange-500' },
    { label: t.home.quickAccess.knowMyChild, icon: Heart, path: '/know-my-child', color: 'bg-mellow-red', isComingSoon: true },
    { label: t.home.quickAccess.explore, icon: Compass, path: '/explore', color: 'bg-mellow-yellow' },
    { label: t.home.quickAccess.rewards, icon: Star, path: '/rewards', color: 'bg-mellow-green', gated: true },
    { label: t.home.quickAccess.journey, icon: Map, path: '/journey', color: 'bg-cyan-500', gated: true },
    { label: t.home.quickAccess.album, icon: Camera, path: '/album', color: 'bg-mellow-blue', gated: true },
    { label: t.home.quickAccess.myCoupons, icon: Ticket, path: '/my-coupons', color: 'bg-pink-500', gated: true },
    { label: t.home.quickAccess.community, icon: Users, path: '/community', color: 'bg-indigo-500', isComingSoon: true },
  ];

  const handleClick = (item: typeof menuItems[number]) => {
    if (item.isComingSoon) return;
    if (isGuest && item.gated) {
      setLockedFeature(item.label);
      return;
    }
    navigate(item.path);
  };

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
              onClick={() => handleClick(item)}
              className={`flex flex-col items-center gap-2.5 group transition-all relative ${item.isComingSoon ? 'opacity-60 cursor-default' : 'active:scale-95'}`}
            >
              {item.isComingSoon && (
                <div className="absolute -top-2 bg-mellow-red text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap z-20">Coming Soon</div>
              )}
              <div className={`w-14 h-14 rounded-[22px] ${item.color} text-white flex items-center justify-center shadow-[0_8px_20px_-6px_rgba(0,0,0,0.2)] ${!item.isComingSoon ? 'group-hover:shadow-xl' : ''} transition-all relative overflow-hidden`}>
                <div className={`absolute inset-0 bg-white/10 ${!item.isComingSoon ? 'group-active:bg-black/10' : ''} transition-colors`} />
                <Icon size={24} className="relative z-10" />
                {isGuest && item.gated && (
                  <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                    <Lock size={16} className="text-white" />
                  </div>
                )}
              </div>
              <span className="text-[12px] font-black text-slate-600 text-center leading-tight px-1">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <GuestUnlockModal
        isOpen={!!lockedFeature}
        onClose={() => setLockedFeature(null)}
        featureLabel={lockedFeature || ''}
      />
    </div>
  );
};

export default QuickAccess;

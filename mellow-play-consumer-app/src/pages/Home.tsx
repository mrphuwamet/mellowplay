import React from 'react';
import { useChildStore } from '../store/useChildStore';
import { ChevronRight, FileText, Globe2, Lock, Medal, Menu, Sparkles, LogOut, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../LanguageContext';
import ReportDisplay from '../components/ReportDisplay';
import QuickAccess from '../components/QuickAccess';
import AnimatedClouds from '../components/AnimatedClouds';
import logo from '../assets/ui/logo.svg';
import defaultAvatar from '../assets/ui/default-avatar.svg';

const Home = () => {
  const { children, selectedChildId, isLoading, selectChild } = useChildStore();
  const navigate = useNavigate();
  const { t, lang, setLang } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const journeyStages = [
    { step: '1', label: t.home.journey.foundation },
    { step: '2', label: t.home.journey.explorer },
    { step: '3', label: t.home.journey.master },
    { step: '4', label: t.home.journey.legend },
  ];
  
  const isGuest = localStorage.getItem('mellow_guest') === 'true';
  const userJson = localStorage.getItem('mellow_user');
  const user = userJson ? JSON.parse(userJson) : null;
  const membershipStatus = user?.membershipStatus || 'inactive';

  const selectedChild = children.find(c => c.id === selectedChildId);

  // Dummy data for guest mode
  const guestChild = {
    id: 'guest',
    name: t.common.guestMode,
    avatar: '',
    level: 1,
    hd_type: 'The Builder'
  };

  const currentChild = isGuest ? guestChild : selectedChild;
  const isMembershipInactive = membershipStatus === 'inactive';

  if (isLoading && children.length === 0 && !isGuest) {
    return (
      <div className="mellow-page flex items-center justify-center">
        <div className="animate-spin text-mellow-purple text-4xl">⏳</div>
      </div>
    );
  }

  const renderLockedOverlay = (message: string, actionLabel: string, action: () => void) => (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/40 backdrop-blur-[2px] rounded-[24px] p-4 text-center">
      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg mb-3">
        <Lock size={20} className="text-mellow-purple" />
      </div>
      <p className="text-[14px] font-black text-mellow-ink uppercase tracking-tight mb-3 px-4">{message}</p>
      <button 
        onClick={action}
        className="px-4 py-2 bg-mellow-purple text-white text-[14px] font-black rounded-xl uppercase tracking-widest shadow-lg active:scale-95 transition-all"
      >
        {actionLabel}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-200 via-blue-100 to-cyan-50 pb-28 max-w-[430px] mx-auto relative overflow-hidden">
      <AnimatedClouds />
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.95),_rgba(255,255,255,0))]" />
      <div className="absolute -top-12 -left-10 h-32 w-32 rounded-full bg-white/30 blur-2xl" />
      <div className="absolute top-24 -right-10 h-40 w-40 rounded-full bg-cyan-200/50 blur-3xl" />
      {isMenuOpen && <div className="fixed inset-0 z-20" onClick={() => setIsMenuOpen(false)} />}

      {/* Header */}
      <header className="px-5 pt-5 pb-4 relative z-30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 px-4 py-3">
            <img src={logo} alt="Mellow Play" className="h-8" />
          </div>

          <div className="relative z-30">
            <div className="flex items-center gap-2 rounded-[28px] border border-white/40 bg-white/55 backdrop-blur-xl shadow-[0_20px_45px_-30px_rgba(15,23,42,0.45)] p-2">
              {isGuest ? (
                <button
                  onClick={() => navigate('/register')}
                  className="px-3 py-2 bg-mellow-purple/10 rounded-full text-[14px] font-black text-mellow-purple uppercase tracking-wider"
                >
                  {t.common.signUp}
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  {children.map(child => (
                    <button
                      key={child.id}
                      onClick={() => selectChild(child.id)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${
                        selectedChildId === child.id
                          ? 'bg-yellow-300 ring-2 ring-yellow-300 ring-offset-2 ring-offset-white'
                          : 'bg-white/70 border border-white/30 opacity-60'
                      }`}
                    >
                      {child.avatar}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => setIsMenuOpen(open => !open)}
                className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-sm transition-transform active:scale-95"
              >
                <Menu size={18} />
              </button>
            </div>

            {isMenuOpen && (
              <div className="absolute right-0 top-full mt-3 w-56 rounded-[28px] border border-white/60 bg-white/90 backdrop-blur-2xl shadow-[0_30px_60px_-30px_rgba(15,23,42,0.45)] p-3 z-30">
                <div className="px-2 pb-3 border-b border-slate-100">
                  <p className="text-[14px] font-black uppercase tracking-[0.22em] text-slate-400 mb-2">
                    {t.home.menuTitle}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Globe2 size={16} className="text-mellow-blue" />
                      <span className="text-[14px] font-black">{t.home.menuLanguage}</span>
                    </div>
                    <div className="flex items-center rounded-full bg-slate-100 p-1">
                      <button
                        onClick={() => setLang('th')}
                        className={`px-3 py-1 rounded-full text-[14px] font-black transition-colors ${
                          lang === 'th' ? 'bg-white text-mellow-purple shadow-sm' : 'text-slate-500'
                        }`}
                      >
                        ไทย
                      </button>
                      <button
                        onClick={() => setLang('en')}
                        className={`px-3 py-1 rounded-full text-[14px] font-black transition-colors ${
                          lang === 'en' ? 'bg-white text-mellow-purple shadow-sm' : 'text-slate-500'
                        }`}
                      >
                        EN
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-3 space-y-2">
                  {!isGuest && (
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        navigate('/settings/profile');
                      }}
                      className="w-full flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-3 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-white flex items-center justify-center text-slate-600 shadow-sm">
                          <Settings size={16} />
                        </div>
                        <span className="text-[14px] font-black text-slate-700">{t.common.profileSettings}</span>
                      </div>
                      <ChevronRight size={16} className="text-slate-400" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      navigate('/report');
                    }}
                    className="w-full flex items-center justify-between rounded-2xl bg-mellow-purple/5 px-3 py-3 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-white flex items-center justify-center text-mellow-purple shadow-sm">
                        <FileText size={16} />
                      </div>
                      <span className="text-[14px] font-black text-slate-700">{t.home.openReport}</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-400" />
                  </button>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      navigate('/journey');
                    }}
                    className="w-full flex items-center justify-between rounded-2xl bg-mellow-blue-soft/60 px-3 py-3 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-white flex items-center justify-center text-mellow-blue shadow-sm">
                        <Medal size={16} />
                      </div>
                      <span className="text-[14px] font-black text-slate-700">{t.home.openJourney}</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-400" />
                  </button>

                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      localStorage.removeItem('mellow_token');
                      localStorage.removeItem('mellow_user');
                      localStorage.removeItem('mellow_guest');
                      navigate('/login');
                    }}
                    className="w-full flex items-center justify-between rounded-2xl bg-red-50 px-3 py-3 text-left mt-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-white flex items-center justify-center text-red-500 shadow-sm">
                        <LogOut size={16} />
                      </div>
                      <span className="text-[14px] font-black text-red-600">{t.common.logout}</span>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="px-5 pb-6 relative z-10">
        {/* Profile Section */}
        <div className="rounded-[32px] p-6 mb-6 shadow-[0_30px_60px_-35px_rgba(15,23,42,0.5)] relative overflow-hidden border border-white/60 bg-white/75 backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-white/35 to-sky-100/80" />
          <div className="absolute -top-10 -right-10 h-28 w-28 rounded-full bg-yellow-200/50 blur-2xl" />
          <div className="absolute bottom-0 right-0 h-24 w-24 rounded-full bg-mellow-blue-soft/70 blur-2xl" />
          {isGuest && (
            <div className="absolute top-0 right-0 bg-mellow-purple text-white px-3 py-1 text-[14px] font-black uppercase rounded-bl-xl z-20">
              {t.common.guestMode}
            </div>
          )}
          <div className="relative z-10 flex items-center gap-4">
            {/* Profile Avatar */}
            <div className="flex-shrink-0">
              <div className={`w-20 h-20 rounded-[28px] flex items-center justify-center text-4xl shadow-lg ring-4 ring-white/60 overflow-hidden ${
                isGuest ? 'bg-slate-200' : 'bg-gradient-to-b from-yellow-200 to-yellow-300'
              }`}>
                {isGuest ? (
                  <img src={defaultAvatar} alt="Guest" className="w-12 h-12 opacity-60 grayscale brightness-50" />
                ) : (
                  currentChild?.avatar || <img src={defaultAvatar} alt="Profile" className="w-12 h-12 opacity-80" />
                )}
              </div>
            </div>

            {/* Profile Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-[12px] font-black uppercase text-slate-400 mb-1">
                    {t.home.greeting}
                  </p>
                  <h2 className="text-[22px] leading-none font-black text-slate-800 mb-2">{currentChild?.name || 'Explorer'}</h2>
                </div>
              </div>

              {/* Yellow Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-300 rounded-full text-white font-bold text-xs shadow-sm">
                <Medal size={14} />
                {currentChild?.hd_type || 'The Builder'}
              </div>
            </div>
          </div>
        </div>

        <QuickAccess />

        {/* Report Display Section */}
        <ReportDisplay
          isGuest={isGuest}
          isLocked={false}
          hasData={!isGuest && children.length > 0}
          onRegister={() => navigate('/register')}
          onRenew={() => navigate('/rewards')}
        />

        {/* Learning Journey Section */}
          <h3 className="text-sm font-black text-slate-700 mb-4 px-2">{t.home.learningJourney}</h3>
        <div className="mb-6 relative">
           {isGuest && renderLockedOverlay(
            t.home.joinToSeeSkills,
             t.home.registerBtn,
             () => navigate('/register')
           )}
          <div className={`bg-white/85 border border-white rounded-[28px] p-6 shadow-[0_25px_55px_-35px_rgba(15,23,42,0.45)] backdrop-blur-sm relative overflow-hidden transition-all ${isGuest ? 'blur-[2px]' : ''}`}>
            {/* Background gradient to suggest a path */}
            <div className="absolute inset-0 bg-gradient-to-r from-green-100/90 via-white to-blue-50/90 opacity-90"></div>

            {/* Journey path with stages */}
            <div className="relative z-20 flex items-center justify-between px-2">
              {journeyStages.map((stage, index) => (
                <div key={stage.step} className="flex flex-col items-center gap-2">
                  {/* Stage Badge */}
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-yellow-200 to-yellow-300 flex items-center justify-center font-black text-sm text-white border-2 border-white shadow-md">
                    {stage.step}
                  </div>
                  <span className="text-xs font-bold text-center text-slate-600 leading-tight w-16">
                    {stage.label}
                  </span>
                  {/* Connecting Line */}
                  {index < journeyStages.length - 1 && (
                    <div className="absolute left-1/2 top-7 w-14 h-1 bg-gradient-to-r from-yellow-300 to-transparent"></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Decorative element */}
        <div className="h-8"></div>
      </main>
    </div>
  );
};

export default Home;

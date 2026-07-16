import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Roadmap from './pages/Roadmap';
import KnowMyChild from './pages/KnowMyChild';
import Album from './pages/Album';
import Explore from './pages/Explore';
import Rewards from './pages/Rewards';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import AddChild from './pages/AddChild';
import ReportDetail from './pages/ReportDetail';
import NewsDetail from './pages/NewsDetail';
import NewsList from './pages/NewsList';
import SettingsProfile from './pages/SettingsProfile';
import Booking from './pages/Booking';
import CourseList from './pages/CourseList';
import CourseDetail from './pages/CourseDetail';
import BookingSuccess from './pages/BookingSuccess';
import MyCoupons from './pages/MyCoupons';
import PackagePurchaseSuccess from './pages/PackagePurchaseSuccess';
import { Map, Star, Camera, Compass, Home as HomeIcon, Lock, Users, X, Sparkles } from 'lucide-react';
import { useChildStore } from './store/useChildStore';
import { LanguageProvider, useTranslation } from './LanguageContext';
import GuestUnlockModal from './components/GuestUnlockModal';
import { pingVisit } from './utils/visitTracker';
import { retryPendingLineShare } from './utils/lineShare';

const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const fetchChildren = useChildStore(state => state.fetchChildren);
  const { t, lang } = useTranslation();

  // Bumped to force a re-render after silently flipping the guest flag below —
  // components read `mellow_guest` straight from localStorage on every render,
  // so they need this component to re-render for the change to show up.
  const [, forceGuestRerender] = React.useState(0);

  // LINE's in-app browser bootstraps a LIFF session the first time any page
  // calls liff.init() (e.g. the LINE-share button on Course Detail) — that
  // bootstrap is a real page redirect through LINE's own domain, and it
  // lands back on this app's registered root URL, dropping whatever deep
  // path (like /course/5) the user actually opened. LINE preserves that
  // original path in a `liff.state` query param on the return redirect
  // specifically so apps can restore it — without this, every deep link
  // opened inside LINE would silently bounce to Home instead.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const liffState = params.get('liff.state');
    if (liffState) {
      navigate(liffState.startsWith('/') ? liffState : `/${liffState}`, { replace: true });
    }

    // The same redirect can interrupt a share button tap mid-flight (the
    // click's own liff.init() call triggers it) — the tab visibly flickers
    // and the share never opens. If shareToLine() left a pending share
    // behind because it got torn down before finishing, retry it now; LIFF
    // is actually initialized this time, so it goes through normally.
    retryPendingLineShare();
  }, []);

  React.useEffect(() => {
    const token = localStorage.getItem('mellow_token');
    const isGuest = localStorage.getItem('mellow_guest') === 'true';
    const isAuthPage = location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/forgot-password';

    if (!token && !isGuest && !isAuthPage) {
      // A visitor with no session — most often someone opening a link shared
      // from outside the app — should land straight on the page they opened
      // instead of being bounced to the login screen first. Drop them into
      // guest mode instead; gated features still prompt sign-up/login on use.
      localStorage.setItem('mellow_guest', 'true');
      forceGuestRerender(n => n + 1);
    }
  }, [location.pathname, navigate]);

  React.useEffect(() => {
    pingVisit(location.pathname);
  }, [location.pathname]);

  React.useEffect(() => {
    const token = localStorage.getItem('mellow_token');
    const userJson = localStorage.getItem('mellow_user');
    const isGuest = localStorage.getItem('mellow_guest') === 'true';

    if (token && userJson && !isGuest) {
      const user = JSON.parse(userJson);
      fetchChildren(user.id);
    }
  }, [fetchChildren]); // Only fetch once when store initializes

  const isGuest = localStorage.getItem('mellow_guest') === 'true';
  const showNav = ['/', '/journey', '/album', '/explore', '/rewards'].includes(location.pathname);
  const [lockedNavFeature, setLockedNavFeature] = React.useState<string | null>(null);
  const [showCommunitySoon, setShowCommunitySoon] = React.useState(false);

  const guardedNav = (e: React.MouseEvent, label: string) => {
    if (isGuest) {
      e.preventDefault();
      setLockedNavFeature(label);
    }
  };

  return (
    <div className="max-w-[430px] mx-auto min-h-screen bg-[#fbfaf7] relative shadow-2xl overflow-hidden">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/add-child" element={<AddChild />} />
        <Route path="/" element={<Home />} />
        <Route path="/journey" element={<Roadmap />} />
        <Route path="/know-my-child" element={<Navigate to="/" replace />} />
        <Route path="/know-my-child/:type" element={<Navigate to="/" replace />} />
        <Route path="/album" element={<Album />} />
        <Route path="/report/:bookingId" element={<ReportDetail />} />
        <Route path="/news/:id" element={<NewsDetail />} />
        <Route path="/news-feed/:type" element={<NewsList />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/rewards" element={<Rewards />} />
        <Route path="/settings" element={<SettingsProfile />} />
        <Route path="/settings/profile" element={<SettingsProfile />} />
        <Route path="/booking" element={<Booking />} />
        <Route path="/booking-success" element={<BookingSuccess />} />
        <Route path="/my-coupons" element={<MyCoupons />} />
        <Route path="/package-purchase-success" element={<PackagePurchaseSuccess />} />
        <Route path="/courses/:type" element={<CourseList />} />
        <Route path="/course/:id" element={<CourseDetail />} />
      </Routes>

      {/* Shared Bottom Navigation */}
      {showNav && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-24 bg-white/90 backdrop-blur-xl rounded-t-[40px] shadow-[0_-15px_40px_-20px_rgba(0,0,0,0.15)] border-t border-white/40 flex justify-around items-center px-3 z-20">
          <Link to="/" className={`flex flex-col items-center gap-1.5 transition-all active:scale-90 ${location.pathname === '/' ? 'text-mellow-red' : 'text-slate-400'}`}>
            <HomeIcon size={24} />
            <span className="text-[14px] font-black tracking-tighter">{t.nav.home}</span>
          </Link>
          <Link to="/journey" onClick={e => guardedNav(e, t.nav.journey)} className={`flex flex-col items-center gap-1 transition-colors ${location.pathname === '/journey' ? 'text-mellow-purple' : 'text-slate-400'}`}>
            <div className="relative">
              <Map size={24} />
              {isGuest && (
                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white ring-1 ring-slate-200 shadow-sm flex items-center justify-center">
                  <Lock size={9} className="text-slate-600" strokeWidth={3} />
                </div>
              )}
            </div>
            <span className="text-[14px] font-black tracking-tighter">{t.nav.journey}</span>
          </Link>
          <Link to="/album" onClick={e => guardedNav(e, t.nav.album)} className={`flex flex-col items-center gap-1 transition-all active:scale-90 ${location.pathname === '/album' ? 'text-mellow-blue' : 'text-slate-400'}`}>
            <div className="relative">
              <Camera size={24} />
              {isGuest && (
                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white ring-1 ring-slate-200 shadow-sm flex items-center justify-center">
                  <Lock size={9} className="text-slate-600" strokeWidth={3} />
                </div>
              )}
            </div>
            <span className="text-[14px] font-black tracking-tighter">{t.nav.album}</span>
          </Link>
          <Link to="/explore" className={`flex flex-col items-center gap-1 transition-colors ${location.pathname === '/explore' ? 'text-mellow-yellow' : 'text-slate-400'}`}>
            <Compass size={24} />
            <span className="text-[14px] font-black tracking-tighter">{t.nav.explore}</span>
          </Link>
          <Link to="/rewards" onClick={e => guardedNav(e, t.nav.rewards)} className={`flex flex-col items-center gap-1 transition-all active:scale-90 ${location.pathname === '/rewards' ? 'text-mellow-green' : 'text-slate-400'}`}>
            <div className="relative">
              <Star size={24} />
              {isGuest && (
                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white ring-1 ring-slate-200 shadow-sm flex items-center justify-center">
                  <Lock size={9} className="text-slate-600" strokeWidth={3} />
                </div>
              )}
            </div>
            <span className="text-[14px] font-black tracking-tighter">{t.nav.rewards}</span>
          </Link>
          {/* Community — placeholder, feature not built yet */}
          <button onClick={() => setShowCommunitySoon(true)} className="flex flex-col items-center gap-1 text-slate-400 active:scale-90 transition-transform">
            <Users size={24} />
            <span className="text-[14px] font-black tracking-tighter">{lang === 'en' ? 'Community' : 'ชุมชน'}</span>
          </button>
        </nav>
      )}

      {showCommunitySoon && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowCommunitySoon(false)}
        >
          <div
            className="relative w-full max-w-xs bg-white rounded-[28px] p-6 text-center shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setShowCommunitySoon(false)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90 transition-transform">
              <X size={16} />
            </button>
            <div className="w-16 h-16 rounded-full bg-mellow-purple/10 flex items-center justify-center mx-auto mb-4 relative">
              <Users size={26} className="text-mellow-purple" />
              <Sparkles size={16} className="text-mellow-yellow absolute -top-1 -right-1" fill="currentColor" />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2">
              {lang === 'en' ? 'Coming Soon' : 'เร็วๆ นี้'}
            </h3>
            <p className="text-sm font-bold text-slate-500 leading-relaxed">
              {lang === 'en'
                ? "We're building a community space for families — stay tuned!"
                : 'พื้นที่ชุมชนสำหรับครอบครัว Mellow Play กำลังจะมาเร็วๆ นี้ รอติดตามกันนะ!'}
            </p>
          </div>
        </div>
      )}

      <GuestUnlockModal
        isOpen={!!lockedNavFeature}
        onClose={() => setLockedNavFeature(null)}
        featureLabel={lockedNavFeature || ''}
      />
    </div>
  );
};

function App() {
  return (
    <LanguageProvider>
      <Router>
        <AppContent />
      </Router>
    </LanguageProvider>
  );
}

export default App;

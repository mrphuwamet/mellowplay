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
import SettingsProfile from './pages/SettingsProfile';
import Booking from './pages/Booking';
import CourseList from './pages/CourseList';
import CourseDetail from './pages/CourseDetail';
import BookingSuccess from './pages/BookingSuccess';
import MyCoupons from './pages/MyCoupons';
import PackagePurchaseSuccess from './pages/PackagePurchaseSuccess';
import { Map, Star, Camera, Compass, Home as HomeIcon, Lock } from 'lucide-react';
import { useChildStore } from './store/useChildStore';
import { LanguageProvider, useTranslation } from './LanguageContext';
import GuestUnlockModal from './components/GuestUnlockModal';

const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const fetchChildren = useChildStore(state => state.fetchChildren);
  const { t } = useTranslation();

  React.useEffect(() => {
    const token = localStorage.getItem('mellow_token');
    const isGuest = localStorage.getItem('mellow_guest') === 'true';

    if (!token && !isGuest && location.pathname !== '/login' && location.pathname !== '/register' && location.pathname !== '/forgot-password') {
      navigate('/login');
    }
  }, [location.pathname, navigate]);

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
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-24 bg-white/90 backdrop-blur-xl rounded-t-[40px] shadow-[0_-15px_40px_-20px_rgba(0,0,0,0.15)] border-t border-white/40 flex justify-around items-center px-6 z-20">
          <Link to="/" className={`flex flex-col items-center gap-1.5 transition-all active:scale-90 ${location.pathname === '/' ? 'text-mellow-red' : 'text-slate-400'}`}>
            <HomeIcon size={24} />
            <span className="text-[14px] font-black tracking-tighter">{t.nav.home}</span>
          </Link>
          <Link to="/journey" onClick={e => guardedNav(e, t.nav.journey)} className={`relative flex flex-col items-center gap-1 transition-colors ${location.pathname === '/journey' ? 'text-mellow-purple' : 'text-slate-400'}`}>
            <Map size={24} />
            {isGuest && <Lock size={10} className="absolute -top-0.5 right-2 text-slate-400" />}
            <span className="text-[14px] font-black tracking-tighter">{t.nav.journey}</span>
          </Link>
          <Link to="/album" onClick={e => guardedNav(e, t.nav.album)} className={`relative flex flex-col items-center gap-1 transition-all active:scale-90 ${location.pathname === '/album' ? 'text-mellow-blue' : 'text-slate-400'}`}>
            <Camera size={24} />
            {isGuest && <Lock size={10} className="absolute -top-0.5 right-2 text-slate-400" />}
            <span className="text-[14px] font-black tracking-tighter">{t.nav.album}</span>
          </Link>
          <Link to="/explore" className={`flex flex-col items-center gap-1 transition-colors ${location.pathname === '/explore' ? 'text-mellow-yellow' : 'text-slate-400'}`}>
            <Compass size={24} />
            <span className="text-[14px] font-black tracking-tighter">{t.nav.explore}</span>
          </Link>
          <Link to="/rewards" onClick={e => guardedNav(e, t.nav.rewards)} className={`relative flex flex-col items-center gap-1 transition-all active:scale-90 ${location.pathname === '/rewards' ? 'text-mellow-green' : 'text-slate-400'}`}>
            <Star size={24} />
            {isGuest && <Lock size={10} className="absolute -top-0.5 right-2 text-slate-400" />}
            <span className="text-[14px] font-black tracking-tighter">{t.nav.rewards}</span>
          </Link>
        </nav>
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

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import Home from './pages/Home';
import Roadmap from './pages/Roadmap';
import KnowMyChild from './pages/KnowMyChild';
import PCGDetail from './pages/PCGDetail';
import Album from './pages/Album';
import Explore from './pages/Explore';
import Rewards from './pages/Rewards';
import Login from './pages/Login';
import Register from './pages/Register';
import Report from './pages/Report';
import { Map, Star, Camera, Compass, Home as HomeIcon } from 'lucide-react';
import { useChildStore } from './store/useChildStore';
import { LanguageProvider, useTranslation } from './LanguageContext';

const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const fetchChildren = useChildStore(state => state.fetchChildren);
  const { t } = useTranslation();

  React.useEffect(() => {
    const token = localStorage.getItem('mellow_token');
    const isGuest = localStorage.getItem('mellow_guest') === 'true';

    if (!token && !isGuest && location.pathname !== '/login' && location.pathname !== '/register') {
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
  const showNav = location.pathname !== '/login' && location.pathname !== '/register';

  return (
    <div className="max-w-[430px] mx-auto min-h-screen bg-[#fbfaf7] relative shadow-2xl">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<Home />} />
        <Route path="/journey" element={<Roadmap />} />
        <Route path="/know-my-child" element={<KnowMyChild />} />
        <Route path="/know-my-child/:type" element={<PCGDetail />} />
        <Route path="/album" element={<Album />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/rewards" element={<Rewards />} />
        <Route path="/report" element={<Report />} />
      </Routes>

      {/* Shared Bottom Navigation */}
      {showNav && (
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] h-24 bg-white/90 backdrop-blur-xl rounded-t-[40px] shadow-[0_-15px_40px_-20px_rgba(0,0,0,0.15)] border-t border-white/40 flex justify-around items-center px-6 z-20">
          <Link to="/" className={`flex flex-col items-center gap-1.5 transition-all active:scale-90 ${location.pathname === '/' ? 'text-mellow-red' : 'text-slate-400'}`}>
            <HomeIcon size={24} />
            <span className="text-[14px] font-black tracking-tighter">{t.nav.home}</span>
          </Link>
          <Link to="/journey" className={`flex flex-col items-center gap-1 transition-colors ${location.pathname === '/journey' ? 'text-mellow-purple' : 'text-slate-400'}`}>
            <Map size={24} />
            <span className="text-[14px] font-black tracking-tighter">{t.nav.journey}</span>
          </Link>
          <Link to="/album" className={`flex flex-col items-center gap-1 transition-colors ${location.pathname === '/album' ? 'text-mellow-blue' : 'text-slate-400'}`}>
            <Camera size={24} />
            <span className="text-[14px] font-black tracking-tighter">{t.nav.album}</span>
          </Link>
          <Link to="/explore" className={`flex flex-col items-center gap-1 transition-colors ${location.pathname === '/explore' ? 'text-mellow-yellow' : 'text-slate-400'}`}>
            <Compass size={24} />
            <span className="text-[14px] font-black tracking-tighter">{t.nav.explore}</span>
          </Link>
          <Link to="/rewards" className={`flex flex-col items-center gap-1 transition-colors ${location.pathname === '/rewards' ? 'text-mellow-green' : 'text-slate-400'}`}>
            <Star size={24} />
            <span className="text-[14px] font-black tracking-tighter">{t.nav.rewards}</span>
          </Link>
        </nav>
      )}
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

import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate, useParams, Navigate } from 'react-router-dom';
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
import ContactUs from './pages/ContactUs';
import PackagePurchaseSuccess from './pages/PackagePurchaseSuccess';
import { useChildStore } from './store/useChildStore';
import { LanguageProvider } from './LanguageContext';
import AppShell from './components/AppShell';
import { pingVisit } from './utils/visitTracker';
import { retryPendingLineShare } from './utils/lineShare';

// /course/:id was the original path; already shared/bookmarked links must
// keep resolving, so it redirects to the new canonical /class/:id instead
// of being removed outright.
const CourseToClassRedirect = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/class/${id}`} replace />;
};

const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const fetchChildren = useChildStore(state => state.fetchChildren);

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

  return (
    <AppShell>
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
        <Route path="/contact" element={<ContactUs />} />
        <Route path="/package-purchase-success" element={<PackagePurchaseSuccess />} />
        <Route path="/courses/:type" element={<CourseList />} />
        <Route path="/event" element={<CourseList type="event" />} />
        <Route path="/class/:id" element={<CourseDetail />} />
        <Route path="/course/:id" element={<CourseToClassRedirect />} />
      </Routes>
    </AppShell>
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

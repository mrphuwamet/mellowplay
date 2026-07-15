import React from 'react';
import { useChildStore } from '../store/useChildStore';
import { ChevronRight, FileText, Lock, Medal, Menu, LogOut, Settings, Ticket, Calendar, LogIn, MessageCircle, Facebook, User, AlertCircle, Loader2, MapPin, Clock, ArrowRightLeft, Crown, Cake } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import QuickAccess from '../components/QuickAccess';
import AnimatedClouds from '../components/AnimatedClouds';
import CourseCard from '../components/CourseCard';
import AddChildModal from '../components/AddChildModal';
import AvatarPickerModal from '../components/AvatarPickerModal';
import BookingDetailModal from '../components/BookingDetailModal';
import ChildAvatar from '../components/ChildAvatar';
import LoadingLogo from '../components/LoadingLogo';
import BirthdayModal from '../components/BirthdayModal';
import logo from '../assets/ui/logo.svg';
import defaultAvatar from '../assets/ui/default-avatar.svg';
import apiClient from '../utils/apiClient';
import { useCourseBookingStatus } from '../hooks/useCourseBookingStatus';
import { BOOKING_STATUS_META } from '../utils/bookingStatus';

const Home = () => {
  const { children, selectedChildId, isLoading: isStoreLoading, selectChild } = useChildStore();
  const navigate = useNavigate();
  const { t, lang, setLang } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isAddChildOpen, setIsAddChildOpen] = React.useState(false);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = React.useState(false);
  const [isProfileSwitcherOpen, setIsProfileSwitcherOpen] = React.useState(false);
  const [recommendedCourses, setRecommendedCourses] = React.useState<any[]>([]);
  const [recentHistory, setRecentHistory] = React.useState<any[]>([]);
  const [pendingBookings, setPendingBookings] = React.useState<any[]>([]);
  const [upcomingClasses, setUpcomingClasses] = React.useState<any[]>([]);
  const [selectedBooking, setSelectedBooking] = React.useState<any | null>(null);
  const [isCancelling, setIsCancelling] = React.useState<number | null>(null);
  const [cancelBookingId, setCancelBookingId] = React.useState<number | null>(null);
  const [isDataLoading, setIsDataLoading] = React.useState(true);
  const [isBirthdayModalOpen, setIsBirthdayModalOpen] = React.useState(false);

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
  const { statusMap: courseBookingStatus, isLoading: isBookingStatusLoading } = useCourseBookingStatus(user?.id, currentChild?.id);

  React.useEffect(() => {
    const fetchData = async () => {
      setIsDataLoading(true);
      try {
        const coursesReq = apiClient.get('/admin/courses');
        const historyReq = (!isGuest && user?.id) ? apiClient.get(`/profiles/bookings/history?userId=${user.id}`) : Promise.resolve({ data: { success: false } });
        const pendingReq = (!isGuest && user?.id) ? apiClient.get(`/profiles/bookings/pending?userId=${user.id}`) : Promise.resolve({ data: { success: false } });
        const upcomingReq = (!isGuest && user?.id) ? apiClient.get(`/profiles/bookings/upcoming?userId=${user.id}`) : Promise.resolve({ data: { success: false } });

        const [coursesRes, historyRes, pendingRes, upcomingRes] = await Promise.all([coursesReq, historyReq, pendingReq, upcomingReq]);

        if (coursesRes.data.success) {
          setRecommendedCourses(coursesRes.data.courses.filter((c: any) => c.is_recommended === 1 || c.is_recommended === true));
        }

        if (historyRes.data.success) {
          const bookings = currentChild ? historyRes.data.bookings.filter((b: any) => b.child_id === currentChild.id) : historyRes.data.bookings;
          const sorted = [...bookings].sort((a: any, b: any) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
          setRecentHistory(sorted.slice(0, 5));
        }

        if (pendingRes.data.success) {
          const bookings = pendingRes.data.bookings || [];
          setPendingBookings(currentChild ? bookings.filter((b: any) => b.child_id === currentChild.id) : bookings);
        }

        if (upcomingRes.data.success) {
          const bookings = upcomingRes.data.bookings || [];
          setUpcomingClasses(currentChild ? bookings.filter((b: any) => b.child_id === currentChild.id) : bookings);
        }
      } catch (err) {
        console.error('Failed to fetch home data:', err);
      } finally {
        setIsDataLoading(false);
      }
    };
    fetchData();
  }, [currentChild?.id, isGuest]);

  if (isStoreLoading && children.length === 0 && !isGuest) {
    return (
      <div className="mellow-page flex items-center justify-center min-h-screen">
        <LoadingLogo />
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

  const confirmCancelBooking = async () => {
    if (!cancelBookingId) return;
    setIsCancelling(cancelBookingId);
    try {
      const res = await apiClient.post(`/profiles/bookings/${cancelBookingId}/cancel`, { userId: user?.id });
      if (res.data.success) {
        setPendingBookings(prev => prev.filter(b => b.id !== cancelBookingId));
      }
    } catch (err) {
      console.error('Failed to cancel booking:', err);
    }
    setIsCancelling(null);
    setCancelBookingId(null);
  };

  const calculateAge = (dobStr?: string) => {
    if (!dobStr) return '';
    const diff = Date.now() - new Date(dobStr).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
  };

  const renderProfileSwitcherModal = () => (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setIsProfileSwitcherOpen(false)}>
      <div className="bg-white rounded-3xl p-6 w-full max-w-[320px] shadow-2xl relative" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-slate-800 text-center mb-4 uppercase tracking-wider">{lang === 'en' ? 'Switch Profile' : 'สลับโปรไฟล์'}</h3>
        <div className="flex flex-col gap-3">
          {children.map(child => (
            <button
              key={child.id}
              onClick={() => { selectChild(child.id); setIsProfileSwitcherOpen(false); }}
              className={`flex items-center gap-4 p-3 rounded-2xl transition-all ${selectedChildId === child.id ? 'bg-mellow-purple/10 border border-mellow-purple/30' : 'hover:bg-slate-50 border border-transparent'}`}
            >
              <ChildAvatar avatarType={child.avatar} className="w-12 h-12 flex-shrink-0" />
              <div className="flex flex-col items-start text-left">
                <span className="text-[16px] font-bold text-slate-700 leading-tight">
                  {child.name}
                </span>
                {child.nickname && (
                  <span className="text-[13px] font-medium text-slate-500">
                    ({child.nickname})
                  </span>
                )}
              </div>
            </button>
          ))}
          <button
            onClick={() => { setIsProfileSwitcherOpen(false); setIsAddChildOpen(true); }}
            className="flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 border border-dashed border-slate-300 transition-all text-slate-500 hover:text-slate-700"
          >
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <span className="text-2xl font-black">+</span>
            </div>
            <span className="text-[16px] font-bold">{lang === 'en' ? 'Add New' : 'เพิ่มโปรไฟล์ใหม่'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-200 via-blue-100 to-cyan-50 pb-28 max-w-[430px] mx-auto relative overflow-hidden">
      {isProfileSwitcherOpen && renderProfileSwitcherModal()}
      <AnimatedClouds />
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.95),_rgba(255,255,255,0))]" />
      {isMenuOpen && <div className="fixed inset-0 z-20 bg-black/20 backdrop-blur-sm transition-all" onClick={() => setIsMenuOpen(false)} />}

      <header className="px-5 pt-5 pb-4 relative z-30">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 px-4 py-3">
            <img src={logo} alt="Mellow Play" className="h-8" />
          </div>

          <div className="relative z-30">
            <div className="flex items-center gap-2 rounded-[28px] border border-white/40 bg-white/55 backdrop-blur-xl shadow-[0_20px_45px_-30px_rgba(15,23,42,0.45)] p-2">
              {isGuest && (
                <button
                  onClick={() => navigate('/register')}
                  className="px-3 py-2 bg-mellow-purple/10 rounded-full text-[14px] font-black text-mellow-purple uppercase tracking-wider"
                >
                  {t.common.signUp}
                </button>
              )}

              <LanguageToggle />

              <button
                onClick={() => setIsMenuOpen(open => !open)}
                className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-sm transition-transform active:scale-95"
              >
                <Menu size={18} />
              </button>

              {isMenuOpen && (
                <div className="absolute top-14 right-0 w-64 bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/60 overflow-hidden py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-2 mb-2 border-b border-slate-100">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">{t.home.menuTitle}</h3>
                  </div>

                  {isGuest ? (
                    <>
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          navigate('/login');
                        }}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-slate-700"
                      >
                        <div className="w-8 h-8 rounded-full bg-mellow-purple/10 flex items-center justify-center text-mellow-purple">
                          <LogIn size={16} />
                        </div>
                        <span className="font-bold text-sm">{t.common.login}</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          navigate('/register');
                        }}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-slate-700"
                      >
                        <div className="w-8 h-8 rounded-full bg-mellow-purple/10 flex items-center justify-center text-mellow-purple">
                          <User size={16} />
                        </div>
                        <span className="font-bold text-sm">{t.common.register}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          navigate('/settings/profile');
                        }}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-slate-700"
                      >
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                          <Settings size={16} />
                        </div>
                        <span className="font-bold text-sm">{t.common.settings}</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          setIsAddChildOpen(true);
                        }}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-slate-700"
                      >
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                          <User size={16} />
                        </div>
                        <span className="font-bold text-sm">{lang === 'en' ? 'Add Child' : 'เพิ่มข้อมูลเด็ก'}</span>
                      </button>
                      <div className="mx-4 my-1 border-t border-slate-100" />
                      <a
                        href="https://lin.ee/vC0dDzn"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setIsMenuOpen(false)}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-slate-700"
                      >
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2C6.48 2 2 6.05 2 11.05C2 15.55 5.74 19.3 10.82 20.01L11.5 20.11V17.63C8.35 17.33 6 15.4 6 13.05C6 10.46 8.69 8.36 12 8.36C15.31 8.36 18 10.46 18 13.05C18 14.47 17.19 15.78 15.88 16.69L15 17.28V14.05H13V20.1L13.67 19.99C18.4 19.12 22 15.42 22 11.05C22 6.05 17.52 2 12 2Z" fill="#06C755" />
                          </svg>
                        </div>
                        <span className="font-bold text-sm">LINE OA</span>
                      </a>
                      <a
                        href="https://www.facebook.com/mellowplayxmilk"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setIsMenuOpen(false)}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-slate-700"
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2" />
                          </svg>
                        </div>
                        <span className="font-bold text-sm">Facebook</span>
                      </a>
                      <div className="mx-4 my-1 border-t border-slate-100" />
                      <button
                        onClick={() => {
                          setIsMenuOpen(false);
                          localStorage.removeItem('mellow_token');
                          localStorage.removeItem('mellow_user');
                          localStorage.removeItem('mellow_guest');
                          navigate('/login');
                        }}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-red-50 transition-colors text-red-600"
                      >
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-500">
                          <LogOut size={16} />
                        </div>
                        <span className="font-bold text-sm">{t.common.logout}</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="px-5 pb-6 relative z-10">
        <div className="rounded-[32px] p-6 mb-6 shadow-[0_30px_60px_-35px_rgba(15,23,42,0.5)] relative overflow-hidden border border-white/60 bg-white/75 backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-white/35 to-sky-100/80" />

          {/* Top Right Actions */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            {isGuest ? (
              <div className="bg-mellow-purple text-white px-3 py-1 text-[12px] font-black uppercase rounded-xl">
                {t.common.guestMode}
              </div>
            ) : (
              children.length > 1 && (
                <button
                  onClick={() => setIsProfileSwitcherOpen(true)}
                  className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-md shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all active:scale-95"
                >
                  <ArrowRightLeft size={16} />
                </button>
              )
            )}
          </div>

          <div className="relative z-10 flex items-center gap-4 mt-2">
            <div className="flex-shrink-0">
              {isGuest ? (
                <div className="w-20 h-20 rounded-[28px] bg-slate-200 flex items-center justify-center shadow-lg ring-4 ring-white/60 overflow-hidden">
                  <img src={defaultAvatar} alt="Guest" className="w-12 h-12 opacity-60 grayscale brightness-50" />
                </div>
              ) : (
                <button
                  onClick={() => currentChild ? setIsAvatarPickerOpen(true) : setIsAddChildOpen(true)}
                  className={`relative block transition-transform active:scale-95`}
                >
                  <ChildAvatar avatarType={currentChild?.avatar} className="w-20 h-20 ring-4 ring-white/60 shadow-lg" />
                </button>
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-[12px] font-black uppercase text-slate-400 mb-1">
                    {t.home.greeting}
                  </p>
                  {isGuest ? (
                    <h2 className="text-[22px] leading-none font-black text-slate-800 mb-2">Explorer</h2>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => !currentChild && setIsAddChildOpen(true)}
                        className={`text-[18px] leading-tight font-black text-slate-800 text-left transition-opacity ${!currentChild ? 'hover:opacity-70 text-mellow-purple underline decoration-2 underline-offset-4' : ''}`}
                      >
                        {currentChild ? `${currentChild.name} ${currentChild.nickname ? `(${currentChild.nickname})` : ''}` : (lang === 'th' ? 'เพิ่มข้อมูลเด็ก' : 'Add My Child')}
                      </button>

                      {currentChild && (
                        <div className="flex flex-wrap items-center gap-2">
                          {currentChild.dob && (
                            <button
                              onClick={() => setIsBirthdayModalOpen(true)}
                              className="inline-flex items-center gap-1 text-[11px] font-black bg-sky-100 text-sky-600 px-2.5 py-1 rounded-full shadow-sm active:scale-95 transition-transform"
                            >
                              <Cake size={12} strokeWidth={2.5} />
                              {calculateAge(currentChild.dob)} {lang === 'en' ? 'yrs' : 'ปี'}
                            </button>
                          )}
                          <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-full shadow-sm ${
                            membershipStatus === 'premium'
                              ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white'
                              : 'bg-emerald-100 text-emerald-600'
                          }`}>
                            {membershipStatus === 'premium' ? <Crown size={12} strokeWidth={2.5} /> : <Medal size={12} strokeWidth={2.5} />}
                            {membershipStatus === 'premium' ? 'Premium' : 'Regular'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {pendingBookings.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-black text-slate-700 mb-3 px-2 uppercase tracking-widest">
              {lang === 'en' ? 'Pending Approval' : 'รอการอนุมัติ'}
            </h3>
            <div className="space-y-3">
              {pendingBookings.map(booking => (
                <div key={booking.id} className="bg-white/80 border border-white p-4 rounded-2xl flex items-center justify-between shadow-sm">
                  <div>
                    <p className="font-bold text-sm text-slate-800">{booking.course_name}</p>
                    <p className="text-xs text-slate-500">{new Date(booking.scheduled_at).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={() => setCancelBookingId(booking.id)}
                    className="text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg"
                  >
                    {lang === 'en' ? 'Cancel' : 'ยกเลิก'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <QuickAccess />

        <div className="mb-8 px-5">
          <h3 className="text-sm font-black text-slate-700 mb-3 uppercase tracking-widest flex items-center justify-between">
            {lang === 'en' ? 'Upcoming Classes' : 'คลาสที่กำลังจะมาถึง'}
          </h3>

          {isDataLoading ? (
            <div className="space-y-3">
              {[0, 1].map(i => (
                <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex gap-4 items-center animate-pulse">
                  <div className="w-16 h-16 rounded-xl bg-slate-100 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-2/3 bg-slate-100 rounded-full" />
                    <div className="h-2.5 w-1/2 bg-slate-100 rounded-full" />
                    <div className="h-2.5 w-1/3 bg-slate-100 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : upcomingClasses.length > 0 ? (
            <div className="space-y-3">
              {upcomingClasses.map(booking => (
                <div
                  key={booking.id}
                  onClick={() => setSelectedBooking(booking)}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative cursor-pointer hover:shadow-md transition-all active:scale-[0.98]"
                >
                  <div className="flex gap-4 items-center">
                    {booking.course_thumbnail ? (
                      <img src={booking.course_thumbnail} alt={booking.course_name} className="w-16 h-16 rounded-xl object-cover" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center">
                        <Calendar size={24} className="text-slate-400" />
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-slate-800 line-clamp-1">{booking.course_name}</h4>
                      <p className="text-xs font-medium text-slate-500 mt-0.5">
                        {new Date(booking.scheduled_at).toLocaleDateString()} • {new Date(booking.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <MapPin size={12} className="text-mellow-purple" />
                        <span className="text-xs font-medium text-slate-600">{booking.branch_name}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white/60 backdrop-blur-sm rounded-[24px] p-6 text-center border border-white/80 shadow-sm">
              <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Calendar size={20} className="text-blue-400" />
              </div>
              <p className="text-[14px] font-bold text-slate-600 mb-4">
                {lang === 'en' ? 'No upcoming classes' : 'ยังไม่มีคลาสที่จองไว้'}
              </p>
              <button
                onClick={() => navigate('/booking')}
                className="px-6 py-2.5 bg-slate-900 text-white text-[13px] font-black rounded-xl uppercase tracking-widest shadow-md active:scale-95 transition-all w-full max-w-[200px]"
              >
                {lang === 'en' ? 'Explore Classes' : 'ค้นหาคลาสเรียน'}
              </button>
            </div>
          )}
        </div>

        {(isDataLoading || isBookingStatusLoading) ? (
          <div className="mb-8 px-5">
            <h3 className="text-sm font-black text-slate-700 mb-3 uppercase tracking-widest">
              {lang === 'en' ? 'Recommended Classes' : 'คลาสแนะนำ'}
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-5 px-5">
              {[0, 1].map(i => (
                <div key={i} className="flex-shrink-0 w-64 bg-white p-3 rounded-2xl shadow-sm animate-pulse">
                  <div className="w-full aspect-[4/3] rounded-xl bg-slate-100 mb-3" />
                  <div className="h-3.5 w-3/4 bg-slate-100 rounded-full mb-2" />
                  <div className="h-2.5 w-full bg-slate-100 rounded-full mb-1" />
                  <div className="h-2.5 w-2/3 bg-slate-100 rounded-full mb-3" />
                  <div className="h-8 w-full bg-slate-100 rounded-xl" />
                </div>
              ))}
            </div>
          </div>
        ) : recommendedCourses.length > 0 && (
          <div className="mb-8 px-5">
            <h3 className="text-sm font-black text-slate-700 mb-3 uppercase tracking-widest">
              {lang === 'en' ? 'Recommended Classes' : 'คลาสแนะนำ'}
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-5 px-5">
              {recommendedCourses.map((course) => (
                <CourseCard key={course.id} course={course} bookingStatus={courseBookingStatus[course.id]} lang={lang} childCoupons={!isGuest ? currentChild?.coupons : undefined} />
              ))}
            </div>
          </div>
        )}

        <h3 className="text-sm font-black text-slate-700 mb-4 px-2">{t.home.latestClass || 'ประวัติการเรียนล่าสุด'}</h3>
        <div className="mb-6 relative">
          {isGuest && renderLockedOverlay(
            t.home.joinToSeeSkills,
            t.home.registerBtn,
            () => navigate('/register')
          )}
          <div className={`mellow-card bg-white/85 border border-white p-5 shadow-sm relative overflow-hidden transition-all ${isGuest ? 'blur-[2px]' : ''}`}>
            {isDataLoading ? (
              <div className="space-y-4">
                {[0, 1].map(i => (
                  <div key={i} className="flex items-center gap-4 animate-pulse">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 w-2/3 bg-slate-100 rounded-full" />
                      <div className="h-2.5 w-1/3 bg-slate-100 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentHistory.length > 0 ? (
              <div>
                <div className="divide-y divide-slate-100">
                  {recentHistory.map((item, i) => {
                    const itemDate = new Date(item.scheduled_at);
                    const dateLocale = lang === 'en' ? 'en-US' : 'th-TH';
                    return (
                      <button
                        key={item.id ?? i}
                        onClick={() => setSelectedBooking(item)}
                        className={`w-full flex items-center gap-3 text-left active:scale-[0.98] transition-transform ${i === 0 ? 'pb-3' : 'py-3'}`}
                      >
                        <div className="flex flex-col items-center justify-center w-12 h-12 rounded-2xl bg-mellow-blue/10 shrink-0">
                          <span className="text-[8px] font-black uppercase leading-none text-mellow-blue">
                            {itemDate.toLocaleDateString(dateLocale, { month: 'short' })}
                          </span>
                          <span className="text-lg font-black leading-tight text-mellow-blue">
                            {itemDate.getDate()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-black text-[14px] text-slate-800 leading-tight truncate">{item.course_name || 'คลาสเรียน'}</h4>
                            {BOOKING_STATUS_META[item.status] && (
                              <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide ${BOOKING_STATUS_META[item.status].bg} ${BOOKING_STATUS_META[item.status].fg}`}>
                                {lang === 'en' ? BOOKING_STATUS_META[item.status].en : BOOKING_STATUS_META[item.status].th}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 font-bold mt-0.5 truncate">{item.branch_name}</p>
                        </div>
                        <ChevronRight size={16} className="text-slate-300 shrink-0" strokeWidth={2.5} />
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => navigate('/journey')} className="mt-3 text-xs font-black text-mellow-blue uppercase tracking-widest flex items-center gap-1 active:scale-95 transition-transform">
                  ดูความสำเร็จทั้งหมด <ChevronRight size={14} />
                </button>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                  <Medal size={24} />
                </div>
                <h4 className="font-black text-sm text-slate-700 mb-1">ยังไม่มีประวัติการเรียน</h4>
                <p className="text-xs text-slate-400 font-bold">เข้าเรียนคลาสแรกเพื่อเริ่มต้นสะสมความสำเร็จ</p>
                <button onClick={() => navigate('/explore')} className="mt-4 text-xs font-black text-mellow-purple bg-mellow-purple/10 px-4 py-2 rounded-xl uppercase tracking-widest active:scale-95 transition-transform">
                  ค้นหาคลาสเรียน
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <AddChildModal
        isOpen={isAddChildOpen}
        onClose={() => setIsAddChildOpen(false)}
      />

      <AvatarPickerModal
        isOpen={isAvatarPickerOpen}
        onClose={() => setIsAvatarPickerOpen(false)}
        currentAvatar={currentChild?.avatar || ''}
        childId={typeof currentChild?.id === 'number' ? currentChild.id : undefined}
        customPhotoUrl={!isGuest ? (currentChild as any)?.customPhotoUrl : undefined}
        onSelect={async (avatarId: string) => {
          if (!currentChild || currentChild.id === 'guest' || typeof currentChild.id !== 'number') return;
          const { updateAvatar } = useChildStore.getState();
          await updateAvatar(currentChild.id, avatarId);
        }}
        onPhotoUploaded={(url) => {
          if (!currentChild || currentChild.id === 'guest' || typeof currentChild.id !== 'number') return;
          useChildStore.getState().setCustomPhotoUrl(currentChild.id, url);
        }}
        onDeletePhoto={async () => {
          if (!currentChild || currentChild.id === 'guest' || typeof currentChild.id !== 'number') return;
          await useChildStore.getState().deletePhoto(currentChild.id);
        }}
      />

      {selectedBooking && (
        <BookingDetailModal
          isOpen={!!selectedBooking}
          onClose={() => setSelectedBooking(null)}
          booking={selectedBooking}
        />
      )}

      {currentChild?.dob && (
        <BirthdayModal
          isOpen={isBirthdayModalOpen}
          onClose={() => setIsBirthdayModalOpen(false)}
          name={currentChild.nickname || currentChild.name}
          dob={currentChild.dob}
        />
      )}

      {cancelBookingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !isCancelling && setCancelBookingId(null)} />
          <div className="relative w-full max-w-xs bg-white rounded-3xl p-6 text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-2">{lang === 'en' ? 'Cancel Booking' : 'ยกเลิกการจอง'}</h3>
            <p className="text-sm font-bold text-slate-500 mb-6">
              {lang === 'en' ? 'Are you sure you want to cancel this booking?' : 'คุณแน่ใจหรือไม่ที่จะยกเลิกการจองนี้?'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelBookingId(null)}
                disabled={isCancelling === cancelBookingId}
                className="flex-1 py-3 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
              >
                {lang === 'en' ? 'No, Keep it' : 'ไม่, กลับไป'}
              </button>
              <button
                onClick={() => confirmCancelBooking()}
                disabled={isCancelling === cancelBookingId}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 flex justify-center items-center gap-2 disabled:opacity-50"
              >
                {isCancelling === cancelBookingId ? <Loader2 size={16} className="animate-spin" /> : (lang === 'en' ? 'Yes, Cancel' : 'ใช่, ยกเลิก')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;

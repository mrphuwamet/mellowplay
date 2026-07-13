import React from 'react';
import { useChildStore } from '../store/useChildStore';
import { ChevronRight, FileText, Lock, Medal, Menu, LogOut, Settings, Ticket, Calendar, LogIn, MessageCircle, Facebook, User, AlertCircle, Loader2, MapPin, Clock, ArrowRightLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import QuickAccess from '../components/QuickAccess';
import AnimatedClouds from '../components/AnimatedClouds';
import CourseCard from '../components/CourseCard';
import AddChildModal from '../components/AddChildModal';
import EditChildModal from '../components/EditChildModal';
import AvatarPickerModal from '../components/AvatarPickerModal';
import BookingDetailModal from '../components/BookingDetailModal';
import ChildAvatar from '../components/ChildAvatar';
import logo from '../assets/ui/logo.svg';
import defaultAvatar from '../assets/ui/default-avatar.svg';
import apiClient from '../utils/apiClient';

const Home = () => {
  const { children, selectedChildId, isLoading: isStoreLoading, selectChild } = useChildStore();
  const navigate = useNavigate();
  const { t, lang, setLang } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isAddChildOpen, setIsAddChildOpen] = React.useState(false);
  const [isEditChildOpen, setIsEditChildOpen] = React.useState(false);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = React.useState(false);
  const [isProfileSwitcherOpen, setIsProfileSwitcherOpen] = React.useState(false);
  const [recommendedCourses, setRecommendedCourses] = React.useState<any[]>([]);
  const [latestClass, setLatestClass] = React.useState<any | null>(null);
  const [pendingBookings, setPendingBookings] = React.useState<any[]>([]);
  const [upcomingClasses, setUpcomingClasses] = React.useState<any[]>([]);
  const [selectedBooking, setSelectedBooking] = React.useState<any | null>(null);
  const [isCancelling, setIsCancelling] = React.useState<number | null>(null);
  const [cancelBookingId, setCancelBookingId] = React.useState<number | null>(null);
  
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

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const coursesReq = apiClient.get('/admin/courses');
        const progressReq = (!isGuest && currentChild?.id) ? apiClient.get(`/journey/progress/${currentChild.id}`) : Promise.resolve({ data: { success: false } });
        const pendingReq = (!isGuest && user?.id) ? apiClient.get(`/profiles/bookings/pending?userId=${user.id}`) : Promise.resolve({ data: { success: false } });
        const upcomingReq = (!isGuest && user?.id) ? apiClient.get(`/profiles/bookings/upcoming?userId=${user.id}`) : Promise.resolve({ data: { success: false } });
        
        const [coursesRes, progressRes, pendingRes, upcomingRes] = await Promise.all([coursesReq, progressReq, pendingReq, upcomingReq]);
        
        if (coursesRes.data.success) {
          setRecommendedCourses(coursesRes.data.courses.filter((c: any) => c.is_recommended === 1 || c.is_recommended === true));
        }
        
        if (progressRes.data.success && progressRes.data.progressData?.records?.length > 0) {
          setLatestClass(progressRes.data.progressData.records[0]);
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
      }
    };
    fetchData();
  }, [currentChild?.id, isGuest]);

  if (isStoreLoading && children.length === 0 && !isGuest) {
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
      {isMenuOpen && <div className="fixed inset-0 z-20" onClick={() => setIsMenuOpen(false)} />}

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
              <>
                {currentChild && (
                  <button 
                    onClick={() => setIsEditChildOpen(true)}
                    className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-md shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all active:scale-95"
                  >
                    <Settings size={16} />
                  </button>
                )}
                {children.length > 1 && (
                  <button
                    onClick={() => setIsProfileSwitcherOpen(true)}
                    className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-md shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all active:scale-95"
                  >
                    <ArrowRightLeft size={16} />
                  </button>
                )}
              </>
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
                            <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                              {lang === 'en' ? 'Age' : 'อายุ'} {calculateAge(currentChild.dob)} {lang === 'en' ? 'yrs' : 'ปี'}
                            </span>
                          )}
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${membershipStatus === 'premium' ? 'bg-mellow-purple/10 text-mellow-purple' : 'bg-slate-100 text-slate-600'}`}>
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
          
          {upcomingClasses.length > 0 ? (
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
                        {new Date(booking.scheduled_at).toLocaleDateString()} • {new Date(booking.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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

        {recommendedCourses.length > 0 && (
          <div className="mb-8 px-5">
            <h3 className="text-sm font-black text-slate-700 mb-3 uppercase tracking-widest">
              {lang === 'en' ? 'Recommended Classes' : 'คลาสแนะนำ'}
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-5 px-5">
              {recommendedCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
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
          <div className={`mellow-card bg-white/85 border border-white p-6 shadow-sm relative overflow-hidden transition-all ${isGuest ? 'blur-[2px]' : ''}`}>
             {latestClass ? (
               <div className="flex items-center gap-4">
                 <div className="w-14 h-14 rounded-2xl bg-mellow-blue/10 flex items-center justify-center text-mellow-blue flex-shrink-0">
                   <Medal size={28} />
                 </div>
                 <div>
                   <h4 className="font-black text-[15px] text-slate-800 leading-tight mb-1">{latestClass.node_name || 'คลาสเรียน'}</h4>
                   <p className="text-xs text-slate-500 font-bold mb-2">
                     {new Date(latestClass.achieved_at).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
                       year: 'numeric', month: 'long', day: 'numeric'
                     })}
                   </p>
                   <button onClick={() => navigate('/roadmap')} className="text-xs font-black text-mellow-blue uppercase tracking-widest flex items-center gap-1 active:scale-95 transition-transform">
                     ดูความสำเร็จทั้งหมด <ChevronRight size={14} />
                   </button>
                 </div>
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

      <EditChildModal
        isOpen={isEditChildOpen}
        onClose={() => setIsEditChildOpen(false)}
        childInfo={currentChild && currentChild.id !== 'guest' ? {
          id: currentChild.id as number,
          name: currentChild.name,
          nickname: currentChild.nickname || '',
          dob: currentChild.dob || '',
          relation: currentChild.relation || 'Mother',
          gender: currentChild.gender || ''
        } : undefined}
      />

      <AvatarPickerModal 
        isOpen={isAvatarPickerOpen} 
        onClose={() => setIsAvatarPickerOpen(false)} 
        childId={currentChild?.id || 0}
      />

      {selectedBooking && (
        <BookingDetailModal 
          isOpen={!!selectedBooking}
          onClose={() => setSelectedBooking(null)}
          booking={selectedBooking}
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

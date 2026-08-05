import React, { useEffect, useState } from 'react';
import { useChildStore } from '../store/useChildStore';
import { MapPin, Clock, CheckCircle, ChevronRight, AlertCircle, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import BookingDetailModal from '../components/BookingDetailModal';
import CourseCard from '../components/CourseCard';
import ChildAvatar from '../components/ChildAvatar';
import { getCourseView } from '../utils/courseImage';
import { getCourseDetailPath } from '../utils/courseLinks';
import { trackCourseView } from '../utils/analytics';
import { BOOKING_STATUS_META } from '../utils/bookingStatus';
import { stripHtml } from '../utils/stripHtml';

const Roadmap = () => {
  const navigate = useNavigate();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  
  const [allClasses, setAllClasses] = useState<any[]>([]);
  const [recommendedClasses, setRecommendedClasses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const { lang, t } = useTranslation();

  useEffect(() => {
    const fetchData = async () => {
      if (!selectedChild) return;
      setIsLoading(true);
      try {
        const user = JSON.parse(localStorage.getItem('mellow_user') || localStorage.getItem('mp_user') || '{}');
        const userId = user.id;

        // Fetch History
        const historyRes = await apiClient.get(`/profiles/bookings/history?userId=${userId}`);
        // Fetch Upcoming
        const upcomingRes = await apiClient.get(`/profiles/bookings/upcoming?userId=${userId}`);
        // Fetch All Courses
        const allCoursesRes = await apiClient.get('/admin/courses');

        let past = [];
        let future = [];

        if (historyRes.data.success) {
          past = historyRes.data.bookings.filter((b: any) => b.child_id === selectedChild.id);
        }
        if (upcomingRes.data.success) {
          future = upcomingRes.data.bookings.filter((b: any) => b.child_id === selectedChild.id);
        }

        const combined = [...past, ...future].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
        setAllClasses(combined);

        // A course with an upcoming session is never re-recommended (child is
        // already going). A course only in past history is still shown, but
        // flagged `alreadyCompleted` so one-time "extra" classes can be
        // marked as taken instead of silently disappearing or being re-bookable.
        const upcomingCourseIds = new Set(future.map((b: any) => b.course_id));
        const completedCourseIds = new Set(past.map((b: any) => b.course_id));

        let availableCourses = [];
        if (allCoursesRes.data.success) {
          availableCourses = allCoursesRes.data.courses
            .filter((c: any) => !upcomingCourseIds.has(c.id))
            .map((c: any) => ({ ...c, alreadyCompleted: completedCourseIds.has(c.id) }))
            .sort((a: any, b: any) => Number(a.alreadyCompleted) - Number(b.alreadyCompleted));
        }

        setRecommendedClasses(availableCourses.slice(0, 3));

      } catch (err) {
        console.error('Failed to fetch roadmap data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedChild]);

  if (!selectedChild) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center pb-24">
        <div className="bg-white p-8 rounded-[32px] shadow-sm max-w-sm w-full">
          <div className="w-16 h-16 bg-mellow-purple/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="text-mellow-purple" size={32} />
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">
            {lang === 'en' ? 'Select a Child' : 'กรุณาเลือกข้อมูลเด็ก'}
          </h2>
          <p className="text-slate-500 mb-6">
            {lang === 'en' ? 'Please select a child profile first.' : 'โปรดเลือกข้อมูลเด็กก่อนเพื่อดูประวัติการเรียน'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3.5 bg-slate-900 text-white rounded-xl font-bold"
          >
            {lang === 'en' ? 'Back to Home' : 'กลับไปหน้าหลัก'}
          </button>
        </div>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-sans selection:bg-mellow-purple/20 max-w-[430px] mx-auto md:max-w-[680px] lg:max-w-[900px] xl:max-w-[1100px]">
      
      {/* Header — pinned like Album/Explore/Rewards so it doesn't scroll away */}
      <div className="bg-white rounded-b-[32px] shadow-sm mb-6 pt-6 pb-6 px-6 sticky top-0 z-30 overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-mellow-purple/5 to-mellow-blue/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
        
        <div className="relative z-10 flex items-center gap-4 max-w-lg mx-auto md:max-w-[640px] lg:max-w-[820px]">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-mellow-purple/20 to-mellow-blue/20 p-1 shadow-sm">
            <ChildAvatar avatarType={selectedChild.avatar} className="w-full h-full rounded-xl bg-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              {lang === 'en' ? 'Learning Journey' : 'เส้นทางการเรียนรู้'}
            </h1>
            <p className="text-sm font-medium text-slate-500">
              {lang === 'en' ? `For ${selectedChild.name}` : `สำหรับน้อง${selectedChild.name}`}
            </p>
          </div>
        </div>
      </div>

      <div className="px-5 max-w-lg mx-auto md:max-w-[640px] lg:max-w-[820px]">

        {isLoading ? (
          <div className="relative animate-pulse">
            <div className="absolute left-[27px] top-4 bottom-4 w-1 bg-slate-200 rounded-full" />
            <div className="flex items-center gap-3 mb-6 relative z-10 bg-slate-50 py-2">
              <div className="w-14 h-8 bg-slate-200 rounded-full flex-shrink-0" />
              <div className="h-4 w-40 bg-slate-200 rounded-full" />
            </div>
            <div className="space-y-6">
              {[0, 1, 2].map(i => (
                <div key={i} className="relative z-10 ml-14 p-2.5 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center gap-2.5">
                  <div className="absolute -left-[35px] top-1/2 -translate-y-1/2 w-4 h-4 bg-slate-200 rounded-full ring-4 ring-slate-50" />
                  <div className="w-14 h-14 rounded-xl bg-slate-100 shrink-0" />
                  <div className="w-12 h-12 rounded-xl bg-slate-100 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-3.5 w-3/4 bg-slate-200 rounded-full" />
                    <div className="h-2.5 w-1/2 bg-slate-100 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-[27px] top-4 bottom-4 w-1 bg-gradient-to-b from-slate-200 via-slate-200 to-transparent rounded-full" />

            {/* Combined Journey Section */}
            <div className="mb-12 relative">
              <div className="flex items-center gap-3 mb-6 relative z-10 bg-slate-50 py-2">
                <div className="w-14 h-8 bg-mellow-purple/10 text-mellow-purple rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border border-mellow-purple/20">
                  <Play size={16} strokeWidth={3} className="ml-1" />
                </div>
                <h2 className="text-[17px] font-black text-slate-800 tracking-wide">
                  {lang === 'en' ? 'My Journey' : 'เส้นทางการเรียนรู้ของฉัน'}
                </h2>
              </div>

              {allClasses.length === 0 ? (
                <div className="ml-14 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center relative z-10">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="text-slate-300" size={24} />
                  </div>
                  <p className="text-sm font-medium text-slate-500">
                    {lang === 'en' ? "No classes booked yet." : "ยังไม่มีประวัติการเข้าร่วมกิจกรรม"}
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {allClasses.map((booking) => {
                    const bookingDate = new Date(booking.scheduled_at);
                    const isPast = bookingDate < now;
                    
                    const dateLocale = lang === 'en' ? 'en-US' : 'th-TH';

                    return (
                      <div
                        key={booking.id}
                        onClick={() => setSelectedBooking(booking)}
                        className={`relative z-10 ml-14 p-2.5 rounded-2xl shadow-sm border cursor-pointer active:scale-[0.98] transition-all flex items-center gap-2.5 ${
                          isPast ? 'bg-slate-50 border-slate-200 opacity-90' : 'bg-white border-mellow-blue/30 shadow-mellow-blue/5'
                        }`}
                      >
                        {/* Timeline Dot */}
                        <div className={`absolute -left-[35px] top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-[3px] rounded-full shadow-sm ${
                          isPast ? 'border-slate-400' : 'border-mellow-blue'
                        }`} />

                        {/* Date badge — the most prominent element */}
                        <div className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl shrink-0 ${isPast ? 'bg-slate-100' : 'bg-mellow-blue/10'}`}>
                          <span className={`text-[10px] font-black uppercase leading-none ${isPast ? 'text-slate-400' : 'text-mellow-blue'}`}>
                            {bookingDate.toLocaleDateString(dateLocale, { month: 'short' })}
                          </span>
                          <span className={`text-xl font-black leading-tight ${isPast ? 'text-slate-500' : 'text-mellow-blue'}`}>
                            {bookingDate.getDate()}
                          </span>
                          <span className={`text-[10px] font-bold leading-none ${isPast ? 'text-slate-400' : 'text-mellow-blue/70'}`}>
                            {bookingDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <img
                          src={booking.course_thumbnail || 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=150&q=80'}
                          alt={booking.course_name}
                          className={`w-12 h-12 rounded-xl object-cover shadow-sm bg-slate-100 flex-shrink-0 ${isPast ? 'grayscale-[30%]' : ''}`}
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-bold text-slate-800 text-[15px] truncate">{booking.course_name}</h3>
                            {BOOKING_STATUS_META[booking.status] && (
                              <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${BOOKING_STATUS_META[booking.status].bg} ${BOOKING_STATUS_META[booking.status].fg}`}>
                                {lang === 'en' ? BOOKING_STATUS_META[booking.status].en : BOOKING_STATUS_META[booking.status].th}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-slate-500 mt-0.5">
                            <MapPin size={11} className={isPast ? "text-slate-400" : "text-mellow-blue"} />
                            <span className="text-[12px] font-medium truncate">{booking.branch_name}</span>
                          </div>
                        </div>

                        <ChevronRight size={18} className="text-slate-300 shrink-0" strokeWidth={2.5} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* End of Timeline marker */}
            <div className="flex justify-start ml-[23px] mb-8 relative z-10">
              <div className="w-3 h-3 bg-slate-300 rounded-full ring-4 ring-slate-50" />
            </div>
          </div>
        )}

        {/* Recommended Classes Section */}
        {!isLoading && recommendedClasses.length > 0 && (
          <div className="mt-8 pt-8 border-t-2 border-dashed border-slate-200">
            <h3 className="text-[17px] font-black text-slate-800 mb-4 tracking-tight flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center">
                <Play size={14} className="ml-0.5" />
              </div>
              {lang === 'en' ? "Recommended for you" : "กิจกรรมที่คุณอาจสนใจ"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendedClasses.map((course) => {
                const view = getCourseView(course, 'square');
                const isOneTimeDone = course.alreadyCompleted && !course.allow_repeat;
                return (
                <div key={course.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden relative">
                  <div className={`absolute top-3 left-3 text-white text-[11px] font-bold px-2 py-1 rounded-full z-10 shadow-sm flex items-center gap-1 ${isOneTimeDone ? 'bg-slate-400' : 'bg-red-500'}`}>
                    {isOneTimeDone ? <CheckCircle size={10} /> : <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />}
                    {isOneTimeDone
                      ? (lang === 'en' ? 'ALREADY TAKEN' : 'เคยเรียนแล้ว')
                      : (lang === 'en' ? 'RECOMMENDED' : 'แนะนำ')}
                  </div>

                  <div className={`flex p-3 gap-3 ${isOneTimeDone ? 'opacity-70' : ''}`}>
                    <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                      <img
                        src={view.url || 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&w=150&q=80'}
                        alt={course.name}
                        style={view.url ? view.style : undefined}
                        className={`w-full h-full object-cover ${isOneTimeDone ? 'grayscale-[40%]' : ''}`}
                      />
                    </div>
                    <div className="flex-1 flex flex-col min-w-0">
                      <h4 className="font-bold text-slate-800 text-[16px] line-clamp-2">{course.name}</h4>
                      <p className="text-[13px] text-slate-500 line-clamp-2 mt-1 leading-snug">
                        {course.short_description || stripHtml(course.description || '')}
                      </p>
                      {course.alreadyCompleted && !!course.allow_repeat && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold text-emerald-600">
                          <CheckCircle size={10} />
                          {lang === 'en' ? 'Previously taken' : 'เคยเรียนแล้ว'}
                        </span>
                      )}

                      <div className="mt-auto pt-2 flex items-center justify-between">
                        <span className="text-[14px] font-black text-slate-700">
                          {course.original_price ? `฿${course.original_price}` : ''}
                        </span>
                        <button
                          disabled={isOneTimeDone}
                          onClick={() => {
                            if (isOneTimeDone) { navigate(getCourseDetailPath(course)); return; }
                            trackCourseView(course.id);
                            const bookingType = course.is_event ? 'event' : course.is_service ? 'service' : 'class';
                            navigate(`/booking?courseId=${course.id}${bookingType !== 'class' ? `&type=${bookingType}` : ''}`);
                          }}
                          className={`px-4 py-2 text-[13px] font-bold rounded-xl transition-all shadow-sm ${
                            isOneTimeDone
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                              : 'bg-mellow-purple text-white active:scale-95'
                          }`}
                        >
                          {isOneTimeDone
                            ? (lang === 'en' ? 'Registered' : 'ลงทะเบียนแล้ว')
                            : (lang === 'en' ? 'Register' : 'ลงทะเบียน')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Booking Detail Modal for Future classes */}
      <BookingDetailModal 
        isOpen={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        booking={selectedBooking}
      />
    </div>
  );
};

export default Roadmap;

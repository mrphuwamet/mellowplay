import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Calendar as CalendarIcon, Clock, Users, ArrowRight, MapPin, Home, Ticket, Sparkles, Share2 } from 'lucide-react';
import ShareToLineButton from '../components/ShareToLineButton';
import apiClient from '../utils/apiClient';
import logo from '../assets/ui/logo.svg';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import { getCourseView } from '../utils/courseImage';
import { trackCourseView } from '../utils/analytics';
import PosterCarousel from '../components/PosterCarousel';
import PromotionCountdown from '../components/PromotionCountdown';
import { useChildStore } from '../store/useChildStore';
import { useCouponTypes, getPrimaryCouponRequirement } from '../hooks/useCouponTypes';

const CourseDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { lang, setLang, t } = useTranslation();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const couponTypes = useCouponTypes();
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [upcomingSlots, setUpcomingSlots] = useState<any[]>([]);
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [showGuestModal, setShowGuestModal] = useState(false);

  useEffect(() => {
    const fetchCourse = async () => {
      setLoading(true);
      setFetchError('');
      try {
        const res = await apiClient.get('/admin/courses');
        if (res.data.success) {
          const found = res.data.courses.find((c: any) => c.id === parseInt(id || '0'));
          setCourse(found);
          if (found?.calendar_id) {
            const slotsRes = await apiClient.get(`/admin/calendar-slots/upcoming?calendarId=${found.calendar_id}`);
            if (slotsRes.data.success) setUpcomingSlots(slotsRes.data.upcoming || []);
          }
        } else {
          setFetchError(res.data.message || 'request failed');
        }
      } catch (err: any) {
        // Distinguish "the request itself failed" (network/CORS/timeout —
        // shows up identically to "course genuinely doesn't exist" without
        // this) from a real 404, since the two need very different fixes.
        console.error(err);
        setFetchError(err?.message || 'network error');
      } finally {
        setLoading(false);
      }
    };
    fetchCourse();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    trackCourseView(id, selectedChild?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="mellow-page bg-[#fbfaf7] min-h-screen animate-pulse">
        <div className="h-[64px] px-5 bg-white flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-slate-100" />
          <div className="w-10 h-10 rounded-full bg-slate-100" />
        </div>
        <div className="w-full aspect-[4/3] bg-slate-200" />
        <div className="p-5 space-y-4">
          <div className="h-6 w-3/4 bg-slate-200 rounded-full" />
          <div className="space-y-2">
            <div className="h-3.5 w-full bg-slate-100 rounded-full" />
            <div className="h-3.5 w-full bg-slate-100 rounded-full" />
            <div className="h-3.5 w-2/3 bg-slate-100 rounded-full" />
          </div>
          <div className="h-16 w-full bg-slate-100 rounded-2xl" />
          <div className="h-16 w-full bg-slate-100 rounded-2xl" />
          <div className="h-12 w-full bg-slate-200 rounded-xl mt-6" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="mellow-page bg-[#fbfaf7] min-h-screen">
        <header className="h-[64px] px-5 bg-white flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><ChevronLeft size={24} /></button>
          <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><Home size={20} /></button>
        </header>
        <div className="p-10 text-center text-slate-500 font-bold space-y-2">
          <p>{fetchError ? (lang === 'en' ? 'Failed to load class data.' : 'โหลดข้อมูลคลาสไม่สำเร็จ') : (lang === 'en' ? 'Class not found.' : 'ไม่พบคลาสเรียน')}</p>
          <p className="text-[11px] text-slate-400 font-mono break-all">
            id={id || '(none)'}{fetchError ? ` · ${fetchError}` : ''}
          </p>
        </div>
      </div>
    );
  }

  const formatDuration = (timeStr: string) => {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    const hrs = parseInt(h, 10);
    const mins = parseInt(m, 10);
    let result = '';
    if (hrs > 0) result += lang === 'en' ? `${hrs} hr ` : `${hrs} ชม. `;
    if (mins > 0) result += lang === 'en' ? `${mins} mins` : `${mins} นาที`;
    return result.trim() || timeStr;
  };

  const thDateOptions: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
  const enDateOptions: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };

  const bannerView = getCourseView(course, 'banner');

  const rawShortDescription = lang === 'en' && course.short_description_en ? course.short_description_en : (course.short_description || course.description);
  const shortDescription = rawShortDescription && rawShortDescription.length > 500
    ? rawShortDescription.slice(0, 500).trim() + '…'
    : rawShortDescription;

  // Skills only — Skills_Library entries of type "achievement", not "indicator"
  // (ตัวชี้วัด), which the CRM tracks separately for internal progress reports.
  let achievementSkills: { th: string; en?: string }[] = [];
  try { achievementSkills = course.achievement_skills_json ? JSON.parse(course.achievement_skills_json) : []; } catch { /* ignore malformed json */ }

  const discountAmount = course.active_campaign_discount_amount || 0;
  const discountedPrice = Math.max(0, (course.original_price || 0) - discountAmount);
  const discountPercent = discountAmount > 0 && course.original_price
    ? Math.round((discountAmount / course.original_price) * 100)
    : 0;

  return (
    <div className="mellow-page bg-[#fbfaf7] min-h-screen pb-32">
      {/* Header Poster Gallery & Nav */}
      <div className="relative bg-slate-100 rounded-b-[40px] shadow-sm overflow-hidden">
        {course.poster_images?.length > 0 ? (
          <PosterCarousel images={course.poster_images} alt={course.name} className="w-full" />
        ) : bannerView.url ? (
          <div className="w-full aspect-[4/5]">
            <img src={bannerView.url} alt={course.name} style={bannerView.style} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-full aspect-[4/5] flex items-center justify-center opacity-30 p-10">
            <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
          </div>
        )}

        {/* Nav */}
        <div className="absolute top-0 left-0 w-full h-[64px] px-5 flex items-center justify-between z-30 bg-gradient-to-b from-black/40 to-transparent">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform">
              <ChevronLeft size={24} className="mr-0.5" />
            </button>
            <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform">
              <Home size={20} />
            </button>
          </div>

          <div className="relative flex items-center gap-2">
            <ShareToLineButton
              text={`${lang === 'en' && course.name_en ? course.name_en : course.name}\n${window.location.origin}/course/${course.id}`}
              label={<Share2 size={18} />}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
            />
            {/* Quick Lang Switch */}
            <LanguageToggle />
          </div>
        </div>
        
        {/* Category Tag */}
        <div className="absolute bottom-5 left-5 px-3 py-1.5 bg-white/90 backdrop-blur-md rounded-xl shadow-lg">
          <span className={`text-[12px] font-black uppercase tracking-wide ${course.is_extraclass ? 'text-mellow-yellow-dark' : 'text-mellow-green-dark'}`}>
            {course.category_name}
          </span>
        </div>
      </div>

      <main className="px-5 pt-6 space-y-4">
        {/* Title & Price */}
        <div>
          <div className="pt-2">
            <h1 className="font-black text-3xl text-slate-800 leading-tight mb-3">
              {lang === 'en' && course.name_en ? course.name_en : course.name}
            </h1>
            {lang === 'th' && course.name_en && course.name_en !== course.name && (
              <h2 className="font-bold text-xl text-slate-500 mb-6">{course.name_en}</h2>
            )}
            {shortDescription && (
              <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 mb-4">
                <p className="text-slate-600 text-[15px] leading-relaxed whitespace-pre-wrap">
                  {shortDescription}
                </p>
              </div>
            )}
          </div>
          <div className="bg-white p-3.5 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-2">
            {discountAmount > 0 && (
              <div className="flex items-center justify-between gap-2 bg-mellow-red/10 px-3 py-1.5 rounded-xl">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-black uppercase tracking-wide text-mellow-red truncate">
                    {course.active_campaign_label || (lang === 'en' ? 'Special Price' : 'ราคาพิเศษ')}
                  </span>
                  {discountPercent > 0 && (
                    <span className="text-[11px] font-black text-mellow-red shrink-0">
                      -{discountPercent}%
                    </span>
                  )}
                </div>
                {course.active_campaign_valid_until && (
                  <PromotionCountdown validUntil={course.active_campaign_valid_until} lang={lang} />
                )}
              </div>
            )}
            <div className="flex items-baseline justify-end gap-2">
              {discountAmount > 0 && (
                <span className="text-sm text-slate-400 font-bold line-through">
                  ฿{course.original_price?.toLocaleString() || 0}
                </span>
              )}
              <span className="text-[28px] font-black text-mellow-red tracking-tight leading-none">
                ฿{discountedPrice.toLocaleString()}
              </span>
            </div>
            {/* Bookable either with coupons or cash — spelled out as an
                explicit "N [coupon icon] OR ฿price" choice here, vs. the
                compact "/" separator used on the card. */}
            {(() => {
              const couponReq = getPrimaryCouponRequirement(course, couponTypes);
              return couponReq && (
                <div className="flex items-center justify-end gap-1.5 mt-1">
                  <span className="text-xs font-black text-slate-600">{couponReq.count}</span>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${couponReq.color}20` }}>
                    <Ticket size={13} style={{ color: couponReq.color }} />
                  </span>
                  <span className="text-xs font-bold text-slate-400 mx-0.5">{lang === 'en' ? 'OR' : 'หรือ'}</span>
                  <span className="text-xs font-black text-slate-500">{lang === 'en' ? 'pay in cash above' : 'จ่ายเป็นเงินสดด้านบน'}</span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-mellow-blue-soft text-mellow-blue-dark flex items-center justify-center">
              <Users size={20} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{lang === 'en' ? 'Age Range' : 'ช่วงอายุ'}</p>
              <p className="text-[14px] font-black text-slate-700">{course.age_min}-{course.age_max} {lang === 'en' ? 'Years' : 'ปี'}</p>
            </div>
          </div>
          <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-mellow-purple-soft text-mellow-purple-dark flex items-center justify-center">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{lang === 'en' ? 'Duration' : 'ระยะเวลา'}</p>
              <p className="text-[14px] font-black text-slate-700">{formatDuration(course.duration)}</p>
            </div>
          </div>
        </div>

        {/* Location Card */}
        <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
              <MapPin size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{lang === 'en' ? 'Location' : 'สถานที่จัดคลาส'}</p>
              <p className="text-[14px] font-black text-slate-700">{course.is_extraclass ? (course.location || (lang === 'en' ? 'Pending Location' : 'รอยืนยันสถานที่')) : 'Mellow Play (Little Walk Pattaya)'}</p>
            </div>
          </div>
          {(!course.is_extraclass || course.location_link) && (
            <a
              href={course.location_link || "https://www.google.com/maps/search/?api=1&query=Mellow+Play+Pattaya"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition-colors shrink-0"
            >
              {lang === 'en' ? 'Map' : 'เส้นทาง'}
              <ArrowRight size={14} />
            </a>
          )}
        </div>

        {/* Description — authored via the CRM's rich-text writer tool (same
            one used for news/media articles), so it's rendered as markup
            rather than plain text. whitespace-pre-wrap on the container
            keeps older plain-text descriptions (saved before this existed,
            with no HTML tags) still readable with their line breaks. */}
        {course.description && (
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-[16px] font-black text-slate-800 mb-2">{lang === 'en' ? 'Class Description' : 'รายละเอียดคลาส'}</h3>
            <div
              className="prose-news whitespace-pre-wrap text-[14px] text-slate-600 leading-relaxed font-medium"
              dangerouslySetInnerHTML={{ __html: (lang === 'en' && course.description_en ? course.description_en : course.description) || '' }}
            />
          </div>
        )}

        {/* Skills — deliberately full, uncollapsed list (unlike the
            short/long description above), and skills only, never the
            internal "indicator" (ตัวชี้วัด) entries from the same library. */}
        {achievementSkills.length > 0 && (
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
            <h3 className="text-[16px] font-black text-slate-800 mb-3">
              {lang === 'en' ? "Skills You'll Gain from This Class:" : 'ทักษะที่จะได้รับจากคลาสนี้:'}
            </h3>
            <div className="flex flex-wrap gap-2">
              {achievementSkills.map((skill, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-mellow-purple/10 text-mellow-purple rounded-full text-[13px] font-bold">
                  <Sparkles size={13} />
                  {lang === 'en' && skill.en ? skill.en : skill.th}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Schedule */}
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-mellow-green-soft text-mellow-green-dark flex items-center justify-center">
              <CalendarIcon size={16} />
            </div>
            <h3 className="text-[16px] font-black text-slate-800">{lang === 'en' ? 'Upcoming Schedule' : 'รอบกิจกรรมที่กำลังจะมาถึง'}</h3>
          </div>
          
          {course.calendar_id ? (
             upcomingSlots.length > 0 ? (
               <div className="space-y-4">
                 {(showAllSlots ? upcomingSlots : upcomingSlots.slice(0, 5)).map((day, i) => {
                   const displayDate = new Date(day.date).toLocaleDateString(lang === 'en' ? 'en-US' : 'th-TH', lang === 'en' ? enDateOptions : thDateOptions);
                   return (
                     <div key={i} className="py-3 border-b border-slate-100 last:border-0 last:pb-0">
                       <h4 className="text-[15px] font-bold text-slate-800 mb-3">{displayDate}</h4>
                       <div className="grid grid-cols-1 gap-2">
                         {day.slots.map((slot: any, j: number) => {
                           const isFull = slot.available <= 0;
                           return (
                             <div key={j} className={`flex items-center justify-between p-3 rounded-xl border ${isFull ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200'} `}>
                               <div className="flex items-center gap-2">
                                 <Clock size={16} className={isFull ? 'text-slate-400' : 'text-slate-600'} />
                                 <span className={`text-[14px] font-bold ${isFull ? 'text-slate-500' : 'text-slate-700'}`}>
                                   {slot.startTime} - {slot.endTime}
                                 </span>
                               </div>
                               <div className={`px-2.5 py-1 rounded-lg text-[12px] font-bold ${isFull ? 'bg-red-50 text-red-600' : 'bg-mellow-green-soft text-mellow-green-dark'}`}>
                                 {isFull ? (lang === 'en' ? 'Full' : 'เต็มแล้ว') : (lang === 'en' ? `${slot.available} spots left` : `ว่าง ${slot.available} ที่`)}
                               </div>
                             </div>
                           );
                         })}
                       </div>
                     </div>
                   );
                 })}
                 
                 {upcomingSlots.length > 5 && !showAllSlots && (
                   <button 
                     onClick={() => setShowAllSlots(true)}
                     className="w-full py-3 mt-2 flex items-center justify-center gap-2 text-[14px] font-bold text-mellow-blue bg-mellow-blue-soft/30 hover:bg-mellow-blue-soft rounded-xl transition-colors"
                   >
                     {lang === 'en' ? 'View more dates' : 'ดูรอบกิจกรรมเพิ่มเติม'}
                     <ArrowRight size={16} />
                   </button>
                 )}
               </div>
             ) : (
               <p className="text-[14px] text-slate-400 font-bold">{lang === 'en' ? 'Pending schedule announcement' : 'รอประกาศตารางกิจกรรม'}</p>
             )
          ) : (
            <p className="text-[14px] text-slate-400 font-bold">{lang === 'en' ? 'Please contact us for available times' : 'กรุณาติดต่อเจ้าหน้าที่เพื่อสอบถามรอบเวลา'}</p>
          )}
        </div>
      </main>

      {/* Register CTA */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] p-5 bg-white/90 backdrop-blur-xl border-t border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-20">
        <button 
          onClick={() => {
            const isGuest = localStorage.getItem('mellow_guest') === 'true';
            if (isGuest) {
              setShowGuestModal(true);
            } else {
              navigate(`/booking?courseId=${course.id}`);
            }
          }}
          className="w-full h-[56px] bg-mellow-ink text-white rounded-2xl font-black text-[16px] shadow-lg shadow-black/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          {lang === 'en' ? 'Register' : 'ลงทะเบียน'}
          <ArrowRight size={20} />
        </button>
      </div>

      {/* Guest Modal */}
      {showGuestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] p-6 w-full max-w-[340px] shadow-2xl animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-mellow-yellow-soft rounded-full flex items-center justify-center mx-auto mb-4">
              <Users size={32} className="text-mellow-yellow-dark" />
            </div>
            <h3 className="text-[20px] font-black text-slate-800 mb-2">
              {lang === 'en' ? 'Please Register First' : 'กรุณาสมัครสมาชิกก่อน'}
            </h3>
            <p className="text-[14px] text-slate-500 font-medium mb-6">
              {lang === 'en' 
                ? 'Register now to book this class and track your child\'s journey!' 
                : 'สมัคสมาชิกเพื่อทำการจองคลาสเรียนและติดตามพัฒนาการของน้องๆ'}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => setShowGuestModal(false)}
                className="h-[48px] bg-slate-100 text-slate-600 rounded-2xl font-bold text-[15px] active:scale-95 transition-transform"
              >
                {lang === 'en' ? 'Back' : 'ย้อนกลับ'}
              </button>
              <button 
                onClick={() => {
                  setShowGuestModal(false);
                  navigate(`/register?redirect=/course/${course.id}`);
                }}
                className="h-[48px] bg-mellow-ink text-white rounded-2xl font-bold text-[15px] shadow-lg shadow-black/10 active:scale-95 transition-transform"
              >
                {t.common?.register || 'สมัครสมาชิก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseDetail;

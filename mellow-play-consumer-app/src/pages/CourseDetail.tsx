import React, { useState, useEffect } from 'react';
import ScheduleLabel from '../components/ScheduleLabel';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Calendar as CalendarIcon, Clock, Users, ArrowRight, MapPin, Home, Ticket, Share2 } from 'lucide-react';
import ShareToLineButton from '../components/ShareToLineButton';
import { SkillIcon } from '../utils/skillIcons';
import apiClient from '../utils/apiClient';
import logo from '../assets/ui/logo.svg';
import { useTranslation, LanguageToggle } from '../LanguageContext';
import { getCourseView } from '../utils/courseImage';
import { getCourseDetailPath } from '../utils/courseLinks';
import { isCourseEnded, isRegistrationClosed } from '../utils/calendarUtils';
import { trackCourseView } from '../utils/analytics';
import PromotionCountdown from '../components/PromotionCountdown';
import { useChildStore } from '../store/useChildStore';
import { useCourseBookingStatus } from '../hooks/useCourseBookingStatus';
import { useCouponTypes, getPrimaryCouponRequirement } from '../hooks/useCouponTypes';
import ResponsiveModal from '../components/ResponsiveModal';

const CourseDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { lang, setLang, t } = useTranslation();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const couponTypes = useCouponTypes();
  const userJson = localStorage.getItem('mellow_user');
  const userId = userJson ? JSON.parse(userJson).id : undefined;
  // Same check Explore/Home's CourseCard already uses to grey out "Book Now"
  // for a one-time (non-repeatable) course the child already took/booked —
  // this page's own Register button (both the sidebar and mobile-bar
  // versions below) had no such check at all, so staff kept seeing parents
  // land here, tap Register, and only get blocked once inside the booking
  // flow's child-selection step instead of right here up front.
  const { statusMap: courseBookingStatusMap } = useCourseBookingStatus(userId, selectedChild?.id);
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
      <div className="mellow-page-reading bg-[#fbfaf7] min-h-screen animate-pulse">
        <div className="h-[64px] px-5 bg-white flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-slate-100" />
          <div className="w-10 h-10 rounded-full bg-slate-100" />
        </div>
        {/* Matches the banner's real ratio so the page does not jump when the
            image arrives. */}
        <div className="w-full aspect-[16/9] bg-slate-200" />
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
      <div className="mellow-page-reading bg-[#fbfaf7] min-h-screen">
        <header className="h-[64px] px-5 bg-white flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><ChevronLeft size={24} /></button>
          <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center"><Home size={20} /></button>
        </header>
        <div className="p-10 text-center text-slate-500 font-bold space-y-2">
          <p>{fetchError ? (lang === 'en' ? 'Failed to load class data.' : 'โหลดข้อมูลคลาสไม่สำเร็จ') : (lang === 'en' ? 'Class not found.' : 'ไม่พบคลาสเรียน')}</p>
          <p className="text-[12px] text-slate-400 font-mono break-all">
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
  let achievementSkills: { th: string; en?: string; icon?: string }[] = [];
  try { achievementSkills = course.achievement_skills_json ? JSON.parse(course.achievement_skills_json) : []; } catch { /* ignore malformed json */ }

  const discountAmount = course.active_campaign_discount_amount || 0;
  const discountedPrice = Math.max(0, (course.original_price || 0) - discountAmount);
  const discountPercent = discountAmount > 0 && course.original_price
    ? Math.round((discountAmount / course.original_price) * 100)
    : 0;

  // Mirrors CourseCard's own isOneTimeBooked check — only non-repeatable
  // courses actually block re-registration.
  const courseBookingStatus = courseBookingStatusMap[course.id];
  const isOneTimeBooked = !!courseBookingStatus && !course.allow_repeat;
  const ended = isCourseEnded(course);
  const registrationClosed = isRegistrationClosed(course);
  const isRegisterDisabled = isOneTimeBooked || ended || registrationClosed;
  const registerLabel = isOneTimeBooked
    ? (courseBookingStatus === 'upcoming'
        ? (lang === 'en' ? 'Registered' : 'ลงทะเบียนแล้ว')
        : (lang === 'en' ? 'Already Taken' : 'เคยเรียนแล้ว'))
    : ended
      ? (lang === 'en' ? 'Ended' : 'จบแล้ว')
      : registrationClosed
        ? (lang === 'en' ? 'Registration Closed' : 'ปิดรับลงทะเบียน')
        : (lang === 'en' ? 'Register' : 'ลงทะเบียน');

  // Shared by the mobile fixed-bottom bar and the lg:+ inline sidebar
  // button below — same action, two different placements per breakpoint.
  const handleRegisterClick = () => {
    if (isRegisterDisabled) return;
    const isGuest = localStorage.getItem('mellow_guest') === 'true';
    if (isGuest) {
      setShowGuestModal(true);
    } else {
      navigate(`/booking?courseId=${course.id}`);
    }
  };

  return (
    <div className="mellow-page bg-[#fbfaf7] min-h-screen pb-32 lg:pb-10">
      {/* Header banner & Nav
          The poster gallery (Course_Image_Focals / poster_images) used to be
          rendered here and took precedence over the banner, which meant the
          banner configured in the CRM was silently ignored on every course that
          had a gallery image — in practice all of them. It has been dropped:
          the banner view is now the single answer to "what shows at the top",
          with its own per-ratio image and framing.
          Leftover gallery rows are simply no longer read, so no data had to be
          deleted to make configured banners take effect. A real left/right poster
          slider is planned as its own separate section rather than as an override
          of this one. */}
      <div className="relative bg-slate-100 rounded-b-[40px] shadow-sm overflow-hidden">
        {/* The boxes below use aspect-[16/9], not a fixed height. h-[340px] with a
            fluid width meant the displayed ratio changed with the viewport —
            roughly 3.2:1 on a ~1100px desktop and 1.15:1 on a ~390px phone — so it
            matched the 16:9 the banner view is framed against on neither, and the
            crop staff set up in the CRM never looked the same twice. Must stay in
            step with IMAGE_VIEWS' `banner` def (ratioW/ratioH) in the backend. */}
        {bannerView.url ? (
          <div className="w-full aspect-[16/9]">
            <img src={bannerView.url} alt={course.name} style={bannerView.style} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-full aspect-[16/9] flex items-center justify-center opacity-30 p-10">
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
              text={`${lang === 'en' && course.name_en ? course.name_en : course.name}\n${window.location.origin}${getCourseDetailPath(course)}`}
              label={<Share2 size={18} />}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white active:scale-90 transition-transform"
            />
            {/* Quick Lang Switch */}
            <LanguageToggle />
          </div>
        </div>
        
        {/* Category Tag */}
        <div className="absolute bottom-5 left-5 px-3 py-1.5 bg-white/90 backdrop-blur-md rounded-xl shadow-lg">
          <span className={`text-[13px] font-black uppercase tracking-wide ${course.is_event ? 'text-mellow-purple' : course.is_service ? 'text-mellow-blue' : course.is_extraclass ? 'text-mellow-yellow-dark' : 'text-mellow-green-dark'}`}>
            {course.category_name}
          </span>
        </div>
      </div>

      {/* lg:+ becomes a real 2-column layout — sticky price/info/booking
          sidebar (col2) alongside the long-form reading content (col1) —
          instead of just a wider single mobile-style column. Every block
          below keeps its ORIGINAL flat DOM order (so mobile's stack order
          is untouched, no lg: grid applies below that breakpoint) and only
          gets lg:col-start/row-start to place it once the grid activates. */}
      <main className="px-5 pt-6 pb-4 space-y-4 lg:px-8 lg:pt-8 lg:space-y-0 lg:grid lg:grid-cols-[1fr_360px] lg:gap-x-8 lg:items-start">
        {/* Title */}
        <div className="pt-2 lg:col-start-1 lg:row-start-1 lg:pt-0">
          <h1 className="font-black text-3xl text-slate-800 leading-tight mb-3">
            {lang === 'en' && course.name_en ? course.name_en : course.name}
          </h1>
          {lang === 'th' && course.name_en && course.name_en !== course.name && (
            <h2 className="font-bold text-xl text-slate-500 mb-6">{course.name_en}</h2>
          )}
          {shortDescription && (
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 mb-4">
              <p className="text-slate-600 text-[16px] leading-relaxed whitespace-pre-wrap">
                {shortDescription}
              </p>
            </div>
          )}
        </div>

        {/* Sidebar: price, age/duration, location, and (lg:+ only) the
            Register CTA — sticky so it stays visible while the reading
            column on the left scrolls. The mobile fixed bottom bar covers
            this same action below lg:, so the inline button here is
            lg:-only. */}
        <div className="space-y-4 mt-4 lg:mt-0 lg:col-start-2 lg:row-start-1 lg:row-span-4 lg:sticky lg:top-24 lg:self-start">
          <div className="bg-white p-3.5 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-2">
            {discountAmount > 0 && (
              <div className="flex items-center justify-between gap-2 bg-mellow-red/10 px-3 py-1.5 rounded-xl">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[12px] font-black uppercase tracking-wide text-mellow-red truncate">
                    {course.active_campaign_label || (lang === 'en' ? 'Special Price' : 'ราคาพิเศษ')}
                  </span>
                  {discountPercent > 0 && (
                    <span className="text-[12px] font-black text-mellow-red shrink-0">
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
                {discountedPrice > 0 ? `฿${discountedPrice.toLocaleString()}` : (lang === 'en' ? 'Free!' : 'ฟรี! ไม่มีค่าใช้จ่าย')}
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
            <button
              onClick={handleRegisterClick}
              disabled={isRegisterDisabled}
              className={`hidden lg:flex w-full h-[52px] mt-2 rounded-2xl font-black text-[16px] items-center justify-center gap-2 transition-transform ${
                isRegisterDisabled
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-mellow-ink text-white shadow-lg shadow-black/20 active:scale-[0.98]'
              }`}
            >
              {registerLabel}
              {!isRegisterDisabled && <ArrowRight size={18} />}
            </button>
          </div>

          {/* Info Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-mellow-blue-soft text-mellow-blue-dark flex items-center justify-center">
                <Users size={20} />
              </div>
              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wide">{lang === 'en' ? 'Age Range' : 'ช่วงอายุ'}</p>
                <p className="text-[15px] font-black text-slate-700">{course.age_min}-{course.age_max} {lang === 'en' ? 'Years' : 'ปี'}</p>
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-mellow-purple-soft text-mellow-purple-dark flex items-center justify-center">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wide">{lang === 'en' ? 'Duration' : 'ระยะเวลา'}</p>
                <p className="text-[15px] font-black text-slate-700">{formatDuration(course.duration)}</p>
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
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wide">{lang === 'en' ? 'Location' : 'สถานที่จัดคลาส'}</p>
                <p className="text-[15px] font-black text-slate-700">{(course.is_extraclass || course.is_event) ? (course.location || (lang === 'en' ? 'Pending Location' : 'รอยืนยันสถานที่')) : 'Mellow Play (Little Walk Pattaya)'}</p>
              </div>
            </div>
            {((!course.is_extraclass && !course.is_event) || course.location_link) && (
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

          {/* Detail poster — a separate portrait upload from the cover banner.
              It sits LAST in the sidebar: at 2:3 it is tall enough that having
              it first pushed the venue card off the bottom of the screen, so
              on a desktop the one thing a parent needs before travelling was
              the one thing they could not see. Price, age and venue come
              first; the poster is the flourish underneath. */}
          {course.detail_poster_url && (
            <div className="hidden lg:block rounded-3xl overflow-hidden shadow-sm border border-slate-100">
              <img src={course.detail_poster_url} alt={course.name} className="w-full aspect-[2/3] object-cover" />
            </div>
          )}
        </div>

        {/* Detail poster's mobile placement — desktop shows this same image
            at the foot of the sidebar (see the hidden lg:block instance
            above), so this copy is mobile-only. */}
        {course.detail_poster_url && (
          <div className="lg:hidden rounded-3xl overflow-hidden shadow-sm border border-slate-100">
            <img src={course.detail_poster_url} alt={course.name} className="w-full aspect-[2/3] object-cover" />
          </div>
        )}

        {/* Description — authored via the CRM's rich-text writer tool (same
            one used for news/media articles), so it's rendered as markup
            rather than plain text. whitespace-pre-wrap on the container
            keeps older plain-text descriptions (saved before this existed,
            with no HTML tags) still readable with their line breaks. */}
        {course.description && (
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 lg:col-start-1 lg:row-start-2 lg:mt-4">
            <h3 className="text-[17px] font-black text-slate-800 mb-2">{lang === 'en' ? 'Class Description' : 'รายละเอียดคลาส'}</h3>
            <div
              className="prose-news whitespace-pre-wrap text-[15px] text-slate-600 leading-relaxed font-medium"
              dangerouslySetInnerHTML={{ __html: (lang === 'en' && course.description_en ? course.description_en : course.description) || '' }}
            />
          </div>
        )}

        {/* Skills — deliberately full, uncollapsed list (unlike the
            short/long description above), and skills only, never the
            internal "indicator" (ตัวชี้วัด) entries from the same library. */}
        {achievementSkills.length > 0 && (
          <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 lg:col-start-1 lg:row-start-3 lg:mt-4">
            <h3 className="text-[17px] font-black text-slate-800 mb-3">
              {lang === 'en' ? "Skills You'll Gain from This Class:" : 'ทักษะที่จะได้รับจากคลาสนี้:'}
            </h3>
            <div className="flex flex-wrap gap-2">
              {achievementSkills.map((skill, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-mellow-purple/10 text-mellow-purple rounded-full text-[14px] font-bold">
                  <SkillIcon iconKey={skill.icon} size={13} />
                  {lang === 'en' && skill.en ? skill.en : skill.th}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Schedule */}
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 lg:col-start-1 lg:row-start-4 lg:mt-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-mellow-green-soft text-mellow-green-dark flex items-center justify-center">
              <CalendarIcon size={16} />
            </div>
            <h3 className="text-[17px] font-black text-slate-800">{lang === 'en' ? 'Upcoming Schedule' : 'รอบกิจกรรมที่กำลังจะมาถึง'}</h3>
          </div>

          {course.calendar_id ? (
             upcomingSlots.length > 0 ? (
               <div className="space-y-4">
                 {(showAllSlots ? upcomingSlots : upcomingSlots.slice(0, 10)).map((day, i) => {
                   const displayDate = new Date(day.date).toLocaleDateString(lang === 'en' ? 'en-US' : 'th-TH', lang === 'en' ? enDateOptions : thDateOptions);
                   return (
                     <div key={i} className="py-3 border-b border-slate-100 last:border-0 last:pb-0">
                       {/* The day's own label sits beside the date, which is
                           what "ให้มี label อยู่ข้างขวาวัน" asked for — before
                           this, anything about the day had to be repeated onto
                           every round below it. */}
                       <div className="flex items-center gap-2 flex-wrap mb-3">
                         <h4 className="text-[16px] font-bold text-slate-800">{displayDate}</h4>
                         {day.dayLabel && <ScheduleLabel text={day.dayLabel} color={day.labelColor} />}
                       </div>
                       <div className="grid grid-cols-1 gap-2">
                         {day.slots.map((slot: any, j: number) => {
                           const isFull = slot.available <= 0;
                           return (
                             <div key={j} className={`flex items-center justify-between p-3 rounded-xl border ${isFull ? 'bg-slate-50 border-slate-100' : 'bg-white border-slate-200'} `}>
                               <div className="flex items-center gap-2">
                                 <Clock size={16} className={isFull ? 'text-slate-400' : 'text-slate-600'} />
                                 <span className={`text-[15px] font-bold flex items-center gap-1.5 flex-wrap ${isFull ? 'text-slate-500' : 'text-slate-700'}`}>
                                   {slot.label && <ScheduleLabel text={slot.label} color={day.labelColor} />}
                                   {slot.startTime} - {slot.endTime}
                                 </span>
                               </div>
                               <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[16px] font-black ${isFull ? 'bg-red-50 text-red-600' : 'bg-mellow-green-soft text-mellow-green-dark'}`}>
                                 {isFull ? (
                                   (lang === 'en' ? 'Full' : 'เต็มแล้ว')
                                 ) : (
                                   <>
                                     {lang === 'en' ? `${slot.available} left` : `ว่าง ${slot.available}`}
                                     <Users size={14} strokeWidth={2.5} />
                                   </>
                                 )}
                               </div>
                             </div>
                           );
                         })}
                       </div>
                     </div>
                   );
                 })}

                 {upcomingSlots.length > 10 && !showAllSlots && (
                   <button
                     onClick={() => setShowAllSlots(true)}
                     className="w-full py-3 mt-2 flex items-center justify-center gap-2 text-[15px] font-bold text-mellow-blue bg-mellow-blue-soft/30 hover:bg-mellow-blue-soft rounded-xl transition-colors"
                   >
                     {lang === 'en' ? 'View more dates' : 'ดูรอบกิจกรรมเพิ่มเติม'}
                     <ArrowRight size={16} />
                   </button>
                 )}
               </div>
             ) : (
               <p className="text-[15px] text-slate-400 font-bold">{lang === 'en' ? 'Pending schedule announcement' : 'รอประกาศตารางกิจกรรม'}</p>
             )
          ) : (
            <p className="text-[15px] text-slate-400 font-bold">{lang === 'en' ? 'Please contact us for available times' : 'กรุณาติดต่อเจ้าหน้าที่เพื่อสอบถามรอบเวลา'}</p>
          )}
        </div>
      </main>

      {/* Register CTA — mobile/tablet only; lg:+ uses the inline button in
          the sticky sidebar instead of a floating full-width bar. */}
      <div className="lg:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] md:max-w-[680px] p-5 bg-white/90 backdrop-blur-xl border-t border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-20">
        <button
          onClick={handleRegisterClick}
          disabled={isRegisterDisabled}
          className={`w-full h-[56px] rounded-2xl font-black text-[17px] flex items-center justify-center gap-2 transition-transform ${
            isRegisterDisabled
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-mellow-ink text-white shadow-lg shadow-black/20 active:scale-[0.98]'
          }`}
        >
          {registerLabel}
          {!isRegisterDisabled && <ArrowRight size={20} />}
        </button>
      </div>

      {/* Guest Modal — framed as "have you signed up before?" with two equal
          paths rather than a single "go register" CTA, so registering reads
          as one continuous step toward booking this class, not a detour. */}
      <ResponsiveModal isOpen={showGuestModal} onClose={() => setShowGuestModal(false)} variant="dialog" size="sm" className="text-center">
            <img src={logo} alt="Mellow Play" className="h-9 mx-auto mb-4" />
            <h3 className="text-[20px] font-black text-slate-800 mb-2">
              {lang === 'en' ? 'Have you signed up with Mellow Play before?' : 'เคยเป็นสมาชิก Mellow Play ไหม?'}
            </h3>
            <p className="text-[15px] text-slate-500 font-medium mb-6">
              {lang === 'en'
                ? `Just one more step to book "${lang === 'en' && course.name_en ? course.name_en : course.name}" — pick whichever applies to you.`
                : `อีกนิดเดียวก็จะจอง "${course.name}" ได้แล้ว เลือกข้อที่ตรงกับคุณได้เลย`}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowGuestModal(false);
                  navigate(`/register?redirect=${getCourseDetailPath(course)}`);
                }}
                className="h-[48px] bg-mellow-ink text-white rounded-2xl font-bold text-[16px] shadow-lg shadow-black/10 active:scale-95 transition-transform"
              >
                {lang === 'en' ? 'Not yet — Sign up' : 'ยังไม่มี — สมัครเลย'}
              </button>
              <button
                onClick={() => {
                  setShowGuestModal(false);
                  navigate(`/login?redirect=${getCourseDetailPath(course)}`);
                }}
                className="h-[48px] bg-slate-100 text-slate-700 rounded-2xl font-bold text-[16px] active:scale-95 transition-transform"
              >
                {lang === 'en' ? 'Yes — Login' : 'มีแล้ว — เข้าสู่ระบบ'}
              </button>
            </div>
            <button
              onClick={() => setShowGuestModal(false)}
              className="w-full mt-3 text-[14px] font-bold text-slate-500 hover:text-slate-700 transition-colors"
            >
              {lang === 'en' ? 'Back' : 'ย้อนกลับ'}
            </button>
      </ResponsiveModal>
    </div>
  );
};

export default CourseDetail;

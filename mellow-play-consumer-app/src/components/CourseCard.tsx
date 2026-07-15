import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin, CheckCircle, Star, Ticket } from 'lucide-react';
import logo from '../assets/ui/logo.svg';
import { getCourseView } from '../utils/courseImage';
import { trackCourseView } from '../utils/analytics';
import { formatCalendarSummary } from '../utils/calendarUtils';
import type { CourseBookingStatus } from '../hooks/useCourseBookingStatus';
import { getPrimaryCouponRequirement, type CouponType } from '../hooks/useCouponTypes';
import TicketRequirementRow from './TicketRequirementRow';
import { stripHtml } from '../utils/stripHtml';

interface CourseCardProps {
  course: any;
  bookingStatus?: CourseBookingStatus | null;
  lang?: 'th' | 'en';
  childCoupons?: { id: number; name: string; color: string; balance: number }[];
  couponTypes?: CouponType[];
  tagColorClass?: string;
}

// Same visual design as Explore.tsx's course card — edge-to-edge cover image,
// category badge + extra-class ribbon overlaid on it, and a flex-col layout
// so the "Book Now" button always sits flush at the same bottom edge across
// cards regardless of how much title/description/location text sits above it.
const CourseCard: React.FC<CourseCardProps> = ({ course, bookingStatus, lang = 'th', childCoupons, couponTypes = [], tagColorClass }) => {
  const navigate = useNavigate();
  const view = getCourseView(course, 'card');
  const couponReq = getPrimaryCouponRequirement(course, couponTypes);

  // Duplicate registration only matters for courses explicitly marked
  // non-repeatable (allow_repeat = 0) — independent of is_extraclass, since
  // an admin controls this directly via the course's own settings.
  const isOneTimeBooked = !!bookingStatus && !course.allow_repeat;
  const statusLabel = bookingStatus === 'upcoming'
    ? (lang === 'en' ? 'Registered' : 'ลงทะเบียนแล้ว')
    : (lang === 'en' ? 'Already Taken' : 'เคยเรียนแล้ว');

  const discountAmount = course.active_campaign_discount_amount || 0;
  const discountedPrice = Math.max(0, (course.original_price || 0) - discountAmount);
  const discountPercent = discountAmount > 0 && course.original_price
    ? Math.round((discountAmount / course.original_price) * 100)
    : 0;

  const badgeColorClass = tagColorClass || (course.is_extraclass ? 'text-mellow-yellow-dark' : 'text-mellow-green-dark');

  return (
    <div
      onClick={() => navigate(`/course/${course.id}`)}
      className="flex-shrink-0 w-[240px] snap-center bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden cursor-pointer active:scale-95 transition-transform flex flex-col h-full"
    >
      <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
        {view.url ? (
          <img src={view.url} alt={course.name} style={view.style} className={`w-full h-full object-cover ${isOneTimeBooked ? 'grayscale-[40%]' : ''}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-6 opacity-30">
            <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
          </div>
        )}
        <div className={`absolute top-2 left-2 px-2 py-1 bg-white/90 backdrop-blur rounded-lg text-[10px] font-black uppercase ${badgeColorClass} shadow-sm`}>
          {course.category_name}
        </div>
        {!!course.is_extraclass && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded-lg text-[10px] font-black uppercase text-white shadow-sm">
            <Star size={11} fill="currentColor" />
            {lang === 'en' ? 'Extra' : 'พิเศษ'}
          </div>
        )}
        {bookingStatus && (
          <div className={`absolute top-2 right-2 text-white text-[9px] font-black px-2 py-1 rounded-full shadow-sm flex items-center gap-1 ${isOneTimeBooked ? 'bg-slate-400' : 'bg-emerald-500'}`}>
            <CheckCircle size={9} />
            {statusLabel}
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h4 className="font-black text-[16px] text-slate-800 leading-tight mb-1 line-clamp-2">{course.name}</h4>
        <p className="text-[12px] text-slate-500 line-clamp-2 leading-snug mb-2">
          {course.short_description || stripHtml(course.description || '')}
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          {course.age_min && course.age_max && (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-bold">
              {course.age_min}-{course.age_max} {lang === 'en' ? 'yrs' : 'ปี'}
            </span>
          )}
        </div>

        {course.original_price != null && (
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-baseline gap-1.5 min-w-0">
              {discountAmount > 0 && (
                <span className="text-[11px] text-slate-400 font-bold line-through shrink-0">
                  ฿{course.original_price.toLocaleString()}
                </span>
              )}
              <span className="text-[16px] font-black text-mellow-red tracking-tight leading-none shrink-0">
                ฿{discountedPrice.toLocaleString()}
              </span>
              {/* Price OR coupon — a class bookable either way shows both,
                  price first per the card's compact layout. */}
              {couponReq && (
                <span className="flex items-center gap-1 shrink-0 text-slate-300 font-bold text-[13px]">
                  /
                  <span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: `${couponReq.color}20` }}>
                    <Ticket size={11} style={{ color: couponReq.color }} />
                  </span>
                </span>
              )}
            </div>
            {discountPercent > 0 && (
              <span className="px-1.5 py-0.5 bg-mellow-red/10 text-mellow-red text-[10px] font-black rounded shrink-0">
                -{discountPercent}%
              </span>
            )}
          </div>
        )}

        <TicketRequirementRow course={course} childCoupons={childCoupons} lang={lang} />

        <div className="space-y-1 mb-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500">
            <Calendar size={14} className="text-slate-400 shrink-0" />
            <span className="truncate">{course.calendar_id ? formatCalendarSummary(course.calendar_summary_json) : (lang === 'en' ? 'Pending schedule' : 'รอประกาศวัน')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500">
            <MapPin size={14} className="text-slate-400 shrink-0" />
            <span className="truncate">{course.is_extraclass ? (course.location || (lang === 'en' ? 'Pending location' : 'รอยืนยันสถานที่')) : 'Mellow Play (Little Walk Pattaya)'}</span>
          </div>
        </div>

        <button
          disabled={isOneTimeBooked}
          onClick={(e) => {
            e.stopPropagation();
            if (isOneTimeBooked) navigate(`/course/${course.id}`);
            else { trackCourseView(course.id); navigate(`/booking?courseId=${course.id}`); }
          }}
          className={`w-full py-2 text-[12px] font-bold rounded-xl transition-all mt-auto ${
            isOneTimeBooked
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-mellow-purple text-white active:scale-95'
          }`}
        >
          {isOneTimeBooked ? statusLabel : (lang === 'en' ? 'Book Now' : 'จองเพิ่ม')}
        </button>
      </div>
    </div>
  );
};

export default CourseCard;

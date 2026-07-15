import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin, CheckCircle } from 'lucide-react';
import logo from '../assets/ui/logo.svg';
import { getCourseView } from '../utils/courseImage';
import { trackCourseView } from '../utils/analytics';
import { formatCalendarSummary } from '../utils/calendarUtils';
import type { CourseBookingStatus } from '../hooks/useCourseBookingStatus';
import TicketRequirementRow from './TicketRequirementRow';

interface CourseCardProps {
  course: any;
  bookingStatus?: CourseBookingStatus | null;
  lang?: 'th' | 'en';
  childCoupons?: { id: number; name: string; color: string; balance: number }[];
}

const CourseCard: React.FC<CourseCardProps> = ({ course, bookingStatus, lang = 'th', childCoupons }) => {
  const navigate = useNavigate();
  const view = getCourseView(course, 'card');

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

  return (
    <div
      onClick={() => navigate(`/course/${course.id}`)}
      className="flex-shrink-0 w-64 mellow-card bg-white p-3 rounded-2xl shadow-sm relative overflow-hidden group active:scale-[0.98] transition-all cursor-pointer"
    >
      {view.url ? (
        <div className="relative w-full aspect-[4/3] rounded-xl bg-slate-100 mb-3 overflow-hidden">
          <img
            src={view.url}
            alt={course.name}
            style={view.style}
            className={`w-full h-full object-cover ${isOneTimeBooked ? 'grayscale-[40%]' : ''}`}
          />
          {bookingStatus && (
            <div className={`absolute top-2 left-2 text-white text-[9px] font-black px-2 py-1 rounded-full shadow-sm flex items-center gap-1 ${isOneTimeBooked ? 'bg-slate-400' : 'bg-emerald-500'}`}>
              <CheckCircle size={9} />
              {statusLabel}
            </div>
          )}
        </div>
      ) : (
        <div className="w-full aspect-[4/3] rounded-xl bg-mellow-purple-soft flex items-center justify-center p-4 mb-3 opacity-40">
          <img src={logo} alt="Mellow Play Logo" className="w-full h-full object-contain filter grayscale" />
        </div>
      )}

      <h4 className="font-black text-[15px] text-slate-800 leading-tight mb-1 line-clamp-1">{course.name}</h4>
      <p className="text-[12px] text-slate-500 line-clamp-2 leading-snug mb-2">
        {course.short_description || course.description}
      </p>

      <div className="flex gap-2 mb-2">
        <span className="px-2 py-0.5 bg-mellow-purple/20 text-mellow-purple rounded text-[10px] font-black uppercase">
          {course.category_name}
        </span>
        {course.age_min && course.age_max && (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-black uppercase">
            {course.age_min}-{course.age_max} YRS
          </span>
        )}
      </div>

      <div className="space-y-1 mb-2">
        <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
          <Calendar size={11} className="text-slate-400 shrink-0" />
          <span className="truncate">{course.calendar_id ? formatCalendarSummary(course.calendar_summary_json) : (lang === 'en' ? 'Pending schedule' : 'รอประกาศวัน')}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
          <MapPin size={11} className="text-slate-400 shrink-0" />
          <span className="truncate">{course.is_extraclass ? (course.location || (lang === 'en' ? 'Pending location' : 'รอยืนยันสถานที่')) : 'Mellow Play (Little Walk Pattaya)'}</span>
        </div>
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
          </div>
          {discountPercent > 0 && (
            <span className="px-1.5 py-0.5 bg-mellow-red/10 text-mellow-red text-[10px] font-black rounded shrink-0">
              -{discountPercent}%
            </span>
          )}
        </div>
      )}

      <TicketRequirementRow course={course} childCoupons={childCoupons} lang={lang} />

      <button
        disabled={isOneTimeBooked}
        onClick={(e) => {
          e.stopPropagation();
          if (isOneTimeBooked) navigate(`/course/${course.id}`);
          else { trackCourseView(course.id); navigate(`/booking?courseId=${course.id}`); }
        }}
        className={`w-full py-2 text-[12px] font-bold rounded-xl transition-all ${
          isOneTimeBooked
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-mellow-purple text-white active:scale-95'
        }`}
      >
        {isOneTimeBooked ? statusLabel : (lang === 'en' ? 'Book Now' : 'จองเพิ่ม')}
      </button>
    </div>
  );
};

export default CourseCard;

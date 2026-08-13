import React, { useState, useEffect } from 'react';
import { getBookingPlace } from '../utils/bookingPlace';
import { formatTime24 } from '../utils/dateFormat';
import { useNavigate } from 'react-router-dom';
import { X, Clock, MapPin, CheckCircle, CreditCard, ChevronDown, BookOpen, Clock3, MessageCircleHeart, Award, Sparkles } from 'lucide-react';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';
import CourseRatingPrompt from './CourseRatingPrompt';
import { BOOKING_STATUS_META } from '../utils/bookingStatus';
import ResponsiveModal from './ResponsiveModal';
import { QRCodeSVG } from 'qrcode.react';

interface BookingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: any;
}

const BookingDetailModal: React.FC<BookingDetailModalProps> = ({ isOpen, onClose, booking }) => {
  const { lang } = useTranslation();
  const navigate = useNavigate();
  const [showPayment, setShowPayment] = useState(false);
  const [progress, setProgress] = useState<any | null | undefined>(undefined);
  const [formFields, setFormFields] = useState<{ label: string; type: string; value: any }[]>([]);

  const hasReport = !!booking && ['awaiting_report', 'completed'].includes(booking.status);

  useEffect(() => {
    if (!isOpen || !booking || !hasReport) { setProgress(undefined); return; }
    setProgress(undefined);
    apiClient.get(`/journey/progress-by-booking/${booking.id}`)
      .then(res => setProgress(res.data.success ? res.data.progress : null))
      .catch(() => setProgress(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, booking?.id]);

  // Whatever the family answered on the registration form when booking —
  // only fetched if this booking's checkout actually had a form attached
  // (form_submission_id set), otherwise there's nothing to show.
  useEffect(() => {
    if (!isOpen || !booking?.form_submission_id) { setFormFields([]); return; }
    const userJson = localStorage.getItem('mellow_user');
    const userId = userJson ? JSON.parse(userJson).id : null;
    if (!userId) { setFormFields([]); return; }
    apiClient.get(`/profiles/bookings/${booking.id}/form-answers?userId=${userId}`)
      .then(res => setFormFields(res.data.success ? res.data.fields : []))
      .catch(() => setFormFields([]));
  }, [isOpen, booking?.id, booking?.form_submission_id]);

  const formatAnswerValue = (value: any) => Array.isArray(value) ? value.join(', ') : String(value);

  if (!isOpen || !booking) return null;

  const formatFullDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  let skills: (string | { th: string; en: string; type?: 'achievement' | 'indicator' })[] = [];
  try {
    if (progress?.skills_learned) {
      skills = typeof progress.skills_learned === 'string' ? JSON.parse(progress.skills_learned) : progress.skills_learned;
    }
  } catch {
    skills = [];
  }

  // Skills are stored as { th, en } pairs (set via CourseManagement's
  // SkillTagInput); fall back to a plain string for any legacy data.
  const skillLabel = (s: string | { th: string; en: string }) => {
    if (typeof s === 'string') return s;
    return (lang === 'en' ? s.en : s.th) || s.th || s.en;
  };

  // Course-level "skills" vs. per-report "today's highlight" were recorded
  // into the same flat array with a type tag; legacy entries (or plain
  // strings) predate the tag and default to skills.
  const skillItems = skills.filter(s => typeof s === 'string' || s.type !== 'indicator');
  const indicatorItems = skills.filter(s => typeof s !== 'string' && s.type === 'indicator');

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} variant="sheet" size="md">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 w-10 h-10 bg-slate-50 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full flex items-center justify-center transition-colors"
        >
          <X size={20} strokeWidth={2.5} />
        </button>

        <h2 className="text-xl font-black text-slate-800 mb-6 pr-8">
          {lang === 'en' ? 'Booking Details' : 'รายละเอียดการจอง'}
        </h2>

        <div className="space-y-5">
          {/* Course Info */}
          <div className="flex gap-4 items-start">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-bold text-slate-800 text-[16px] leading-tight">{booking.course_name}</h3>
                {BOOKING_STATUS_META[booking.status] && (
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide ${BOOKING_STATUS_META[booking.status].bg} ${BOOKING_STATUS_META[booking.status].fg}`}>
                    {lang === 'en' ? BOOKING_STATUS_META[booking.status].en : BOOKING_STATUS_META[booking.status].th}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-slate-500">
                  <Clock size={14} />
                  <span className="text-xs font-medium">
                    {formatFullDate(booking.scheduled_at)} • {formatTime24(booking.scheduled_at, lang)}
                  </span>
                </div>
                {/* The activity's own venue, not the branch — an event held at
                    a mall hall used to tell the parent to go to the branch
                    instead. getBookingPlace falls back to the branch for
                    ordinary classes, which leave the venue field empty. */}
                {(() => {
                  const place = getBookingPlace(booking);
                  if (!place) return null;
                  return (
                    <div className="flex items-center gap-2 text-slate-500">
                      <MapPin size={14} className="shrink-0" />
                      {place.link ? (
                        <a
                          href={place.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-xs font-medium underline text-mellow-blue"
                        >
                          {place.name}
                        </a>
                      ) : (
                        <span className="text-xs font-medium">{place.name}</span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {booking.qr_token && (
            <div className="flex flex-col items-center py-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-slate-400 text-[11px] font-black uppercase tracking-wider mb-3">
                {lang === 'en' ? 'Check-in QR Code' : 'QR Code สำหรับเช็คอิน'}
              </p>
              <div className="p-3 bg-white rounded-2xl border border-slate-100">
                <QRCodeSVG value={booking.qr_token} size={160} level="M" />
              </div>
              <p className="text-[11px] font-bold text-slate-400 text-center mt-3 px-4 leading-relaxed">
                {lang === 'en'
                  ? 'Show this to staff at the registration desk on the event day.'
                  : 'แสดง QR Code นี้กับแอดมินที่จุดลงทะเบียนในวันงาน'}
              </p>
            </div>
          )}

          {booking.course_short_description && (
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                {lang === 'en' ? 'Details' : 'รายละเอียด'}
              </h4>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                {booking.course_short_description}
              </p>
            </div>
          )}

          {booking.course_id && (
            <button
              // A booking row carries no is_event/is_service flag, so let
              // /course/:id resolve the right path rather than assuming a class.
              onClick={() => navigate(`/course/${booking.course_id}`)}
              className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-black text-[14px] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
            >
              <BookOpen size={16} />
              {lang === 'en' ? 'View More Details' : 'ดูรายละเอียดเพิ่มเติม'}
            </button>
          )}

          {formFields.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                {lang === 'en' ? 'Registration Details' : 'ข้อมูลการลงทะเบียน'}
              </h4>
              <div className="bg-slate-50 rounded-2xl border border-slate-100 divide-y divide-slate-100">
                {formFields.map((f, i) => (
                  <div key={i} className="flex justify-between gap-3 px-4 py-2.5">
                    <span className="text-sm font-medium text-slate-500 shrink-0">{f.label}</span>
                    <span className="text-sm font-bold text-slate-700 text-right">{formatAnswerValue(f.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="h-px bg-slate-100 my-2" />

          {/* Report — shown inline once the class has been attended */}
          {hasReport && (
            <div>
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                {lang === 'en' ? 'Report' : 'รายงาน'}
              </h4>

              {progress === undefined ? (
                <div className="py-4 text-center text-xs font-bold text-slate-300">
                  {lang === 'en' ? 'Loading...' : 'กำลังโหลด...'}
                </div>
              ) : progress === null ? (
                <div className="flex items-center gap-3 bg-amber-50 rounded-2xl p-4">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <Clock3 size={18} className="text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      {lang === 'en' ? 'Report in progress' : 'กำลังรอประมวลผล'}
                    </p>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed mt-0.5">
                      {lang === 'en'
                        ? 'May take 1-3 business days. Reach us on Line @mellowplay.'
                        : 'อาจจะใช้เวลา 1-3 วันทำการ สอบถามเพิ่มเติมได้ที่ Line @mellowplay นะคะ'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {progress.node_title && (
                    <div className="flex items-center gap-2 bg-mellow-blue/5 border border-mellow-blue/10 rounded-2xl p-3">
                      <div className="w-9 h-9 rounded-full bg-mellow-blue/10 flex items-center justify-center shrink-0 text-mellow-blue">
                        <Award size={16} />
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-mellow-blue uppercase tracking-widest">
                          {lang === 'en' ? 'Achievement' : 'ความสำเร็จ'}
                        </p>
                        <p className="text-sm font-bold text-slate-800">{progress.node_title}</p>
                      </div>
                    </div>
                  )}

                  {skillItems.length > 0 && (
                    <div>
                      <p className="text-[11px] font-black text-mellow-purple uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <Award size={11} />
                        {lang === 'en' ? 'Skills' : 'ทักษะที่ได้รับ'}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {skillItems.map((s, i) => (
                          <span key={i} className="px-2.5 py-1 bg-mellow-purple/10 text-mellow-purple text-[12px] font-black rounded-full">
                            {skillLabel(s)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {indicatorItems.length > 0 && (
                    <div>
                      <p className="text-[11px] font-black text-amber-500 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <Sparkles size={11} />
                        {lang === 'en' ? "Today's Highlight" : 'สิ่งที่โดดเด่นในวันนี้'}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {indicatorItems.map((s, i) => (
                          <span key={i} className="px-2.5 py-1 bg-amber-50 text-amber-600 text-[12px] font-black rounded-full">
                            {skillLabel(s)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-mellow-purple/5 border border-mellow-purple/10 rounded-2xl p-3.5">
                    <p className="text-[11px] font-black text-mellow-purple uppercase tracking-widest mb-1 flex items-center gap-1.5">
                      <MessageCircleHeart size={12} />
                      {lang === 'en' ? "Facilitator's Note" : 'บันทึกจากคุณครู'}
                    </p>
                    <p className="text-sm text-slate-600 font-medium leading-relaxed">
                      {progress.teacher_comment || (lang === 'en' ? 'No notes yet' : 'ไม่มีบันทึกคุณครู')}
                    </p>
                  </div>

                  {booking.course_id && booking.child_id && (
                    <CourseRatingPrompt courseId={booking.course_id} childId={booking.child_id} bookingId={booking.id} />
                  )}

                  <button
                    onClick={() => navigate(`/report/${booking.id}`, { state: { booking } })}
                    className="w-full py-3 bg-mellow-purple/10 text-mellow-purple rounded-xl font-black text-[14px] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                  >
                    <Award size={16} />
                    {lang === 'en' ? 'View Full Report' : 'ดูรายงานฉบับเต็ม'}
                  </button>
                </div>
              )}

              <div className="h-px bg-slate-100 my-4" />
            </div>
          )}

          {/* Payment Details — collapsed by default, not the focus of this view */}
          <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
            <button
              onClick={() => setShowPayment(v => !v)}
              className="w-full flex items-center justify-between p-4"
            >
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {lang === 'en' ? 'Payment History' : 'ประวัติการชำระเงิน'}
              </h4>
              <ChevronDown size={16} className={`text-slate-400 transition-transform ${showPayment ? 'rotate-180' : ''}`} />
            </button>

            {showPayment && (
              <div className="flex flex-col gap-3 px-4 pb-4 animate-in fade-in duration-150">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-500">
                    {lang === 'en' ? 'Booking Date' : 'วันที่ทำรายการ'}
                  </span>
                  <span className="text-sm font-bold text-slate-700">
                    {formatFullDate(booking.created_at)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-500">
                    {lang === 'en' ? 'Status' : 'สถานะ'}
                  </span>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-lg">
                    <CheckCircle size={14} strokeWidth={3} />
                    <span className="text-xs font-black uppercase tracking-wider">
                      {booking.payment_status || 'PAID'}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-slate-200/60 mt-1">
                  <span className="text-sm font-medium text-slate-500">
                    {lang === 'en' ? 'Payment Method' : 'ช่องทางชำระเงิน'}
                  </span>
                  <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                    <CreditCard size={16} className="text-slate-400" />
                    {booking.payment_method || 'Beam Checkout'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-3.5 bg-slate-50 text-slate-500 rounded-xl font-black text-[16px] active:scale-[0.98] transition-all"
        >
          {lang === 'en' ? 'Close' : 'ปิดหน้านี้'}
        </button>
    </ResponsiveModal>
  );
};

export default BookingDetailModal;

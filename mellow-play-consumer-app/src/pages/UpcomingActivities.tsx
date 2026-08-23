import React, { useEffect, useState } from 'react';
import CancelBookingNotice from '../components/CancelBookingNotice';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2, CalendarDays, Clock, MapPin, QrCode, Users } from 'lucide-react';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';
import { formatTime24 } from '../utils/dateFormat';
import { getBookingPlace } from '../utils/bookingPlace';
import { getBookingPeopleLabel } from '../utils/bookingPeople';
import { BOOKING_STATUS_META } from '../utils/bookingStatus';
import BookingDetailModal from '../components/BookingDetailModal';
import logo from '../assets/ui/logo.svg';

/**
 * Everything coming up under this account, across every child.
 *
 * The home feed already surfaces the next booking or two, but there was no
 * screen that simply answered "what do we have booked?" — a parent with three
 * children had to piece it together from cards scattered between other
 * content.
 *
 * Grouped by day rather than listed flat: families plan by day, and two
 * children at the same event on the same morning belong together on screen.
 */
const UpcomingActivities = () => {
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const t = (th: string, en: string) => (lang === 'en' ? en : th);

  const userJson = localStorage.getItem('mellow_user');
  const userId = userJson ? JSON.parse(userJson).id : null;

  const [bookings, setBookings] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    if (!userId) { setBookings([]); return; }
    apiClient.get(`/profiles/bookings/upcoming?userId=${userId}`)
      .then(res => setBookings(res.data.success ? (res.data.bookings ?? []) : []))
      .catch(() => setBookings([]));
  }, [userId]);

  // One entry per day, in date order. The API already sorts by scheduled_at,
  // so grouping in pass order keeps that without a second sort.
  const days = React.useMemo(() => {
    const map = new Map<string, any[]>();
    for (const b of bookings ?? []) {
      const key = (b.scheduled_at || '').slice(0, 10);
      const list = map.get(key);
      if (list) list.push(b); else map.set(key, [b]);
    }
    return Array.from(map.entries());
  }, [bookings]);

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  };

  const daysUntil = (dateStr: string): number | null => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  };

  const countdownLabel = (dateStr: string) => {
    const n = daysUntil(dateStr);
    if (n === null) return null;
    if (n === 0) return t('วันนี้', 'Today');
    if (n === 1) return t('พรุ่งนี้', 'Tomorrow');
    return t(`อีก ${n} วัน`, `In ${n} days`);
  };

  return (
    <div className="pb-24 min-h-screen bg-[#fbfaf7]">
      <header className="p-4 bg-white/90 backdrop-blur-md sticky top-0 z-20 border-b border-slate-100 flex items-center">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-xl active:bg-slate-100">
          <ChevronLeft size={24} />
        </button>
        <h1 className="flex-1 text-center font-black text-lg">{t('กิจกรรมที่จะมาถึง', 'Upcoming Activities')}</h1>
        <div className="w-8" />
      </header>

      <main className="p-5 max-w-3xl mx-auto">
        {bookings === null ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-mellow-purple" /></div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-16">
            <CalendarDays size={48} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-500">{t('ยังไม่มีกิจกรรมที่จะมาถึง', 'Nothing booked yet')}</p>
            <p className="text-xs font-bold text-slate-400 mt-1">
              {t('เมื่อจองคลาสหรือกิจกรรมแล้ว จะขึ้นที่นี่ทั้งหมด', 'Once you book a class or event it will all show up here')}
            </p>
            <button
              onClick={() => navigate('/booking')}
              className="mt-5 px-5 py-3 bg-mellow-purple text-white rounded-2xl text-sm font-black active:scale-95 transition-transform"
            >
              {t('ดูคลาสและกิจกรรม', 'Browse activities')}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-xs font-bold text-slate-400">
              {t(`ทั้งหมด ${bookings.length} รายการ`, `${bookings.length} booked`)}
            </p>
            {days.map(([date, items]) => (
              <div key={date}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <h2 className="text-[15px] font-black text-slate-700">{formatDay(date)}</h2>
                  <span className="px-2 py-0.5 rounded-lg bg-mellow-purple/10 text-mellow-purple text-[12px] font-black">
                    {countdownLabel(date)}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {items.map(b => {
                    const place = getBookingPlace(b);
                    const status = BOOKING_STATUS_META[b.status];
                    return (
                      <div
                        key={b.id}
                        className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
                      >
                      <button
                        type="button"
                        onClick={() => setSelected(b)}
                        className="w-full text-left p-3.5 flex gap-3 items-start active:scale-[0.99] transition-transform"
                      >
                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                          {b.course_thumbnail ? (
                            <img src={b.course_thumbnail} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <img src={logo} alt="" className="w-full h-full object-contain p-2 opacity-30 grayscale" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <p className="text-[15px] font-black text-slate-800 leading-snug flex-1">{b.course_name}</p>
                            {status && (
                              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-black ${status.bg} ${status.fg}`}>
                                {lang === 'en' ? status.en : status.th}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-500 mt-1">
                            <Clock size={13} className="shrink-0" />
                            <span className="text-[13px] font-bold">{formatTime24(b.scheduled_at, lang)}</span>
                            {/* Who this is for — the whole point of a
                                per-account list is that it mixes them. A
                                form-based registration names its own
                                participants. */}
                            {getBookingPeopleLabel(b) && (
                              <>
                                <Users size={13} className="shrink-0 ml-1" />
                                <span className="text-[13px] font-bold truncate">{getBookingPeopleLabel(b)}</span>
                              </>
                            )}
                          </div>
                          {place && (
                            <div className="flex items-center gap-1.5 text-slate-500 mt-0.5">
                              <MapPin size={13} className="shrink-0" />
                              <span className="text-[13px] font-medium truncate">{place.name}</span>
                            </div>
                          )}
                          {b.qr_token && (
                            <div className="flex items-center gap-1.5 text-mellow-purple mt-1.5">
                              <QrCode size={13} className="shrink-0" />
                              <span className="text-[12px] font-black">{t('แตะเพื่อดู QR เช็คอิน', 'Tap for check-in QR')}</span>
                            </div>
                          )}
                        </div>
                      </button>
                      {/* Only on what is still to come — a class that already
                          happened cannot be cancelled, and offering it there
                          would just prompt a pointless message. */}
                      <div className="border-t border-slate-100">
                        <CancelBookingNotice compact />
                      </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <BookingDetailModal isOpen={!!selected} onClose={() => setSelected(null)} booking={selected} />
    </div>
  );
};

export default UpcomingActivities;

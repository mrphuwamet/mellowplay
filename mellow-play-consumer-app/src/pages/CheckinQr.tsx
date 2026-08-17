import React from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, AlertCircle, MapPin, Clock } from 'lucide-react';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';
import logo from '../assets/ui/logo.svg';
import { formatCustomDate } from '../utils/dateFormat';

// The page a confirmation email's "QR เช็คอิน" button opens.
//
// Why a page and not the QR inside the email: an inlined data: URI is stripped by
// Gmail and Outlook, and a QR drawn as an HTML table is inverted by those clients'
// dark modes — which stops many scanners reading it — and mis-rounded by Outlook's
// Word renderer. None of that is fixable from the email side, so the QR lives
// here, where it renders correctly and at full size on the phone the attendee is
// already holding at the door.
//
// No login required: the qr_token in the URL is itself the secret, the same one
// staff scan. Requiring a session would defeat the point of emailing the link,
// since the parent may be handing their phone to someone else at the venue.
const CheckinQr: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { lang } = useTranslation();
  const [bookings, setBookings] = React.useState<any[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Normally one token — one booking, one QR. Comma-separated only happens for a
  // sibling checkout, which creates a booking row (and token) per child but sends
  // the parent a single email; a link per child would mean several links in one
  // message, so they arrive as one link and are shown stacked here.
  const tokens = React.useMemo(
    () => (token || '').split(',').map(t => t.trim()).filter(Boolean),
    [token],
  );

  React.useEffect(() => {
    if (tokens.length === 0) return;
    let cancelled = false;
    Promise.all(
      tokens.map(t =>
        apiClient.get(`/admin/checkin/lookup/${encodeURIComponent(t)}`)
          .then(res => (res.data?.success ? res.data.booking : null))
          .catch(() => null),
      ),
    ).then(results => {
      if (cancelled) return;
      const found = results.filter(Boolean);
      // One bad token among several must not hide the ones that do work — the
      // family still needs to check in with whichever codes are valid.
      if (found.length === 0) setError('ไม่พบข้อมูลการจองสำหรับ QR นี้');
      else setBookings(found);
    });
    return () => { cancelled = true; };
  }, [tokens]);

  const title = lang === 'en' ? 'Check-in QR' : 'QR เช็คอิน';

  return (
    <div className="min-h-screen bg-mellow-purple-soft flex flex-col items-center justify-center px-5 py-10">
      <img src={logo} alt="Mellow Play" className="h-10 mb-6" />

      {error ? (
        <div className="bg-white rounded-3xl shadow-sm p-8 text-center max-w-sm w-full">
          <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="font-black text-slate-700 mb-1">{title}</p>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      ) : !bookings ? (
        <div className="flex items-center gap-2 text-slate-500 font-bold">
          <Loader2 size={18} className="animate-spin" />
          {lang === 'en' ? 'Loading…' : 'กำลังโหลด...'}
        </div>
      ) : (
        <div className="w-full max-w-sm space-y-4">
          {bookings.map(booking => {
            // A form-based registration's attendees are whoever the form
            // named (form_people from the lookup) — the account child the
            // seat is booked under only shows when there's no form.
            const formPeople: { label: string; value: string }[] = booking.form_people || [];
            const childName = formPeople.length > 0
              ? formPeople.map(p => p.value).join(' · ')
              : (booking.child_nickname || booking.child_name || '');
            return (
              <div key={booking.qr_token} className="bg-white rounded-3xl shadow-sm p-6 text-center">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</p>
                <h1 className="text-xl font-black text-slate-800 leading-tight mb-1">{booking.course_name}</h1>
                {childName && <p className="text-sm font-bold text-mellow-purple mb-4">{childName}</p>}

                {/* White padding around the code matters: a QR needs its quiet
                    zone to be scannable, and phone screens held at an angle lose
                    the outer modules without it. */}
                <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 inline-block mb-4">
                  <QRCodeSVG value={booking.qr_token} size={200} level="M" />
                </div>

                <div className="space-y-1.5 text-left">
                  {booking.scheduled_at && (
                    <p className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                      <Clock size={14} className="text-slate-400 shrink-0" />
                      {formatCustomDate(booking.scheduled_at, lang, 'full')}
                    </p>
                  )}
                  {booking.branch_name && (
                    <p className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                      <MapPin size={14} className="text-slate-400 shrink-0" />
                      {booking.branch_name}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          <p className="text-xs text-slate-400 text-center leading-relaxed px-2">
            {lang === 'en'
              ? 'Show this code to staff at the registration desk.'
              : 'กรุณาแสดง QR Code นี้ให้เจ้าหน้าที่ที่จุดลงทะเบียน'}
          </p>
        </div>
      )}
    </div>
  );
};

export default CheckinQr;

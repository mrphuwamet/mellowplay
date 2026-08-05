import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from '../LanguageContext';
import apiClient from '../utils/apiClient';

const BookingSuccess = () => {
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('bookingId');
  const [qrToken, setQrToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (window.self !== window.top) {
      window.top!.location.href = window.location.href;
    }
  }, []);

  // Beam's redirect only carries a bookingId — this real (non-free/coupon)
  // payment path never touches Booking.tsx's own successBooking state, so
  // the QR has to be looked up fresh here from the now-confirmed booking.
  React.useEffect(() => {
    if (!bookingId) return;
    const userJson = localStorage.getItem('mellow_user');
    const userId = userJson ? JSON.parse(userJson).id : null;
    if (!userId) return;
    apiClient.get(`/profiles/bookings/upcoming?userId=${userId}`)
      .then(res => {
        if (!res.data.success) return;
        const match = res.data.upcoming.find((b: any) => String(b.id) === bookingId);
        if (match?.qr_token) setQrToken(match.qr_token);
      })
      .catch(() => {});
  }, [bookingId]);

  return (
    <div className="mellow-flow-page bg-slate-50 flex flex-col items-center justify-center p-5">
      <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-6 animate-bounce">
        <CheckCircle size={48} className="text-green-500" />
      </div>
      
      <h1 className="text-2xl font-black text-slate-800 text-center mb-2">
        {lang === 'en' ? 'Payment Successful!' : 'ชำระเงินสำเร็จ!'}
      </h1>
      
      <p className="text-slate-500 text-center mb-8 font-medium">
        {lang === 'en'
          ? `Your booking has been confirmed. Booking ID: #${bookingId}`
          : `การจองของคุณได้รับการยืนยันแล้ว รหัสการจอง: #${bookingId}`}
      </p>

      {qrToken && (
        <div className="w-full max-w-xs mellow-card bg-white p-5 border border-slate-100 shadow-xl rounded-[28px] mb-8 flex flex-col items-center">
          <p className="text-slate-400 text-xs font-black uppercase tracking-wider mb-3">
            {lang === 'en' ? 'Check-in QR Code' : 'QR Code สำหรับเช็คอิน'}
          </p>
          <div className="p-3 bg-white rounded-2xl border border-slate-100">
            <QRCodeSVG value={qrToken} size={180} level="M" />
          </div>
          <p className="text-[12px] font-bold text-slate-400 text-center mt-3 px-2 leading-relaxed">
            {lang === 'en'
              ? 'Show this to staff at the registration desk on the event day.'
              : 'แสดง QR Code นี้กับแอดมินที่จุดลงทะเบียนในวันงาน'}
          </p>
        </div>
      )}

      <button
        onClick={() => navigate('/')}
        className="w-full max-w-xs py-4 bg-mellow-purple text-white font-black rounded-2xl uppercase tracking-widest active:scale-95 transition-transform"
      >
        {lang === 'en' ? 'Back to Home' : 'กลับสู่หน้าหลัก'}
      </button>
    </div>
  );
};

export default BookingSuccess;

import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { useTranslation } from '../LanguageContext';

const BookingSuccess = () => {
  const navigate = useNavigate();
  const { lang } = useTranslation();
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('bookingId');

  React.useEffect(() => {
    if (window.self !== window.top) {
      window.top!.location.href = window.location.href;
    }
  }, []);

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

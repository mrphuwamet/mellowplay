import React from 'react';
import { X, Calendar, Clock, MapPin, CheckCircle, CreditCard } from 'lucide-react';
import { useTranslation } from '../LanguageContext';

interface BookingDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: any;
}

const BookingDetailModal: React.FC<BookingDetailModalProps> = ({ isOpen, onClose, booking }) => {
  const { lang } = useTranslation();

  if (!isOpen || !booking) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-[400px] rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl relative animate-in slide-in-from-bottom-8 duration-300">
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
            {booking.course_thumbnail ? (
              <img src={booking.course_thumbnail} alt={booking.course_name} className="w-20 h-20 rounded-2xl object-cover shadow-sm" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center">
                <Calendar size={32} className="text-blue-300" />
              </div>
            )}
            <div>
              <h3 className="font-bold text-slate-800 text-[15px] leading-tight mb-2">{booking.course_name}</h3>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-slate-500">
                  <Clock size={14} />
                  <span className="text-xs font-medium">
                    {new Date(booking.scheduled_at).toLocaleDateString()} • {new Date(booking.scheduled_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <MapPin size={14} />
                  <span className="text-xs font-medium">{booking.branch_name}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-slate-100 my-2" />

          {/* Payment Details */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">
              {lang === 'en' ? 'Payment History' : 'ประวัติการชำระเงิน'}
            </h4>
            
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-500">
                  {lang === 'en' ? 'Booking Date' : 'วันที่ทำรายการ'}
                </span>
                <span className="text-sm font-bold text-slate-700">
                  {new Date(booking.created_at).toLocaleDateString()}
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
          </div>
        </div>

        <button 
          onClick={onClose}
          className="mt-6 w-full py-3.5 bg-slate-900 text-white rounded-xl font-black text-[15px] active:scale-[0.98] transition-all shadow-md"
        >
          {lang === 'en' ? 'Close' : 'ปิดหน้านี้'}
        </button>
      </div>
    </div>
  );
};

export default BookingDetailModal;

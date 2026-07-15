import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles, X } from 'lucide-react';
import { useTranslation } from '../LanguageContext';

interface GuestUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureLabel: string;
}

const GuestUnlockModal: React.FC<GuestUnlockModalProps> = ({ isOpen, onClose, featureLabel }) => {
  const navigate = useNavigate();
  const { lang } = useTranslation();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xs bg-white rounded-[28px] p-6 text-center shadow-2xl animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90 transition-transform">
          <X size={16} />
        </button>

        <div className="w-16 h-16 rounded-full bg-mellow-purple/10 flex items-center justify-center mx-auto mb-4 relative">
          <Lock size={26} className="text-mellow-purple" />
          <Sparkles size={16} className="text-mellow-yellow absolute -top-1 -right-1" fill="currentColor" />
        </div>

        <h3 className="text-lg font-black text-slate-800 mb-2">
          {lang === 'en' ? `Unlock ${featureLabel}` : `ปลดล็อก${featureLabel}`}
        </h3>
        <p className="text-sm font-bold text-slate-500 mb-6 leading-relaxed">
          {lang === 'en'
            ? `Sign up for free to unlock ${featureLabel} and follow your child's growth journey!`
            : `สมัครสมาชิกฟรี เพื่อปลดล็อก${featureLabel} และติดตามความสำเร็จของลูกน้อยกันเถอะ!`}
        </p>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => navigate('/register')}
            className="w-full py-3 rounded-2xl font-black text-white bg-mellow-purple shadow-lg shadow-mellow-purple/30 active:scale-95 transition-all uppercase tracking-wide text-sm"
          >
            {lang === 'en' ? 'Sign Up' : 'สมัครสมาชิก'}
          </button>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 rounded-2xl font-bold text-mellow-purple bg-mellow-purple/10 active:scale-95 transition-all uppercase tracking-wide text-sm"
          >
            {lang === 'en' ? 'Login' : 'เข้าสู่ระบบ'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GuestUnlockModal;

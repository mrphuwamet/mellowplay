import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../LanguageContext';
import PromotionCountdown from './PromotionCountdown';

interface BirthdayModalProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  dob: string;
}

const WISHES_TH = [
  'ขอให้มีความสุขมากๆ เติบโตแข็งแรง ฉลาด และร่าเริงทุกวันเลยนะ! 🎉',
  'สุขสันต์วันเกิดนะคะ/ครับ ขอให้ปีนี้เต็มไปด้วยรอยยิ้มและการผจญภัยใหม่ๆ! 🎈',
  'ขอให้เติบโตเป็นเด็กดี มีความสุข และมีความฝันที่สวยงามเสมอ! 🌈',
  'สุขสันต์วันเกิด ขอให้วันนี้พิเศษที่สุดในรอบปีนะ! 🎂',
  'อีกหนึ่งปีของการเติบโตและการเรียนรู้ที่ Mellow Play สุขสันต์วันเกิดนะ! ⭐',
];
const WISHES_EN = [
  'Happy Birthday! May your year ahead be full of joy, laughter, and new adventures! 🎉',
  'Wishing you a wonderful birthday filled with love and happiness! 🎈',
  'Grow big, stay curious, and keep shining bright! Happy Birthday! 🌈',
  'Another year of growing and learning at Mellow Play — Happy Birthday! 🎂',
  'Happy Birthday! Hope today is as amazing as you are! ⭐',
];

const calculateAge = (dobStr: string) => {
  const dob = new Date(dobStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
};

const BirthdayModal: React.FC<BirthdayModalProps> = ({ isOpen, onClose, name, dob }) => {
  const { lang } = useTranslation();

  const confettiPieces = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 1.5,
    duration: 2.5 + Math.random() * 1.5,
    color: ['#f472b6', '#fbbf24', '#60a5fa', '#34d399', '#a78bfa'][i % 5],
    rotate: Math.round(Math.random() * 360),
  })), []);

  if (!isOpen) return null;

  const today = new Date();
  const dobDate = new Date(dob);
  const isBirthMonth = today.getMonth() === dobDate.getMonth();
  const isBirthDay = isBirthMonth && today.getDate() === dobDate.getDate();
  const age = calculateAge(dob);

  const hasHadBirthdayThisYear =
    today.getMonth() > dobDate.getMonth() ||
    (today.getMonth() === dobDate.getMonth() && today.getDate() >= dobDate.getDate());
  const nextBirthdayYear = today.getFullYear() + (hasHadBirthdayThisYear ? 1 : 0);
  const nextBirthdayDate = new Date(nextBirthdayYear, dobDate.getMonth(), dobDate.getDate(), 0, 0, 0);
  const nextAge = nextBirthdayYear - dobDate.getFullYear();

  const wish = (lang === 'en' ? WISHES_EN : WISHES_TH)[Math.floor(Math.random() * 5)];
  const dobFormatted = dobDate.toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(340px) rotate(360deg); opacity: 0; }
        }
      `}</style>
      <div
        className="relative w-full max-w-sm bg-white rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}
      >
        {isBirthMonth && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {confettiPieces.map((p, i) => (
              <div
                key={i}
                className="absolute top-0 w-2 h-3 rounded-sm"
                style={{
                  left: `${p.left}%`,
                  backgroundColor: p.color,
                  animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s infinite`,
                  transform: `rotate(${p.rotate}deg)`,
                }}
              />
            ))}
          </div>
        )}

        <button onClick={onClose} className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center active:scale-90 transition-transform">
          <X size={18} />
        </button>

        <div className="relative p-8 pt-10 text-center">
          <div className={`text-6xl mb-4 ${isBirthMonth ? 'animate-bounce' : ''}`}>
            {isBirthMonth ? '🎂' : '🎈'}
          </div>

          <h2 className="text-xl font-black text-slate-800 mb-1">{name}</h2>
          <p className="text-sm font-bold text-slate-400 mb-4">{dobFormatted}</p>

          <div className="inline-flex items-baseline gap-1.5 px-5 py-2 bg-mellow-purple/10 rounded-2xl mb-4">
            <span className="text-3xl font-black text-mellow-purple">{age}</span>
            <span className="text-sm font-bold text-mellow-purple">{lang === 'en' ? 'years old' : 'ปี'}</span>
          </div>

          {isBirthDay ? (
            <div className="bg-gradient-to-br from-mellow-yellow/20 to-mellow-purple/20 rounded-2xl p-4">
              <p className="text-sm font-bold text-slate-700 leading-relaxed">{wish}</p>
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                {lang === 'en' ? `Countdown to turning ${nextAge}` : `นับถอยหลังสู่วัย ${nextAge} ปี`}
              </p>
              <div className="flex justify-center">
                <PromotionCountdown validUntil={nextBirthdayDate.toISOString()} lang={lang} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BirthdayModal;

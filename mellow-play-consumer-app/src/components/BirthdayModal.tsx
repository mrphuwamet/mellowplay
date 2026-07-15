import React, { useEffect, useMemo, useState } from 'react';
import { X, Cake } from 'lucide-react';
import { useTranslation } from '../LanguageContext';
import { formatCustomDate } from '../utils/dateFormat';
import apiClient from '../utils/apiClient';

interface BirthdayModalProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  dob: string;
}

// Fallback pool used only if the CRM-managed list (fetched below) is empty
// or unreachable — the real source of truth is now Birthday_Wishes in CRM.
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
  const [remoteWishes, setRemoteWishes] = useState<{ message_th: string; message_en: string | null }[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    apiClient.get('/birthday-wishes')
      .then(res => { if (res.data.success) setRemoteWishes(res.data.wishes); })
      .catch(() => {});
  }, [isOpen]);

  const confettiPieces = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 1.5,
    duration: 2.5 + Math.random() * 1.5,
    color: ['#f472b6', '#fbbf24', '#60a5fa', '#34d399', '#a78bfa'][i % 5],
    rotate: Math.round(Math.random() * 360),
  })), []);

  // Hooks must run on every render regardless of isOpen, so this stays
  // above the early return below.
  const wish = useMemo(() => {
    if (remoteWishes.length > 0) {
      const picked = remoteWishes[Math.floor(Math.random() * remoteWishes.length)];
      return (lang === 'en' && picked.message_en) || picked.message_th;
    }
    return (lang === 'en' ? WISHES_EN : WISHES_TH)[Math.floor(Math.random() * 5)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteWishes, lang]);

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
  const msRemaining = Math.max(0, nextBirthdayDate.getTime() - today.getTime());
  const daysRemaining = Math.ceil(msRemaining / 86400000);

  const dobFormatted = formatCustomDate(dobDate, lang, 'full');
  // Thai copy reads more naturally as "ขวบ" for young children; from 15
  // onward "ปี" is used instead. English has no such distinction.
  const ageUnit = (n: number) => (lang === 'en' ? (n === 1 ? 'year old' : 'years old') : (n < 15 ? 'ขวบ' : 'ปี'));

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
        @keyframes cake-shake {
          0%, 96%, 100% { transform: rotate(0deg); }
          97% { transform: rotate(-8deg); }
          98% { transform: rotate(8deg); }
          99% { transform: rotate(-5deg); }
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
          <div
            className="relative w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-mellow-yellow/30 to-mellow-purple/20 flex items-center justify-center shadow-inner"
            style={isBirthMonth ? { animation: 'cake-shake 5s ease-in-out infinite' } : undefined}
          >
            <Cake size={46} className="text-mellow-purple" strokeWidth={1.75} />
          </div>

          {isBirthMonth && (
            <p className="text-sm font-black text-mellow-red uppercase tracking-widest mb-1">
              {isBirthDay
                ? (lang === 'en' ? 'Happy Birthday!' : 'สุขสันต์วันเกิด!')
                : (lang === 'en' ? 'Happy Birthday Month!' : 'สุขสันต์เดือนเกิด!')}
            </p>
          )}

          <h2 className="text-xl font-black text-slate-800 mb-3">{name}</h2>

          {/* Age — the headline element, no pill/box, just prominent centered text.
              Each badge below is wrapped in its own block-level row so they
              always stack on separate lines — two inline-flex badges placed
              directly next to each other would otherwise sit side-by-side
              whenever they both fit on one line. */}
          <div className="mb-1">
            <span className="inline-flex items-baseline gap-1.5">
              <span className="text-4xl font-black text-mellow-purple">{age}</span>
              <span className="text-base font-bold text-mellow-purple">{ageUnit(age)}</span>
            </span>
          </div>

          {/* Birth date now reads below the age */}
          <div className="mb-4">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-mellow-purple to-mellow-blue rounded-2xl shadow-lg shadow-mellow-purple/20">
              <Cake size={18} className="text-white" strokeWidth={2.5} />
              <span className="text-base font-black text-white tracking-wide">{dobFormatted}</span>
            </span>
          </div>

          {isBirthDay ? (
            <div className="bg-gradient-to-br from-mellow-yellow/20 to-mellow-purple/20 rounded-2xl p-4">
              <p className="text-sm font-bold text-slate-700 leading-relaxed">{wish}</p>
            </div>
          ) : (
            <div className="mt-2">
              <p className="text-sm font-black text-mellow-purple">
                {lang === 'en'
                  ? `In ${daysRemaining} days, turning ${nextAge} ${ageUnit(nextAge)}`
                  : `อีก ${daysRemaining} วัน จะอายุ ${nextAge} ${ageUnit(nextAge)}`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BirthdayModal;

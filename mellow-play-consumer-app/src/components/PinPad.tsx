import React, { useEffect, useRef } from 'react';
import { Delete } from 'lucide-react';

interface PinPadProps {
  value: string;
  onChange: (val: string) => void;
  length?: number;
}

const PinPad: React.FC<PinPadProps> = ({ value, onChange, length = 6 }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // The dot row is the real field on a desktop, and it is invisible. Someone
  // who simply starts typing — which is what every other site lets them do —
  // saw nothing happen at all, and read that as "the login is broken"; the
  // only ways in were clicking an invisible strip or mousing over six round
  // buttons. Focusing it on mount makes typing work the way the screen looks
  // like it already should.
  //
  // Only from md: up. Below that the field is deliberately pointer-events-none
  // so tapping the dots does not pop the native keyboard over the tap keypad,
  // and focusing it would pop that keyboard anyway.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia?.('(min-width: 768px)').matches) return;
    inputRef.current?.focus();
  }, []);

  const handleDigit = (digit: string) => {
    if (value.length >= length) return;
    onChange(value + digit);
  };

  const handleBackspace = () => {
    onChange(value.slice(0, -1));
  };

  return (
    <div>
      {/* The dot row doubles as a real, typeable input from md: up — a
          hidden field overlaid on top captures keyboard input directly
          (desktop has no reason to make someone click 6 tiny buttons with a
          mouse). pointer-events stay off below md: so tapping the dots on
          mobile doesn't also pop the native keyboard over the tap-keypad. */}
      <div className="relative flex justify-center gap-3 mb-10">
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
          maxLength={length}
          className="absolute inset-0 w-full h-full opacity-0 pointer-events-none md:pointer-events-auto cursor-text"
        />
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full transition-colors ${
              i < value.length ? 'bg-mellow-purple' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-[280px] mx-auto">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigit(digit)}
            className="aspect-square rounded-full bg-slate-50 border border-slate-100 text-2xl font-black text-mellow-ink flex items-center justify-center active:scale-90 active:bg-slate-100 transition-all shadow-sm"
          >
            {digit}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => handleDigit('0')}
          className="aspect-square rounded-full bg-slate-50 border border-slate-100 text-2xl font-black text-mellow-ink flex items-center justify-center active:scale-90 active:bg-slate-100 transition-all shadow-sm"
        >
          0
        </button>
        <button
          type="button"
          onClick={handleBackspace}
          className="aspect-square rounded-full bg-slate-50 border border-slate-100 text-slate-500 flex items-center justify-center active:scale-90 active:bg-slate-100 transition-all shadow-sm"
        >
          <Delete size={22} />
        </button>
      </div>
    </div>
  );
};

export default PinPad;

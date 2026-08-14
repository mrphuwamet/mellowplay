import React, { useRef } from 'react';

interface PinInputProps {
  length?: number;
  value: string;
  onChange: (val: string) => void;
  type?: 'text' | 'password';
}

const PinInput: React.FC<PinInputProps> = ({ length = 6, value, onChange, type = 'password' }) => {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  /**
   * Write `digits` into the boxes starting at `from`, then park the caret on
   * the box after the last one filled.
   */
  const fillFrom = (from: number, digits: string) => {
    const next = value.split('');
    for (let i = 0; i < digits.length && from + i < length; i++) {
      next[from + i] = digits[i];
    }
    onChange(next.join('').substring(0, length));
    inputs.current[Math.min(from + digits.length, length - 1)]?.focus();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (!digits) {
      // Truncate rather than punch a hole. The value is a plain string, so an
      // empty middle slot cannot survive a join — clearing box 3 of "230110"
      // used to yield "23010" and silently renumber boxes 4 and 5. Dropping
      // the tail is predictable and, in a six-box code, costs a retype nobody
      // notices.
      onChange(value.slice(0, index));
      return;
    }

    // Tapping the "From Messages" suggestion on iOS (and Android's equivalent)
    // delivers the WHOLE code to whichever box has focus. This used to keep
    // only the last character of it and throw the other five away, so autofill
    // filled exactly one box. Anything longer than a single digit is spread
    // across the boxes from here on.
    //
    // The one ambiguous case is two characters: typing over a box that already
    // has a digit also arrives as two. If the first character is the digit that
    // was already there, it is a replacement, not a code.
    // A full-length code is an autofill, wherever the focus happened to be —
    // it belongs at box 0, not starting from box 3 with its tail cut off.
    if (digits.length >= length) {
      fillFrom(0, digits);
      return;
    }
    if (digits.length === 1) {
      fillFrom(index, digits);
      return;
    }
    if (digits.length === 2 && value[index] && digits[0] === value[index]) {
      fillFrom(index, digits[1]);
      return;
    }
    fillFrom(index, digits);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, index: number) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    // A code pasted onto the first box is the whole code; pasted onto box 3 it
    // starts there, which is what someone correcting the tail of a code means.
    if (pasted) fillFrom(pasted.length >= length ? 0 : index, pasted);
  };

  return (
    <div className="flex gap-2 justify-between w-full">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (inputs.current[i] = el)}
          type={type}
          inputMode="numeric"
          pattern="[0-9]*"
          // On every box, not just the first: iOS offers the suggestion for
          // whichever field has focus, and someone who tapped box 3 before the
          // SMS arrived should still be able to accept it.
          autoComplete="one-time-code"
          name={`otp-${i}`}
          maxLength={length}
          value={value[i] || ''}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={(e) => handlePaste(e, i)}
          className="w-full aspect-[4/5] bg-slate-50 border border-slate-200 rounded-2xl text-center text-4xl font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-mellow-purple/50 focus:border-mellow-purple transition-all shadow-inner caret-transparent"
        />
      ))}
    </div>
  );
};

export default PinInput;

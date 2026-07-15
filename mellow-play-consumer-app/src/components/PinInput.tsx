import React, { useRef } from 'react';

interface PinInputProps {
  length?: number;
  value: string;
  onChange: (val: string) => void;
  type?: 'text' | 'password';
}

const PinInput: React.FC<PinInputProps> = ({ length = 6, value, onChange, type = 'password' }) => {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const val = e.target.value.replace(/\D/g, '');
    if (!val) {
      const newArr = value.split('');
      newArr[index] = '';
      onChange(newArr.join(''));
      return;
    }
    
    const char = val.substring(val.length - 1);
    const newArr = value.split('');
    newArr[index] = char;
    const newVal = newArr.join('').substring(0, length);
    onChange(newVal);

    if (char && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (pastedData) {
      onChange(pastedData);
      inputs.current[Math.min(pastedData.length, length - 1)]?.focus();
    }
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
          maxLength={1}
          value={value[i] || ''}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
          className="w-full aspect-[4/5] bg-slate-50 border border-slate-200 rounded-2xl text-center text-4xl font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-mellow-purple/50 focus:border-mellow-purple transition-all shadow-inner caret-transparent"
        />
      ))}
    </div>
  );
};

export default PinInput;

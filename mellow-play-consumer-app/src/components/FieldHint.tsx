import React from 'react';
import { AlertCircle } from 'lucide-react';

// Floats above the field it's attached to instead of sitting in normal
// document flow — the old version was rendered between the label and the
// input, so it pushed the input down whenever an error appeared/disappeared
// (a visible layout jump while typing). Needs a `relative` ancestor, which
// every field wrapper in Register.tsx already has.
const FieldHint: React.FC<{ message?: string }> = ({ message }) =>
  message ? (
    <div className="absolute -top-1.5 right-0 -translate-y-full z-20 flex items-center gap-1.5 px-3 py-1.5 max-w-[220px] bg-red-500 text-white rounded-xl text-[12px] font-bold shadow-lg animate-in fade-in slide-in-from-bottom-1 duration-150 pointer-events-none">
      <AlertCircle size={12} className="shrink-0" />
      <span>{message}</span>
    </div>
  ) : null;

export default FieldHint;

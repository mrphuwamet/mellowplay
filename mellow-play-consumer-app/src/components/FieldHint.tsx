import React from 'react';
import { AlertCircle } from 'lucide-react';

const FieldHint: React.FC<{ message?: string }> = ({ message }) =>
  message ? (
    <div className="flex items-center gap-1.5 mb-1.5 px-3 py-1.5 bg-red-50 border border-red-100 rounded-xl text-red-500 text-[11px] font-bold">
      <AlertCircle size={12} className="shrink-0" />
      <span>{message}</span>
    </div>
  ) : null;

export default FieldHint;

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error';
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = 'error', onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0 && message) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose, message]);

  if (!message) return null;

  const bgColor = type === 'success' ? 'bg-green-50 border-green-100 text-green-600' : 'bg-red-50 border-red-100 text-red-500';

  return (
    <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm md:max-w-md p-4 rounded-2xl shadow-xl border text-sm font-bold flex items-center justify-between animate-in fade-in slide-in-from-top-8 duration-300 ${bgColor}`}>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="ml-3 shrink-0 opacity-50 hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-black/5">
        <X size={18} />
      </button>
    </div>
  );
}

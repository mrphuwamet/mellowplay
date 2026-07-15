import React, { useState } from 'react';
import { Calendar, X } from 'lucide-react';
import { useTranslation } from '../LanguageContext';

const MONTH_NAMES: Record<'th' | 'en', string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  th: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
};

const WEEKDAY_NAMES: Record<'th' | 'en', string[]> = {
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  th: ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
};

interface DateFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className: string;
  iconSize?: number;
}

const DateField: React.FC<DateFieldProps> = ({ value, onChange, placeholder, className, iconSize = 20 }) => {
  const { lang } = useTranslation();
  const [open, setOpen] = useState(false);
  const today = new Date();
  const [selDay, selMonth, selYear] = value ? value.split('/').map(Number) : [];
  const [viewMonth, setViewMonth] = useState(selMonth ? selMonth - 1 : today.getMonth());
  const [viewYear, setViewYear] = useState(selYear || today.getFullYear());

  const openPicker = () => {
    setViewMonth(selMonth ? selMonth - 1 : today.getMonth());
    setViewYear(selYear || today.getFullYear());
    setOpen(true);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const years = Array.from({ length: 100 }, (_, i) => today.getFullYear() - i);

  const selectDay = (day: number) => {
    const dd = String(day).padStart(2, '0');
    const mm = String(viewMonth + 1).padStart(2, '0');
    onChange(`${dd}/${mm}/${viewYear}`);
    setOpen(false);
  };

  const isSelected = (day: number) => selDay === day && selMonth === viewMonth + 1 && selYear === viewYear;

  return (
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
        <Calendar size={iconSize} />
      </div>
      <button type="button" onClick={openPicker} className={`${className} text-left`}>
        {value || <span className="text-slate-300">{placeholder}</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-[28px] p-5 pb-6">
            <div className="flex items-center gap-2 mb-4">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="flex-1 px-3 py-[10px] bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
              >
                {MONTH_NAMES[lang].map((name, i) => (
                  <option key={i} value={i}>{name}</option>
                ))}
              </select>
              <select
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="w-24 px-3 py-[10px] bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none"
              >
                {years.map((yr) => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-50 flex items-center justify-center shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAY_NAMES[lang].map((wd) => (
                <div key={wd} className="text-center text-[11px] font-bold text-slate-400 py-1">{wd}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstWeekday }).map((_, i) => <div key={`blank-${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDay(day)}
                  className={`aspect-square rounded-xl text-sm font-bold flex items-center justify-center ${
                    isSelected(day) ? 'bg-mellow-purple text-white' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateField;

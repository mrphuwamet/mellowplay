import { useMemo, useState } from 'react';
import { getCountries, getCountryCallingCode } from 'libphonenumber-js/min';
import type { CountryCode } from 'libphonenumber-js';
import * as Flags from 'country-flag-icons/react/3x2';
import { Search, X } from 'lucide-react';
import { useTranslation } from '../LanguageContext';

interface CountryOption {
  iso2: CountryCode;
  dialCode: string;
  name: string;
}

const ALL_COUNTRIES = getCountries();

interface CountrySelectorProps {
  value: CountryCode;
  onChange: (iso2: CountryCode) => void;
}

export const CountrySelector = ({ value, onChange }: CountrySelectorProps) => {
  const { lang, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const countries = useMemo<CountryOption[]>(() => {
    const displayNames = new Intl.DisplayNames([lang === 'th' ? 'th' : 'en'], { type: 'region' });
    return ALL_COUNTRIES
      .map((iso2) => ({
        iso2,
        dialCode: `+${getCountryCallingCode(iso2)}`,
        name: displayNames.of(iso2) || iso2
      }))
      .sort((a, b) => a.name.localeCompare(b.name, lang));
  }, [lang]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) =>
      c.name.toLowerCase().includes(q) || c.dialCode.includes(q) || c.iso2.toLowerCase().includes(q)
    );
  }, [countries, query]);

  const selected = countries.find((c) => c.iso2 === value);
  const SelectedFlag = (Flags as any)[value];

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 flex items-center gap-1.5 px-3 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-600"
      >
        {SelectedFlag && <SelectedFlag className="w-5 h-auto rounded-[2px] shrink-0" />}
        {selected?.dialCode}
      </button>

      {open && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center animate-in fade-in duration-200">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={close} />
          <div className="relative w-full max-w-[430px] bg-white rounded-t-[28px] max-h-[80vh] flex flex-col p-5 pb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-mellow-ink text-base">{t.register.selectCountry}</h3>
              <button
                type="button"
                onClick={close}
                className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            <div className="relative mb-3 shrink-0">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Search size={18} />
              </div>
              <input
                type="text"
                autoFocus
                placeholder={t.register.searchCountry}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-[12px] bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm focus:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {filtered.map((c) => {
                const Flag = (Flags as any)[c.iso2];
                return (
                  <button
                    key={c.iso2}
                    type="button"
                    onClick={() => {
                      onChange(c.iso2);
                      close();
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left hover:bg-slate-50 ${
                      c.iso2 === value ? 'bg-mellow-purple/5' : ''
                    }`}
                  >
                    {Flag && <Flag className="w-6 h-auto rounded-[2px] shrink-0" />}
                    <span className="flex-1 font-bold text-sm text-slate-700 truncate">{c.name}</span>
                    <span className="font-bold text-sm text-slate-400 shrink-0">{c.dialCode}</span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-slate-400 font-bold py-8">{t.register.noCountryFound}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

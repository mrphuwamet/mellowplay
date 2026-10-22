import React from 'react';
import { Plus, X, Check } from 'lucide-react';

export interface ParticipantOption {
  key: string;
  label: string;
  price?: number;
  /** What everyone after the first pays, when it differs from the first. */
  priceFrom2?: number;
  /** Not available to the first person — the server enforces this too. */
  disabledOnFirst?: boolean;
  disabledOnFirstNote?: string;
  /**
   * What the option is made of. Shown so a price has a visible origin, and
   * never added up: it describes the one price above it.
   */
  detail?: { label: string; price?: number }[];
}

/**
 * Something else to ask about each person — a nickname, a birthday, a shirt
 * size. Configured per form rather than built in, because what a Halloween
 * party needs to know about a child is not what a tournament needs to know
 * about a player.
 *
 * Never priced. A question that changes the bill is an option with a price
 * on it, which is a different thing in a different place, so that the set of
 * ways to charge money stays small enough to check.
 */
export interface PersonField {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'tel' | 'select';
  required?: boolean;
  placeholder?: string;
  /** Only read when type is 'select'. */
  options?: string[];
}

export interface ParticipantListConfig {
  itemLabel?: string;
  addLabel?: string;
  nameLabel?: string;
  namePlaceholder?: string;
  choiceLabel?: string;
  min?: number;
  max?: number;
  options?: ParticipantOption[];
  personFields?: PersonField[];
}

export interface ParticipantAnswer {
  name: string;
  choice: string;
  /**
   * The answers to personFields, kept in their own object rather than spread
   * across the row. A form is free to ask for a field called "name" or
   * "choice" without shadowing the two this component owns.
   */
  extra?: Record<string, any>;
}

/** Only fields with both a key and a label are real questions. */
export const personFieldsOf = (config: ParticipantListConfig): PersonField[] =>
  (config.personFields || []).filter((pf) => pf && pf.key && pf.label);

interface Props {
  config: ParticipantListConfig;
  value: ParticipantAnswer[];
  onChange: (next: ParticipantAnswer[]) => void;
  lang: 'th' | 'en';
}

/**
 * The price an option carries in a given position.
 *
 * Mirrors participantPrice on the server, which is the one that decides what
 * is charged. This copy exists only so a price can be read before it is
 * chosen — the running total beneath the form always comes from the server.
 */
export const priceAt = (option: ParticipantOption, index: number): number => {
  const first = Number(option.price) || 0;
  if (index === 0) return first;
  return option.priceFrom2 === undefined || option.priceFrom2 === null ? first : Number(option.priceFrom2) || 0;
};

const baht = (n: number) => n.toLocaleString('th-TH');

/**
 * A list of people, added one at a time, each choosing how they take part.
 *
 * Built as cards rather than a table because a family rate has to be legible
 * person by person: the second child's price is different from the first's,
 * and a row of inputs gives nowhere to say why.
 */
const ParticipantListField: React.FC<Props> = ({ config, value, onChange, lang }) => {
  const options = config.options || [];
  const min = Math.max(0, Number(config.min) || 0);
  const max = Number(config.max) || 0;
  const itemLabel = config.itemLabel || (lang === 'en' ? 'participant' : 'ผู้เข้าร่วม');
  const extras = personFieldsOf(config);
  const people = value.length > 0 ? value : (min > 0 ? [{ name: '', choice: '' }] : []);

  const patch = (index: number, change: Partial<ParticipantAnswer>) => {
    onChange(people.map((p, i) => (i === index ? { ...p, ...change } : p)));
  };
  const patchExtra = (index: number, key: string, v: any) =>
    patch(index, { extra: { ...(people[index].extra || {}), [key]: v } });
  const add = () => onChange([...people, { name: '', choice: '' }]);
  const remove = (index: number) => onChange(people.filter((_, i) => i !== index));

  return (
    <div className="space-y-3">
      {people.map((person, index) => {
        const first = index === 0;
        return (
          <div key={index} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black text-mellow-purple uppercase tracking-wide">
                {itemLabel} {lang === 'en' ? `#${index + 1}` : `คนที่ ${index + 1}`}
              </span>
              {/* Removing is only offered where it would leave a valid list,
                  so nobody is handed a button that refuses to work. */}
              {people.length > min && people.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={lang === 'en' ? 'Remove' : 'เอาออก'}
                  className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <X size={14} className="text-slate-500" />
                </button>
              )}
            </div>

            <input
              type="text"
              value={person.name}
              onChange={(e) => patch(index, { name: e.target.value })}
              placeholder={config.namePlaceholder || (lang === 'en' ? 'Full name' : 'ชื่อ-นามสกุล')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 focus:border-mellow-purple transition-all mb-3"
            />

            {extras.length > 0 && (
              <div className="space-y-3 mb-3">
                {extras.map((pf) => {
                  const v = (person.extra || {})[pf.key] ?? '';
                  const box = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 focus:border-mellow-purple transition-all';
                  return (
                    <div key={pf.key}>
                      <p className="text-xs font-black text-slate-400 mb-1.5">
                        {pf.label}
                        {pf.required && <span className="text-mellow-red"> *</span>}
                      </p>
                      {pf.type === 'select' ? (
                        <select value={v} onChange={(e) => patchExtra(index, pf.key, e.target.value)} className={box}>
                          <option value="">{lang === 'en' ? 'Select...' : 'เลือก...'}</option>
                          {(pf.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input
                          type={pf.type === 'date' ? 'date' : pf.type === 'number' ? 'number' : pf.type === 'tel' ? 'tel' : 'text'}
                          inputMode={pf.type === 'tel' ? 'tel' : pf.type === 'number' ? 'numeric' : undefined}
                          value={v}
                          onChange={(e) => patchExtra(index, pf.key, e.target.value)}
                          placeholder={pf.placeholder || ''}
                          className={box}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {config.choiceLabel && (
              <p className="text-xs font-black text-slate-400 mb-2">{config.choiceLabel}</p>
            )}

            <div className="space-y-2">
              {options.map((option) => {
                const blocked = first && !!option.disabledOnFirst;
                const amount = priceAt(option, index);
                const selected = person.choice === option.key;
                const saving = index > 0 && option.priceFrom2 !== undefined && Number(option.price) > amount
                  ? Number(option.price) - amount
                  : 0;

                return (
                  <div key={option.key}>
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => patch(index, { choice: option.key })}
                      className={`w-full text-left rounded-2xl border p-3 transition-all ${
                        blocked
                          ? 'bg-slate-50 border-slate-100 opacity-60 cursor-not-allowed'
                          : selected
                            ? 'bg-mellow-purple/5 border-mellow-purple'
                            : 'bg-white border-slate-200 active:scale-[0.99]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                            selected ? 'border-mellow-purple bg-mellow-purple' : 'border-slate-300'
                          }`}>
                            {selected && <Check size={12} className="text-white" strokeWidth={3} />}
                          </span>
                          <span className="text-sm font-bold text-slate-700 min-w-0 break-words">{option.label}</span>
                        </div>
                        <span className="text-sm font-black text-slate-800 shrink-0">
                          {amount > 0 ? `${baht(amount)} ฿` : (lang === 'en' ? 'Free' : 'ฟรี')}
                        </span>
                      </div>

                      {saving > 0 && (
                        <p className="text-[11px] font-bold text-mellow-green pl-7 mt-1">
                          {lang === 'en'
                            ? `${baht(saving)} ฿ off — from the second person onwards`
                            : `ลด ${baht(saving)} ฿ จาก ${baht(Number(option.price))} ฿ สำหรับคนที่ 2 เป็นต้นไป`}
                        </p>
                      )}

                      {/* Where the price comes from. Listed, never summed —
                          these describe the single figure above them. */}
                      {option.detail && option.detail.length > 0 && (
                        <div className="pl-7 mt-2 space-y-0.5">
                          {option.detail.map((item, j) => (
                            <div key={j} className="flex justify-between gap-3 text-[11px] font-bold text-slate-400">
                              <span className="min-w-0 break-words">• {item.label}</span>
                              {item.price !== undefined && <span className="shrink-0">มูลค่า {baht(Number(item.price))} ฿</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </button>

                    {blocked && (
                      <p className="text-[11px] font-bold text-slate-400 pl-3 mt-1 leading-relaxed">
                        {option.disabledOnFirstNote
                          || (lang === 'en'
                            ? 'Not available for the first person in a family.'
                            : 'คนแรกของแต่ละครอบครัวเลือกตัวเลือกนี้ไม่ได้')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {(max === 0 || people.length < max) && (
        <button
          type="button"
          onClick={add}
          className="w-full h-[50px] rounded-2xl border-2 border-dashed border-mellow-purple/30 text-mellow-purple font-black text-sm flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
        >
          <Plus size={18} />
          {config.addLabel || (lang === 'en' ? 'Add another' : `เพิ่ม${itemLabel}`)}
        </button>
      )}

      {max > 0 && people.length >= max && (
        <p className="text-[11px] font-bold text-slate-400 text-center">
          {lang === 'en' ? `Up to ${max} per registration` : `เพิ่มได้สูงสุด ${max} คนต่อการลงทะเบียน`}
        </p>
      )}
    </div>
  );
};

export default ParticipantListField;

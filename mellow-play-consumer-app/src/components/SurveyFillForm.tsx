import React, { useMemo, useRef, useState } from 'react';

interface SurveyField {
  id: number;
  field_key: string;
  type: string;
  label: string;
  required: number | boolean;
  options_json?: string | null;
  config_json?: string | null;
  page_index: number;
  field_index: number;
}

interface SurveyForm {
  id: number;
  name: string;
  description?: string;
  fields: SurveyField[];
}

interface Identity {
  mode: 'prefill' | 'manual';
  name: string;
  phone: string;
}

interface Props {
  form: SurveyForm;
  answers: Record<string, any>;
  onChange: (fieldKey: string, value: any) => void;
  identity: Identity;
  onIdentityChange: (identity: Identity) => void;
  accountName?: string;
  accountPhone?: string;
  isLoggedIn: boolean;
  onSubmit: () => void;
  submitting: boolean;
  lang: 'th' | 'en';
  // Session mode: this form is one leg of a chained set, so the page counter
  // must read across the whole chain and the last page is only "submit" when
  // no further form follows. Without these the seam between forms is obvious,
  // which defeats the point of chaining them.
  progressOffset?: number;
  progressTotal?: number;
  isFinalStep?: boolean;
}

// Fill-it-out renderer for a standalone Survey/Pre-Test/Post-Test form —
// a trimmed sibling of DynamicRegistrationForm (booking registration forms):
// same page-grouping/validation/navigation shell and plain field types, but
// with no roster/team-capacity machinery (surveys aren't scoped to a course)
// and one new field type, `identity`, for "who's answering" — prefilled from
// a logged-in account or typed manually for a guest.
const SurveyFillForm: React.FC<Props> = ({
  form, answers, onChange, identity, onIdentityChange, accountName, accountPhone,
  isLoggedIn, onSubmit, submitting, lang,
  progressOffset = 0, progressTotal, isFinalStep = true,
}) => {
  // Group by page, keeping the order the server sent. It used to slot fields
  // in by field_index, which silently undid the per-respondent shuffle a form
  // can now be set to (the server already returns fields in display order and
  // renumbers field_index to match).
  const pages = useMemo(() => {
    const grouped: SurveyField[][] = [];
    for (const f of form.fields) {
      const idx = f.page_index ?? 0;
      if (!grouped[idx]) grouped[idx] = [];
      grouped[idx].push(f);
    }
    return grouped.map(page => page || []);
  }, [form]);

  const [pageIndex, setPageIndex] = useState(0);
  const [invalidFieldKey, setInvalidFieldKey] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const currentFields = pages[pageIndex] || [];
  const isLastPage = pageIndex === pages.length - 1;
  const totalPages = progressTotal ?? pages.length;
  const shownPage = progressOffset + pageIndex + 1;

  const isFieldFilled = (f: SurveyField) => {
    if (f.type === 'identity') return identity.mode === 'prefill' ? !!accountName : !!identity.name.trim();
    const v = answers[f.field_key];
    if (f.type === 'checkbox') return Array.isArray(v) && v.length > 0;
    return v != null && String(v).trim() !== '';
  };
  const needsAnswer = (f: SurveyField) => f.type !== 'heading' && f.type !== 'paragraph' && f.type !== 'image' && !!f.required && !isFieldFilled(f);

  const handleNext = () => {
    const firstInvalid = currentFields.find(needsAnswer);
    if (firstInvalid) {
      setInvalidFieldKey(firstInvalid.field_key);
      const el = fieldRefs.current[firstInvalid.field_key];
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.querySelector<HTMLElement>('input, textarea, select')?.focus();
      return;
    }
    setInvalidFieldKey(null);
    if (isLastPage) onSubmit();
    else setPageIndex(pageIndex + 1);
  };
  const handleBack = () => { if (pageIndex > 0) setPageIndex(pageIndex - 1); };

  const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 focus:border-mellow-purple transition-all";

  return (
    <div className="space-y-4">
      {totalPages > 1 && (
        <p className="text-xs font-bold text-slate-400">
          {lang === 'en' ? `Page ${shownPage} of ${totalPages}` : `หน้า ${shownPage} จาก ${totalPages}`}
        </p>
      )}

      <div className="space-y-4">
        {currentFields.map(field => {
          if (field.type === 'heading') {
            return <h4 key={field.field_key} className="text-[15px] font-black text-slate-500 uppercase tracking-wide pt-2">{field.label}</h4>;
          }
          // Reading passage. whitespace-pre-line is the whole point: the author
          // typed the line breaks, and a comprehension text or a scenario is
          // unreadable once they collapse. Normal weight and a looser line
          // height, since this is prose to read rather than a label to scan.
          if (field.type === 'paragraph') {
            return (
              <p key={field.field_key} className="text-sm font-medium text-slate-600 leading-relaxed whitespace-pre-line bg-slate-50 rounded-2xl p-4">
                {field.label}
              </p>
            );
          }
          if (field.type === 'image') {
            let imageUrl: string | undefined;
            try { imageUrl = field.config_json ? JSON.parse(field.config_json).imageUrl : undefined; } catch { /* malformed config just skips rendering this image */ }
            if (!imageUrl) return null;
            return (
              <figure key={field.field_key} className="space-y-1.5">
                <img src={imageUrl} alt={field.label || ''} className="w-full rounded-2xl object-cover" />
                {field.label && <figcaption className="text-xs font-bold text-slate-400 text-center">{field.label}</figcaption>}
              </figure>
            );
          }

          const options: { label: string }[] = field.options_json ? JSON.parse(field.options_json) : [];
          const value = answers[field.field_key];
          const isInvalid = field.field_key === invalidFieldKey;
          const wrapClass = isInvalid ? 'rounded-2xl ring-2 ring-mellow-red/60 -m-1.5 p-1.5' : '';
          // Bigger and darker than the answers below it. Widening the
          // options to one per line left them larger than the question they
          // answered, which reads as a list with a caption over it rather
          // than a question with its choices.
          const labelEl = (
            <label className="text-[19px] font-black text-slate-800 block mb-3 leading-snug">
              {field.label}{!!field.required && <span className="text-mellow-red ml-0.5">*</span>}
            </label>
          );

          if (field.type === 'identity') {
            return (
              <div key={field.field_key} ref={el => { fieldRefs.current[field.field_key] = el; }} className={wrapClass}>
                {labelEl}
                {isLoggedIn && (
                  <div className="flex gap-2 mb-2">
                    <button type="button" onClick={() => onIdentityChange({ ...identity, mode: 'prefill' })}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${identity.mode === 'prefill' ? 'bg-mellow-purple text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {lang === 'en' ? 'Use my info' : 'ใช้ข้อมูลของฉัน'}
                    </button>
                    <button type="button" onClick={() => onIdentityChange({ ...identity, mode: 'manual' })}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${identity.mode === 'manual' ? 'bg-mellow-purple text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {lang === 'en' ? 'Someone else' : 'ระบุเอง'}
                    </button>
                  </div>
                )}
                {isLoggedIn && identity.mode === 'prefill' ? (
                  <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800">
                    {accountName || '-'}{accountPhone ? ` · ${accountPhone}` : ''}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={identity.name} onChange={e => onIdentityChange({ ...identity, name: e.target.value })}
                      placeholder={lang === 'en' ? 'Name' : 'ชื่อ'} className={inputClass} />
                    <input type="tel" value={identity.phone} onChange={e => onIdentityChange({ ...identity, phone: e.target.value })}
                      placeholder={lang === 'en' ? 'Phone (optional)' : 'เบอร์โทร (ไม่บังคับ)'} className={inputClass} />
                  </div>
                )}
              </div>
            );
          }
          if (field.type === 'text') {
            return (
              <div key={field.field_key} ref={el => { fieldRefs.current[field.field_key] = el; }} className={wrapClass}>
                {labelEl}
                <input type="text" value={value || ''} onChange={e => onChange(field.field_key, e.target.value)} className={inputClass} />
              </div>
            );
          }
          if (field.type === 'textarea') {
            return (
              <div key={field.field_key} ref={el => { fieldRefs.current[field.field_key] = el; }} className={wrapClass}>
                {labelEl}
                <textarea rows={3} value={value || ''} onChange={e => onChange(field.field_key, e.target.value)} className={`${inputClass} resize-none`} />
              </div>
            );
          }
          if (field.type === 'number') {
            return (
              <div key={field.field_key} ref={el => { fieldRefs.current[field.field_key] = el; }} className={wrapClass}>
                {labelEl}
                <input type="number" value={value ?? ''} onChange={e => onChange(field.field_key, e.target.value)} className={inputClass} />
              </div>
            );
          }
          if (field.type === 'date') {
            return (
              <div key={field.field_key} ref={el => { fieldRefs.current[field.field_key] = el; }} className={wrapClass}>
                {labelEl}
                <input type="date" value={value || ''} onChange={e => onChange(field.field_key, e.target.value)} className={inputClass} />
              </div>
            );
          }
          if (field.type === 'select') {
            return (
              <div key={field.field_key} ref={el => { fieldRefs.current[field.field_key] = el; }} className={wrapClass}>
                {labelEl}
                <select value={value || ''} onChange={e => onChange(field.field_key, e.target.value)} className={inputClass}>
                  <option value="">{lang === 'en' ? 'Select...' : 'เลือก...'}</option>
                  {options.map(opt => <option key={opt.label} value={opt.label}>{opt.label}</option>)}
                </select>
              </div>
            );
          }
          if (field.type === 'radio') {
            return (
              <div key={field.field_key} ref={el => { fieldRefs.current[field.field_key] = el; }} className={wrapClass}>
                {labelEl}
{/* One option per line. Wrapped pills read as a row of tags and put
                    two answers side by side, which is fine for "ใช่/ไม่ใช่" and
                    unreadable for a full sentence — and a test's answers are
                    usually sentences. A column also gives every option the same
                    width, so none of them looks more important than the rest. */}
                <div className="flex flex-col gap-2">
                  {options.map(opt => (
                    <button key={opt.label} type="button" onClick={() => onChange(field.field_key, opt.label)}
                      className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold leading-relaxed transition-all ${value === opt.label ? 'bg-mellow-purple text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          if (field.type === 'checkbox') {
            const arr: string[] = Array.isArray(value) ? value : [];
            return (
              <div key={field.field_key} ref={el => { fieldRefs.current[field.field_key] = el; }} className={wrapClass}>
                {labelEl}
<div className="flex flex-col gap-2">
                  {options.map(opt => {
                    const checked = arr.includes(opt.label);
                    return (
                      <button key={opt.label} type="button"
                        onClick={() => onChange(field.field_key, checked ? arr.filter(o => o !== opt.label) : [...arr, opt.label])}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold leading-relaxed transition-all ${checked ? 'bg-mellow-purple text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }
          return null;
        })}
      </div>

      <div className="flex gap-3 pt-2">
        {pageIndex > 0 && (
          <button type="button" onClick={handleBack} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl text-sm font-black uppercase tracking-wider active:scale-95 transition-all">
            {lang === 'en' ? 'Back' : 'ย้อนกลับ'}
          </button>
        )}
        <button type="button" onClick={handleNext} disabled={submitting}
          className="flex-[2] py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg active:scale-95 transition-all disabled:opacity-50">
          {submitting
            ? (lang === 'en' ? 'Submitting...' : 'กำลังส่ง...')
            : (isLastPage && isFinalStep)
              ? (lang === 'en' ? 'Submit' : 'ส่งคำตอบ')
              : (lang === 'en' ? 'Next' : 'ขั้นตอนถัดไป')}
        </button>
      </div>
    </div>
  );
};

export default SurveyFillForm;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { scrollToTop } from '../utils/scrollToTop';

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
// A question or passage the CRM author formatted (bold, colour) is stored as
// HTML beside its plain text. It renders as markup here for the same reason
// course descriptions do: it is staff-authored content, not user input. The
// plain text is still what exports and the summary charts read.
const labelHtmlOf = (field: SurveyField): string | null => {
  try {
    const html = field.config_json ? JSON.parse(field.config_json).labelHtml : null;
    return typeof html === 'string' && html.trim() ? html : null;
  } catch { return null; }
};

// A rating question drawn as one horizontal row of rungs instead of a stacked
// list of options. It is a presentation flag on an ordinary radio field, not a
// field type of its own, so the answer stored is still the option label and
// everything downstream — scoring, CSV, the summary charts — is unchanged.
const scaleConfigOf = (field: SurveyField): { low?: string; high?: string } | null => {
  try {
    const cfg = field.config_json ? JSON.parse(field.config_json) : null;
    if (!cfg || cfg.display !== 'scale') return null;
    return { low: cfg.scaleLowLabel, high: cfg.scaleHighLabel };
  } catch { return null; }
};

// Mirrors fitsScaleRow() in
// mellow-play-crm-portal/src/pages/SurveyManagement.tsx, which shows the author
// which layout they are going to get. Change both together.
//
// The ceiling is about the phone, not about taste: seven cells across a 360px
// screen leaves ~44px each, which is the smallest comfortable tap target, and a
// caption longer than ten Thai characters cannot be read in a cell that narrow.
// Past either limit the stacked list is the readable layout, so fall back to it
// rather than shipping a row nobody can use.
const SCALE_MAX_OPTIONS = 7;
const SCALE_MAX_LABEL = 10;
const fitsScaleRow = (opts: { label: string }[]): boolean =>
  opts.length >= 2 && opts.length <= SCALE_MAX_OPTIONS &&
  opts.every(o => (o.label || '').trim().length <= SCALE_MAX_LABEL);

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

  // identity carries its own extra rule, so it cannot use the plain
  // "is there a value" test the other types share.
  const identityPhoneRequired = (f: SurveyField): boolean => {
    try { return !!(f.config_json ? JSON.parse(f.config_json).phoneRequired : false); } catch { return false; }
  };

  // An option can carry its own text box (the "อื่น ๆ ระบุ ......" line on a
  // paper form). Picking it and leaving the box empty is not an answer, so the
  // box counts toward the question being filled rather than being a separate
  // optional field nobody notices.
  const otherBoxSatisfied = (f: SurveyField): boolean => {
    let opts: { label: string; allowText?: boolean }[] = [];
    try { opts = f.options_json ? JSON.parse(f.options_json) : []; } catch { return true; }
    const withBox = opts.filter(o => o.allowText);
    if (withBox.length === 0) return true;
    const v = answers[f.field_key];
    const picked = Array.isArray(v) ? v.map(String) : (v == null ? [] : [String(v)]);
    if (!withBox.some(o => picked.includes(o.label))) return true;
    return String(answers[`${f.field_key}__other`] ?? '').trim() !== '';
  };

  const isFieldFilled = (f: SurveyField) => {
    if (f.type === 'identity') {
      // Prefill fills both from the account, so there is nothing to check
      // beyond having an account name to fill from.
      if (identity.mode === 'prefill') return !!accountName;
      if (!identity.name.trim()) return false;
      return !identityPhoneRequired(f) || !!identity.phone.trim();
    }
    const v = answers[f.field_key];
    if (f.type === 'checkbox') return Array.isArray(v) && v.length > 0 && otherBoxSatisfied(f);
    return v != null && String(v).trim() !== '' && otherBoxSatisfied(f);
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

  // Same reason the booking wizard does it: a page change swaps the whole
  // question under the reader while leaving them scrolled where the buttons
  // were, so going back could look like nothing happened at all.
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollToTop(formRef.current); }, [pageIndex]);

  // An option with its own colour: outlined when idle so the colour reads as a
  // label, filled when chosen so the choice is unmistakable. Options with no
  // colour keep the original slate/purple treatment via Tailwind classes.
  const optionStyle = (color: string | undefined, active: boolean): React.CSSProperties | undefined => {
    if (!color) return undefined;
    return active
      ? { backgroundColor: color, color: '#ffffff', border: `2px solid ${color}` }
      : { backgroundColor: '#ffffff', color, border: `2px solid ${color}` };
  };

  // Stored beside the answer as `${field_key}__other`, the same companion-key
  // convention the person picker uses for __realname/__nickname. Keeping it out
  // of the answer itself means "อื่น ๆ" stays one tally in the summary instead
  // of splintering into a separate bar per thing anyone wrote.
  const otherBox = (field: SurveyField) => (
    <input
      type="text"
      value={answers[`${field.field_key}__other`] || ''}
      onChange={e => onChange(`${field.field_key}__other`, e.target.value)}
      placeholder={lang === 'en' ? 'Please specify' : 'โปรดระบุ'}
      className="w-full px-3.5 py-2.5 bg-white border-2 border-mellow-purple/25 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-mellow-purple transition-all"
    />
  );

  const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 focus:border-mellow-purple transition-all";

  return (
    <div className="space-y-4 font-body-scope" ref={formRef}>
      {totalPages > 1 && (
        <p className="text-xs font-bold text-slate-400">
          {lang === 'en' ? `Page ${shownPage} of ${totalPages}` : `หน้า ${shownPage} จาก ${totalPages}`}
        </p>
      )}

      <div className="space-y-6">
        {currentFields.map(field => {
          const richLabel = labelHtmlOf(field);

          if (field.type === 'heading') {
            return richLabel
              ? <div key={field.field_key} className="prose-news text-[15px] font-bold text-slate-500 pt-2" dangerouslySetInnerHTML={{ __html: richLabel }} />
              : <h4 key={field.field_key} className="text-[15px] font-black text-slate-500 uppercase tracking-wide pt-2">{field.label}</h4>;
          }
          // Reading passage. whitespace-pre-line is the whole point: the author
          // typed the line breaks, and a comprehension text or a scenario is
          // unreadable once they collapse. Normal weight and a looser line
          // height, since this is prose to read rather than a label to scan.
          if (field.type === 'paragraph') {
            return richLabel ? (
              <div
                key={field.field_key}
                className="prose-news text-sm font-medium text-slate-600 leading-relaxed bg-slate-50 rounded-2xl p-4"
                dangerouslySetInnerHTML={{ __html: richLabel }}
              />
            ) : (
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

          const options: { label: string; color?: string; allowText?: boolean }[] = field.options_json ? JSON.parse(field.options_json) : [];
          const value = answers[field.field_key];
          const isInvalid = field.field_key === invalidFieldKey;
          const wrapClass = isInvalid ? 'rounded-2xl ring-2 ring-mellow-red/60 -m-1.5 p-1.5' : '';
          // Bigger and darker than the answers below it. Widening the
          // options to one per line left them larger than the question they
          // answered, which reads as a list with a caption over it rather
          // than a question with its choices.
          const labelEl = richLabel ? (
            <div className="mb-3 flex items-start gap-1">
              <div
                className="prose-news text-[19px] font-bold text-slate-800 leading-snug"
                dangerouslySetInnerHTML={{ __html: richLabel }}
              />
              {!!field.required && <span className="text-mellow-red">*</span>}
            </div>
          ) : (
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
                      placeholder={lang === 'en' ? 'Full name' : 'ชื่อ-สกุล'} className={inputClass} />
                    <input type="tel" value={identity.phone} onChange={e => onIdentityChange({ ...identity, phone: e.target.value })}
                      placeholder={identityPhoneRequired(field)
                        ? (lang === 'en' ? 'Phone' : 'เบอร์โทร')
                        : (lang === 'en' ? 'Phone (optional)' : 'เบอร์โทร (ไม่บังคับ)')}
                      className={inputClass} />
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
          const scaleConfig = field.type === 'radio' ? scaleConfigOf(field) : null;
          if (scaleConfig && fitsScaleRow(options)) {
            // Sized down only once the row gets crowded — a five-rung scale, by
            // far the common case, keeps type big enough to read at arm's length.
            const dense = options.length > 5;
            return (
              <div key={field.field_key} ref={el => { fieldRefs.current[field.field_key] = el; }} className={`border-t border-slate-100 pt-4 ${wrapClass}`}>
                {labelEl}
                {/* Repeated on every question on purpose. On paper the column
                    headers sit once at the top of the table; on a phone the
                    question that used to be row 7 is now a screen away from
                    them, and having to scroll back to remember which end means
                    "มากที่สุด" is exactly what makes these forms get abandoned. */}
                {(scaleConfig.low || scaleConfig.high) && (
                  <div className="flex justify-between items-end gap-2 mb-1.5 px-0.5">
                    <span className="text-[11px] font-bold text-slate-400 leading-tight">{scaleConfig.low || ''}</span>
                    <span className="text-[11px] font-bold text-slate-400 leading-tight text-right">{scaleConfig.high || ''}</span>
                  </div>
                )}
                <div
                  role="radiogroup" aria-label={field.label}
                  className={`grid ${dense ? 'gap-1' : 'gap-1.5'}`}
                  style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
                >
                  {options.map(opt => {
                    const chosen = value === opt.label;
                    return (
                      <button
                        key={opt.label} type="button" role="radio" aria-checked={chosen}
                        onClick={() => onChange(field.field_key, opt.label)}
                        style={optionStyle(opt.color, chosen)}
                        className={`min-h-[64px] px-1 py-2 rounded-xl font-black leading-tight break-words
                          flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95
                          ${dense ? 'text-[10px]' : 'text-[12px]'}
                          ${opt.color ? '' : chosen ? 'bg-mellow-purple text-white shadow-md' : 'bg-slate-100 text-slate-600'}`}
                      >
                        {/* Same reason as the stacked list: once options can
                            carry their own colours, "which one did I pick" must
                            not rest on colour alone. */}
                        <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${chosen ? 'border-current' : 'border-slate-300'}`}>
                          {chosen && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                        </span>
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
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
                  {options.map(opt => {
                    const chosen = value === opt.label;
                    const withBox = !!opt.allowText && chosen;
                    return (
                      // The box belongs to this option, so it sits inside the
                      // option's own tinted block. As a separate field below the
                      // list it read as one more thing to answer rather than as
                      // part of the choice that opened it.
                      <div key={opt.label} className={withBox ? 'flex flex-col gap-1.5 p-1.5 rounded-2xl bg-mellow-purple/10' : ''}>
                      <button type="button"
                        onClick={() => {
                          onChange(field.field_key, opt.label);
                          // Moving to a plain option drops whatever was typed
                          // into the one being left behind.
                          if (!opt.allowText) onChange(`${field.field_key}__other`, '');
                        }}
                        style={optionStyle(opt.color, chosen)}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold leading-relaxed transition-all flex items-center gap-2 ${
                          opt.color ? '' : chosen ? 'bg-mellow-purple text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {/* A tick, not just a fill: once options carry their own
                            colours, "which one did I pick" cannot be left to
                            colour alone. */}
                        <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${chosen ? 'border-current' : 'border-transparent'}`}>
                          {chosen && <span className="w-2 h-2 rounded-full bg-current" />}
                        </span>
                        {opt.label}
                      </button>
                      {withBox && otherBox(field)}
                      </div>
                    );
                  })}
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
                    const withBox = !!opt.allowText && checked;
                    return (
                      <div key={opt.label} className={withBox ? 'flex flex-col gap-1.5 p-1.5 rounded-2xl bg-mellow-purple/10' : ''}>
                      <button type="button"
                        onClick={() => {
                          onChange(field.field_key, checked ? arr.filter(o => o !== opt.label) : [...arr, opt.label]);
                          // Unticking it throws away what was typed: a stale
                          // note travelling with an unticked box is worse than
                          // no note at all.
                          if (opt.allowText && checked) onChange(`${field.field_key}__other`, '');
                        }}
                        style={optionStyle(opt.color, checked)}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold leading-relaxed transition-all flex items-center gap-2 ${
                          opt.color ? '' : checked ? 'bg-mellow-purple text-white' : 'bg-slate-100 text-slate-600'}`}>
                        <span className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${checked ? 'border-current' : 'border-transparent'}`}>
                          {checked && <span className="w-2 h-2 rounded-sm bg-current" />}
                        </span>
                        {opt.label}
                      </button>
                      {withBox && otherBox(field)}
                      </div>
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

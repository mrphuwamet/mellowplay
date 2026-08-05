import React, { useState, useEffect, useMemo } from 'react';
import ChildAvatar from './ChildAvatar';

interface RegFormField {
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

interface RegForm {
  id: number;
  name: string;
  description?: string;
  fields: RegFormField[];
}

interface RosterMember {
  id: number;
  name: string;
  nickname?: string;
  avatar?: string;
  relation?: string;
}

interface Props {
  form: RegForm;
  answers: Record<string, any>;
  onChange: (fieldKey: string, value: any) => void;
  roster: RosterMember[];
  onBack: () => void;
  onNext: () => void;
  lang: 'th' | 'en';
}

// Renders whatever pages/fields a CRM-built Registration_Form has, one page
// per internal step — kept as its own component (rather than spliced
// straight into Booking.tsx) since it manages its own page index, separate
// from the outer wizard's currentStepIndex.
const DynamicRegistrationForm: React.FC<Props> = ({ form, answers, onChange, roster, onBack, onNext, lang }) => {
  const pages = useMemo(() => {
    const grouped: RegFormField[][] = [];
    for (const f of form.fields) {
      const idx = f.page_index ?? 0;
      if (!grouped[idx]) grouped[idx] = [];
      grouped[idx][f.field_index] = f;
    }
    return grouped.map(page => (page || []).filter(Boolean));
  }, [form]);

  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => { setPageIndex(0); }, [form.id]);

  const currentFields = pages[pageIndex] || [];

  const isFieldFilled = (f: RegFormField) => {
    const v = answers[f.field_key];
    if (f.type === 'checkbox') return Array.isArray(v) && v.length > 0;
    return v != null && String(v).trim() !== '';
  };
  const canProceed = currentFields.every(f => f.type === 'heading' || !f.required || isFieldFilled(f));

  const handleNext = () => {
    if (pageIndex < pages.length - 1) setPageIndex(pageIndex + 1);
    else onNext();
  };
  const handleBack = () => {
    if (pageIndex > 0) setPageIndex(pageIndex - 1);
    else onBack();
  };

  // 'child' picks from the roster's children (no relation, or relation
  // explicitly 'child'); 'adult' picks from every other family member —
  // matches the CRM builder's own description of the two roles.
  const rosterFor = (role: string | undefined) => roster.filter(m =>
    role === 'adult' ? !!(m.relation && m.relation !== 'child') : (!m.relation || m.relation === 'child')
  );

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
      <div>
        <h3 className="text-lg font-black text-slate-800">{form.name}</h3>
        {pages.length > 1 && (
          <p className="text-xs font-bold text-slate-400 mt-1">
            {lang === 'en' ? `Page ${pageIndex + 1} of ${pages.length}` : `หน้า ${pageIndex + 1} จาก ${pages.length}`}
          </p>
        )}
      </div>

      <div className="space-y-4">
        {currentFields.map(field => {
          if (field.type === 'heading') {
            return <h4 key={field.field_key} className="text-base font-black text-slate-700 pt-2">{field.label}</h4>;
          }

          const options: string[] = field.options_json ? JSON.parse(field.options_json) : [];
          const config = field.config_json ? JSON.parse(field.config_json) : {};
          const value = answers[field.field_key];

          const labelEl = (
            <label className="text-xs font-bold text-slate-600 block mb-1.5">
              {field.label}{!!field.required && <span className="text-mellow-red ml-0.5">*</span>}
            </label>
          );

          const inputClass = "w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-mellow-purple/20 focus:border-mellow-purple transition-all";

          if (field.type === 'text') {
            return (
              <div key={field.field_key}>
                {labelEl}
                <input type="text" value={value || ''} onChange={e => onChange(field.field_key, e.target.value)} className={inputClass} />
              </div>
            );
          }
          if (field.type === 'textarea') {
            return (
              <div key={field.field_key}>
                {labelEl}
                <textarea rows={3} value={value || ''} onChange={e => onChange(field.field_key, e.target.value)} className={`${inputClass} resize-none`} />
              </div>
            );
          }
          if (field.type === 'number') {
            return (
              <div key={field.field_key}>
                {labelEl}
                <input type="number" value={value ?? ''} onChange={e => onChange(field.field_key, e.target.value)} className={inputClass} />
              </div>
            );
          }
          if (field.type === 'date') {
            return (
              <div key={field.field_key}>
                {labelEl}
                <input type="date" value={value || ''} onChange={e => onChange(field.field_key, e.target.value)} className={inputClass} />
              </div>
            );
          }
          if (field.type === 'select') {
            return (
              <div key={field.field_key}>
                {labelEl}
                <select value={value || ''} onChange={e => onChange(field.field_key, e.target.value)} className={inputClass}>
                  <option value="">{lang === 'en' ? 'Select...' : 'เลือก...'}</option>
                  {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
            );
          }
          if (field.type === 'radio') {
            return (
              <div key={field.field_key}>
                {labelEl}
                <div className="flex flex-wrap gap-2">
                  {options.map(opt => (
                    <button key={opt} type="button" onClick={() => onChange(field.field_key, opt)}
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${value === opt ? 'bg-mellow-purple text-white' : 'bg-slate-100 text-slate-500'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          if (field.type === 'checkbox') {
            const arr: string[] = Array.isArray(value) ? value : [];
            return (
              <div key={field.field_key}>
                {labelEl}
                <div className="flex flex-wrap gap-2">
                  {options.map(opt => {
                    const checked = arr.includes(opt);
                    return (
                      <button key={opt} type="button"
                        onClick={() => onChange(field.field_key, checked ? arr.filter(o => o !== opt) : [...arr, opt])}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${checked ? 'bg-mellow-purple text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }
          if (field.type === 'family_member_picker') {
            const list = rosterFor(config.role);
            return (
              <div key={field.field_key}>
                {labelEl}
                {list.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400">{lang === 'en' ? 'No family members found' : 'ไม่พบสมาชิกในครอบครัว'}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {list.map(member => {
                      const display = member.nickname || member.name;
                      const selected = value === display;
                      return (
                        <button key={member.id} type="button" onClick={() => onChange(field.field_key, display)}
                          className={`p-3 rounded-2xl border text-left flex items-center gap-2 transition-all ${selected ? 'bg-white border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100'}`}>
                          <ChildAvatar avatarType={member.avatar} className="w-8 h-8 shrink-0" />
                          <span className="text-xs font-black text-slate-700 truncate">{display}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>

      <div className="flex gap-3 mt-6">
        <button type="button" onClick={handleBack} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl text-sm font-black uppercase tracking-wider active:scale-95 transition-all">
          {lang === 'en' ? 'Back' : 'ย้อนกลับ'}
        </button>
        <button type="button" disabled={!canProceed} onClick={handleNext}
          className="flex-[2] py-4 bg-mellow-purple text-white rounded-2xl text-sm font-black uppercase tracking-wider shadow-lg disabled:opacity-50 active:scale-95 transition-all">
          {lang === 'en' ? 'Next' : 'ขั้นตอนถัดไป'}
        </button>
      </div>
    </div>
  );
};

export default DynamicRegistrationForm;

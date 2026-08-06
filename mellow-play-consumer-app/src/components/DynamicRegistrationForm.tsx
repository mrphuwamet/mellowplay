import React, { useState, useEffect, useMemo } from 'react';
import { Plus } from 'lucide-react';
import ChildAvatar from './ChildAvatar';
import apiClient from '../utils/apiClient';

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
  // When the form has a family_member_picker (role 'child'), that field
  // takes over child selection entirely — the wizard's separate 'child'
  // step is skipped, so this component drives selectedChildren directly
  // instead of just recording a name into answers. Single mode (events)
  // replaces the selection on tap; multi mode (class/service) toggles.
  childPickerMode?: 'single' | 'multi';
  selectedChildIds?: number[];
  onChildSelectionChange?: (ids: number[]) => void;
  // Lets a family_member_picker with nobody to pick from (or missing the
  // one they need) add a new family member without leaving this step —
  // wired by the caller to whatever "add family member" modal it already
  // has, so the roster refresh stays centralized there.
  onAddFamilyMember?: () => void;
  // The account holder themselves — they're a family member too (an adult),
  // but they're never a row in `roster` (that's the Children table; the
  // account holder lives in Users, a different table entirely). Injected
  // into the adult-role picker only, never the child one.
  mainAccount?: { name: string; nickname?: string; avatar?: string };
  // Needed to look up team_select availability — capacity is scoped to
  // form+course, not a specific round (this step happens before any
  // round/date is picked).
  courseId?: number;
}

// Renders whatever pages/fields a CRM-built Registration_Form has, one page
// per internal step — kept as its own component (rather than spliced
// straight into Booking.tsx) since it manages its own page index, separate
// from the outer wizard's currentStepIndex.
const DynamicRegistrationForm: React.FC<Props> = ({
  form, answers, onChange, roster, onBack, onNext, lang,
  childPickerMode = 'multi', selectedChildIds, onChildSelectionChange, onAddFamilyMember, mainAccount, courseId,
}) => {
  // field_key -> { teamLabel -> current count } — only fetched when the
  // form actually has a team_select field, refetched whenever the course
  // changes (a family could in theory browse to a different course while
  // this step is mid-fill, though the wizard doesn't normally allow that).
  const [teamCounts, setTeamCounts] = useState<Record<string, Record<string, number>>>({});
  const hasTeamSelect = form.fields.some(f => f.type === 'team_select');
  useEffect(() => {
    if (!hasTeamSelect || !courseId) { setTeamCounts({}); return; }
    apiClient.get(`/admin/registration-forms/${form.id}/team-availability?courseId=${courseId}`)
      .then(res => setTeamCounts(res.data.success ? res.data.counts : {}))
      .catch(() => setTeamCounts({}));
  }, [form.id, courseId, hasTeamSelect]);

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

  const isChildPickerField = (f: RegFormField) => {
    if (f.type !== 'family_member_picker' || !onChildSelectionChange) return false;
    try { return (JSON.parse(f.config_json || '{}').role) === 'child'; } catch { return false; }
  };

  // Keeps the child-picker field's recorded answer in sync with
  // selectedChildIds even when nothing was actually clicked here — e.g. the
  // single-child auto-select in Booking.tsx runs before this step is ever
  // reached, so without this the submission's answers_json would stay empty.
  useEffect(() => {
    if (!onChildSelectionChange) return;
    const currentIds = selectedChildIds || [];
    const namesText = currentIds.map(id => {
      const m = roster.find(r => r.id === id);
      return m ? (m.nickname || m.name) : '';
    }).filter(Boolean).join(', ');
    for (const f of form.fields) {
      if (isChildPickerField(f) && answers[f.field_key] !== namesText) {
        onChange(f.field_key, namesText);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildIds, roster, form.id]);

  const isFieldFilled = (f: RegFormField) => {
    // A child-picker field replaces the wizard's own mandatory child step —
    // it must always have at least one selection to proceed, regardless of
    // whatever the CRM builder's "required" toggle says for this field.
    if (isChildPickerField(f)) return (selectedChildIds || []).length > 0;
    const v = answers[f.field_key];
    if (f.type === 'checkbox') return Array.isArray(v) && v.length > 0;
    return v != null && String(v).trim() !== '';
  };
  const canProceed = currentFields.every(f => f.type === 'heading' || isChildPickerField(f) || !f.required || isFieldFilled(f))
    && currentFields.filter(isChildPickerField).every(isFieldFilled);

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
  // matches the CRM builder's own description of the two roles. The account
  // holder themselves is an adult family member too, just never a `roster`
  // row (that's the Children table) — listed first when picking an adult.
  const rosterFor = (role: string | undefined) => {
    const members = roster.filter(m =>
      role === 'adult' ? !!(m.relation && m.relation !== 'child') : (!m.relation || m.relation === 'child')
    );
    if (role === 'adult' && mainAccount) {
      return [{ id: -1, name: mainAccount.name, nickname: mainAccount.nickname, avatar: mainAccount.avatar }, ...members];
    }
    return members;
  };

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
          if (field.type === 'team_select') {
            const teamOptions: { label: string; capacity: number }[] = field.options_json ? JSON.parse(field.options_json) : [];
            const counts = teamCounts[field.field_key] || {};
            return (
              <div key={field.field_key}>
                {labelEl}
                <div className="flex flex-wrap gap-2">
                  {teamOptions.map(team => {
                    const isFull = (counts[team.label] || 0) >= team.capacity;
                    const selected = value === team.label;
                    return (
                      <button key={team.label} type="button" disabled={isFull}
                        onClick={() => onChange(field.field_key, team.label)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                          selected ? 'bg-mellow-purple text-white'
                          : isFull ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                          : 'bg-slate-100 text-slate-500'
                        }`}>
                        {team.label}{isFull ? ` (${lang === 'en' ? 'Full' : 'เต็ม'})` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }
          if (field.type === 'family_member_picker') {
            const list = rosterFor(config.role);
            const isChildPicker = isChildPickerField(field);
            const currentIds = selectedChildIds || [];

            const handlePick = (member: RosterMember) => {
              if (!isChildPicker || !onChildSelectionChange) {
                onChange(field.field_key, member.nickname || member.name);
                return;
              }
              // The effect above syncs this field's answer from
              // selectedChildIds, so just updating the selection is enough.
              const nextIds = childPickerMode === 'single'
                ? [member.id]
                : currentIds.includes(member.id) ? currentIds.filter(id => id !== member.id) : [...currentIds, member.id];
              onChildSelectionChange(nextIds);
            };

            return (
              <div key={field.field_key}>
                {labelEl}
                {list.length === 0 ? (
                  <p className="text-xs font-bold text-slate-400 mb-2">{lang === 'en' ? 'No family members found' : 'ไม่พบสมาชิกในครอบครัว'}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {list.map(member => {
                      const display = member.nickname || member.name;
                      const selected = isChildPicker ? currentIds.includes(member.id) : value === display;
                      return (
                        <button key={member.id} type="button" onClick={() => handlePick(member)}
                          className={`p-3 rounded-2xl border text-left flex items-center gap-2 transition-all ${selected ? 'bg-white border-mellow-purple ring-2 ring-mellow-purple/10' : 'bg-white border-slate-100'}`}>
                          <ChildAvatar avatarType={member.avatar} className="w-8 h-8 shrink-0" />
                          <span className="text-xs font-black text-slate-700 truncate">{display}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {onAddFamilyMember && (
                  <button type="button" onClick={onAddFamilyMember}
                    className="flex items-center gap-1.5 text-mellow-purple text-xs font-bold active:scale-95 transition-transform">
                    <div className="w-5 h-5 rounded-full bg-mellow-purple/10 flex items-center justify-center"><Plus size={12} /></div>
                    {lang === 'en' ? 'Add family member' : 'เพิ่มสมาชิกในครอบครัว'}
                  </button>
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

import React from 'react';
import { useTranslation } from '../LanguageContext';
import DateField from './DateField';
import { FAMILY_ROLE_OPTIONS, OTHER_FAMILY_ROLE, getFamilyRoleLabel } from '../utils/familyRoles';

// Shared field set for "add/edit a family member" — used by Register.tsx's
// family step, AddChildModal, and AddChild.tsx so all three stay in sync
// instead of each re-implementing (and drifting from) the same fields.
// Deliberately no English name inputs — nickname + Thai name + role is the
// full identity captured here.
export interface FamilyMemberFormValue {
  firstName: string;
  lastName: string;
  nickname: string;
  gender: string;
  dob: string;
  role: string;
  customRole: string;
}

export const emptyFamilyMemberFormValue = (role = ''): FamilyMemberFormValue => ({
  firstName: '', lastName: '', nickname: '', gender: 'male', dob: '', role, customRole: '',
});

interface FamilyMemberFieldsProps {
  value: FamilyMemberFormValue;
  onChange: (value: FamilyMemberFormValue) => void;
  errors?: Partial<Record<'firstName' | 'lastName' | 'nickname' | 'dob' | 'customRole', string>>;
  // Locks the relationship to one fixed value with no picker shown at all —
  // used when this modal was opened from a context that only makes sense
  // for one role (e.g. a registration form's child-role family_member_picker
  // should only ever be able to add a child, never an adult).
  lockRole?: string;
}

const FamilyMemberFields: React.FC<FamilyMemberFieldsProps> = ({ value, onChange, errors, lockRole }) => {
  const { t, lang } = useTranslation();
  const set = (patch: Partial<FamilyMemberFormValue>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
          {lang === 'th' ? 'คุณคือ...' : 'You are...'}
        </label>
        {lockRole ? (
          <div className="w-full px-4 py-3 bg-slate-100 border border-slate-100 rounded-xl font-bold text-sm text-slate-500">
            {getFamilyRoleLabel(lockRole, lang)}
          </div>
        ) : (
          <select
            value={value.role}
            onChange={e => set({ role: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
          >
            <option value="" disabled>{lang === 'th' ? 'เลือกความสัมพันธ์' : 'Select relationship'}</option>
            {FAMILY_ROLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{lang === 'en' ? o.labelEn : o.labelTh}</option>
            ))}
          </select>
        )}
        {!lockRole && value.role === OTHER_FAMILY_ROLE && (
          <input
            type="text"
            placeholder={t.register?.specifyRelation || 'Please specify relationship...'}
            value={value.customRole}
            onChange={e => set({ customRole: e.target.value })}
            className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
            required
          />
        )}
        {errors?.customRole && <p className="text-xs text-red-500 font-bold mt-1 px-1">{errors.customRole}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
            {t.register?.firstNameLabel || 'First Name'} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={value.firstName}
            onChange={e => set({ firstName: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
            required
          />
          {errors?.firstName && <p className="text-xs text-red-500 font-bold mt-1 px-1">{errors.firstName}</p>}
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
            {t.register?.lastNameLabel || 'Last Name'} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={value.lastName}
            onChange={e => set({ lastName: e.target.value })}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
            required
          />
          {errors?.lastName && <p className="text-xs text-red-500 font-bold mt-1 px-1">{errors.lastName}</p>}
        </div>
      </div>
      <p className="text-[11px] text-mellow-purple/70 font-bold px-1 -mt-2">
        * {t.register?.noTitlePrefix || 'No title prefix needed (e.g. Master, Miss)'}
      </p>

      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
          {t.register?.nickname || 'Nickname'} <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={value.nickname}
          onChange={e => set({ nickname: e.target.value })}
          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
        />
        {errors?.nickname && <p className="text-xs text-red-500 font-bold mt-1 px-1">{errors.nickname}</p>}
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
          {t.register?.dateOfBirth || 'Date of Birth'} <span className="text-red-500">*</span>
        </label>
        <DateField
          value={value.dob}
          onChange={(v) => set({ dob: v })}
          placeholder={t.register?.dobPlaceholder || 'DD/MM/YYYY'}
          className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
        />
        {errors?.dob && <p className="text-xs text-red-500 font-bold mt-1 px-1">{errors.dob}</p>}
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 px-1">
          {lang === 'th' ? 'เพศ' : 'Gender'}
        </label>
        <select
          value={value.gender}
          onChange={e => set({ gender: e.target.value })}
          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-mellow-purple/20"
        >
          {/* This form adds parents and grandparents too, so the words have
              to describe a person of any age — a father was being filed as
              "Boy". See migration 0105. */}
          <option value="male">{lang === 'th' ? 'ชาย' : 'Male'}</option>
          <option value="female">{lang === 'th' ? 'หญิง' : 'Female'}</option>
          <option value="unspecified">{lang === 'th' ? 'ไม่ระบุ' : 'Prefer not to say'}</option>
        </select>
      </div>
    </div>
  );
};

export default FamilyMemberFields;

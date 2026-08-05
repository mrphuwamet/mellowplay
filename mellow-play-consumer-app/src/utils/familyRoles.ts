import { User, UserRound, Baby, Users, Glasses, Armchair, Pencil, type LucideIcon } from 'lucide-react';

// Single source of truth for "who is this family member" — replaces the old,
// narrower Father/Mother/Relative/Other relationship enum. Backed by the same
// free-text `relation` column (no DB constraint), so any value here is safe
// to store without a migration.
//
// `icon` is a component reference (lucide-react, matching the rest of the
// app's icon system) — only usable in real JSX (the family-step grid
// buttons, summary rows). Native <select><option> elements can't render a
// component, so selects just show the label text with no icon.
export interface FamilyRoleOption {
  value: string;
  icon: LucideIcon;
  labelTh: string;
  labelEn: string;
}

// Family members (a person being added to the roster, e.g. a child) get the
// full list including 'child'. The account holder's own role never should
// (they're the adult filling out the form, not "the child") — see
// PARENT_ROLE_OPTIONS below.
export const FAMILY_ROLE_OPTIONS: FamilyRoleOption[] = [
  { value: 'father', icon: User, labelTh: 'พ่อ', labelEn: 'Father' },
  { value: 'mother', icon: UserRound, labelTh: 'แม่', labelEn: 'Mother' },
  { value: 'child', icon: Baby, labelTh: 'ลูก', labelEn: 'Child' },
  { value: 'aunt_uncle', icon: Users, labelTh: 'ลุง/ป้า/น้า/อา', labelEn: 'Uncle/Aunt' },
  { value: 'grandfather', icon: Glasses, labelTh: 'ปู่/ตา', labelEn: 'Grandfather' },
  { value: 'grandmother', icon: Armchair, labelTh: 'ย่า/ยาย', labelEn: 'Grandmother' },
  { value: 'other', icon: Pencil, labelTh: 'อื่นๆ', labelEn: 'Other' },
];

// The parent/account-holder's own "you are..." role picker — same list
// minus 'child', since the person filling this out is always the adult.
export const PARENT_ROLE_OPTIONS: FamilyRoleOption[] = FAMILY_ROLE_OPTIONS.filter(o => o.value !== 'child');

export const OTHER_FAMILY_ROLE = 'other';

export function getFamilyRoleLabel(value: string, lang: 'th' | 'en'): string {
  const option = FAMILY_ROLE_OPTIONS.find(o => o.value === value);
  if (!option) return value;
  return lang === 'en' ? option.labelEn : option.labelTh;
}

// Legacy records may carry an old enum value (Father/Mother/Relative/Other)
// or arbitrary free text typed into the old "Other" field. Anything that
// isn't one of today's known values normalizes to 'other', with the raw
// original text preserved so it can still be shown to the user.
export function normalizeFamilyRole(rawValue: string | null | undefined): { role: string; customText: string } {
  const value = (rawValue || '').trim();
  const lowerValue = value.toLowerCase();
  const legacyMap: Record<string, string> = {
    father: 'father',
    mother: 'mother',
  };
  if (legacyMap[lowerValue]) return { role: legacyMap[lowerValue], customText: '' };
  if (FAMILY_ROLE_OPTIONS.some(o => o.value === value)) return { role: value, customText: '' };
  return { role: OTHER_FAMILY_ROLE, customText: value };
}

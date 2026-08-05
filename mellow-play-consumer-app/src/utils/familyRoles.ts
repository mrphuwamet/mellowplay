import { User, UserRound, Baby, User2, UserSquare2, Contact, Contact2, Glasses, Armchair, CircleUser, CircleUserRound, Pencil, type LucideIcon } from 'lucide-react';

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
//
// Uncle/aunt and grandparent used to be single combined options
// ("ลุง/ป้า/น้า/อา", "ปู่/ตา", "ย่า/ยาย") — split into their own distinct
// entries since a combined slash-label doesn't say which one a person
// actually is.
export const FAMILY_ROLE_OPTIONS: FamilyRoleOption[] = [
  { value: 'father', icon: User, labelTh: 'พ่อ', labelEn: 'Father' },
  { value: 'mother', icon: UserRound, labelTh: 'แม่', labelEn: 'Mother' },
  { value: 'child', icon: Baby, labelTh: 'ลูก', labelEn: 'Child' },
  { value: 'uncle', icon: User2, labelTh: 'ลุง', labelEn: 'Uncle' },
  { value: 'aunt', icon: UserSquare2, labelTh: 'ป้า', labelEn: 'Aunt' },
  { value: 'na', icon: Contact, labelTh: 'น้า', labelEn: "Uncle/Aunt (Mom's side)" },
  { value: 'aa', icon: Contact2, labelTh: 'อา', labelEn: "Uncle/Aunt (Dad's side)" },
  { value: 'grandfather_paternal', icon: Glasses, labelTh: 'ปู่', labelEn: 'Grandfather (Paternal)' },
  { value: 'grandmother_paternal', icon: Armchair, labelTh: 'ย่า', labelEn: 'Grandmother (Paternal)' },
  { value: 'grandfather_maternal', icon: CircleUser, labelTh: 'ตา', labelEn: 'Grandfather (Maternal)' },
  { value: 'grandmother_maternal', icon: CircleUserRound, labelTh: 'ยาย', labelEn: 'Grandmother (Maternal)' },
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

// Legacy records may carry an old enum value (Father/Mother/Relative/Other),
// one of the retired combined roles (aunt_uncle/grandfather/grandmother —
// replaced by the split-out roles above, but existing DB rows still say the
// old value and there's no way to know which specific one they meant), or
// arbitrary free text typed into the old "Other" field. Anything that isn't
// one of today's known values normalizes to 'other', with a readable label
// preserved so it can still be shown to the user instead of a raw DB slug.
export function normalizeFamilyRole(rawValue: string | null | undefined): { role: string; customText: string } {
  const value = (rawValue || '').trim();
  const lowerValue = value.toLowerCase();
  const legacyMap: Record<string, string> = {
    father: 'father',
    mother: 'mother',
  };
  const retiredCombinedRoles: Record<string, string> = {
    aunt_uncle: 'ลุง/ป้า/น้า/อา',
    grandfather: 'ปู่/ตา',
    grandmother: 'ย่า/ยาย',
  };
  if (retiredCombinedRoles[value]) return { role: OTHER_FAMILY_ROLE, customText: retiredCombinedRoles[value] };
  if (legacyMap[lowerValue]) return { role: legacyMap[lowerValue], customText: '' };
  if (FAMILY_ROLE_OPTIONS.some(o => o.value === value)) return { role: value, customText: '' };
  return { role: OTHER_FAMILY_ROLE, customText: value };
}

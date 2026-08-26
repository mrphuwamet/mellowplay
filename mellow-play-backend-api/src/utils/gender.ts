/**
 * One spelling for a person's sex, whoever wrote the row.
 *
 * It used to be stored as 'Boy' / 'Girl' — which came from a form that only
 * asked about children. The same form now records every member of a family, so
 * a father in his forties was being filed as "Boy". The values are
 * 'male' / 'female' / 'unspecified', which describe a person of any age.
 *
 * Applied at every WRITE rather than at each caller. The consumer app is a PWA:
 * someone with yesterday's bundle cached keeps posting 'Boy' for days after the
 * change, and without this the column would hold both spellings — which is
 * worse than either one, because every reader then has to know both.
 */

const ALIASES: Record<string, string> = {
  boy: 'male',
  male: 'male',
  m: 'male',
  ชาย: 'male',
  girl: 'female',
  female: 'female',
  f: 'female',
  หญิง: 'female',
  'not specified': 'unspecified',
  unspecified: 'unspecified',
  other: 'other',
  อื่นๆ: 'other',
  'อื่น ๆ': 'other',
  ไม่ระบุ: 'unspecified',
};

/**
 * Anything unrecognised is passed through untouched rather than blanked: a
 * value nobody anticipated is still what someone told us, and losing it is a
 * bigger fault than storing it in an odd shape.
 */
export const normaliseGender = (value?: string | null): string | null => {
  if (value == null) return null;
  const key = String(value).trim().toLowerCase();
  if (key === '') return '';
  return ALIASES[key] ?? String(value).trim();
};

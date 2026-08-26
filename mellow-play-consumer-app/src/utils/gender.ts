/**
 * Reading a sex that may have been written in either spelling.
 *
 * Migration 0105 renamed the stored words from 'Boy'/'Girl' — which came from a
 * form that only asked about children, and filed fathers as "Boy" — to
 * 'male'/'female'/'unspecified'.
 *
 * This app is installed as a PWA, so a phone can be running yesterday's bundle
 * for days. A form that offers only the new values but is handed an old one
 * would show nothing selected, and saving would then silently change the
 * person's sex. Mapping on the way in is what prevents that.
 *
 * The server normalises on write (backend src/utils/gender.ts); this is the
 * matching read.
 */

const ALIASES: Record<string, string> = {
  boy: 'male',
  male: 'male',
  girl: 'female',
  female: 'female',
  'not specified': 'unspecified',
  unspecified: 'unspecified',
  other: 'other',
};

export const normaliseGenderValue = (value?: string | null): string => {
  if (!value) return '';
  return ALIASES[String(value).trim().toLowerCase()] ?? '';
};

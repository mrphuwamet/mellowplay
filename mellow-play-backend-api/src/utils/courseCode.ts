/**
 * The public code in a class URL — /class/baby-rider-k7m2qp9xrt.
 *
 * A class used to be addressed by its row id, which is a counter. That is fine
 * for a listed class and useless for a private one: /class/12 tells anyone that
 * /class/11 and /class/13 exist, and a private class is only private until
 * someone counts. The code is what a private class is addressed by instead, and
 * the id stops working for it (see AdminRepository.getCourseByIdForPublic).
 *
 * It is deliberately NOT a bare random string. A URL whose path is pure
 * gibberish is the shape a link shortener and a phishing kit both have, so it
 * reads as suspicious to a mail filter and, more to the point, to the parent
 * deciding whether to tap it. Leading with words from the class's own name
 * costs nothing and makes the link legible:
 *
 *   /class/xy2xl                     ← unreadable, and short enough to walk
 *   /class/baby-rider-k7m2qp9xrt     ← says what it is, and cannot be guessed
 *
 * The slug is a label, never an identifier: only the token is looked up, so two
 * classes may share a slug and renaming a class leaves its links working with
 * the old wording. That is the same bargain Medium and GitHub make, and the
 * alternative — regenerating the code on rename — silently breaks every link
 * already handed out.
 */

/**
 * No 0/o, 1/l/i. The code turns up in screenshots and gets read aloud over the
 * phone, and those pairs are where a transcription goes wrong.
 */
const TOKEN_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

/**
 * Ten characters of a 31-character alphabet is about 49 bits — 8 x 10^14
 * codes, which no one walks through. Five characters, the length that feels
 * natural to ask for, is 28 million: a script covers that in an afternoon, and
 * "unlisted" would mean nothing.
 */
const TOKEN_LENGTH = 10;

/** Longer than this and the slug crowds out the part that does the work. */
const MAX_SLUG_LENGTH = 40;

/**
 * The readable half, taken from whichever name has Latin letters in it.
 *
 * Thai is dropped rather than transliterated or percent-encoded: a path of
 * %E0%B8%84%E0%B9%88 is worse than no slug at all, on every count this is
 * trying to improve. Thai class names here almost always carry an English
 * phrase alongside ("Baby Rider จำให้ได้ ไถให้ถึง"), which is the part kept.
 */
export function slugifyCourseName(name?: string | null, nameEn?: string | null): string {
  for (const candidate of [nameEn, name]) {
    const words = String(candidate || '').match(/[A-Za-z0-9]+/g);
    if (!words || words.length === 0) continue;

    let slug = '';
    for (const word of words) {
      const next = slug ? `${slug}-${word.toLowerCase()}` : word.toLowerCase();
      if (next.length > MAX_SLUG_LENGTH) break;
      slug = next;
    }
    if (slug) return slug;
  }
  // A class named only in Thai still gets a word, so the path never opens with
  // a bare token.
  return 'class';
}

/** Random token, from the platform CSPRNG — Math.random is not unguessable. */
export function randomCourseToken(length = TOKEN_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  // Rejection-free: 256 is not a multiple of 31, so the low values are very
  // slightly favoured. At 49 bits the bias costs a fraction of a bit and buys
  // simplicity — this is an unguessable handle, not a key.
  for (let i = 0; i < length; i++) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return out;
}

/** The full code stored on the course and used in its URL. */
export function buildCourseCode(name?: string | null, nameEn?: string | null): string {
  return `${slugifyCourseName(name, nameEn)}-${randomCourseToken()}`;
}

/**
 * Whether a URL segment is a code rather than a row id.
 *
 * A bare number is an id — that is what every link shared before this existed
 * looks like, and they keep working for a listed class.
 */
export const isCourseCode = (segment: string): boolean =>
  !/^\d+$/.test(segment) && /^[a-z0-9-]{3,80}$/.test(segment);

// Hashtags, the way they work everywhere else: written inside the post, not
// managed in a separate field.
//
// Nothing was added to the database for this. A tag is whatever someone typed
// after a # in the content, which means every post already written has its tags
// today, and staff need no new form to use them. The cost is that renaming a
// tag means editing the posts — the same trade every platform that does it this
// way has made.

// \p{M} is there for Thai specifically: สระ and วรรณยุกต์ are combining marks,
// not letters, so \p{L} alone stopped #ครอบครัวทันโลก at "ครอบคร". The leading
// boundary keeps "a#b" out — a tag has to start its token.
const HASHTAG = /(^|[\s(（["'—–-])#([\p{L}\p{N}\p{M}_]{1,50})/gu;

const isOnlyDigits = (s: string) => /^[0-9_]+$/.test(s);

// #7452d6 is a colour someone pasted, not a tag about the colour 7452d6. Hex
// shape alone is not enough to reject — #abc and #fff are perfectly good tags —
// so it also has to contain a digit, which is what separates a pasted colour
// from a word.
const looksLikeHexColour = (s: string) =>
  /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(s) && /[0-9]/.test(s);

const isTag = (s: string) => !isOnlyDigits(s) && !looksLikeHexColour(s);

/** Every tag in a piece of text, lowercased and de-duplicated, in order. */
export const extractHashtags = (text?: string | null): string[] => {
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(HASHTAG)) {
    const tag = m[2];
    if (!isTag(tag)) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
};

/** Does this post carry that tag? Compared case-insensitively, as on Twitter. */
export const hasHashtag = (text: string | null | undefined, tag: string): boolean => {
  const wanted = tag.replace(/^#/, '').toLowerCase();
  return extractHashtags(text).some(t => t.toLowerCase() === wanted);
};

export interface TextSegment { text: string; tag?: string }

/**
 * Split text into plain runs and tag runs, so a caller can render the tags as
 * links without putting user-authored HTML through dangerouslySetInnerHTML.
 */
export const splitHashtags = (text?: string | null): TextSegment[] => {
  if (!text) return [];
  const segments: TextSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(HASHTAG)) {
    const tag = m[2];
    if (!isTag(tag)) continue;
    // m[1] is the boundary character, which belongs to the plain run before it.
    const tagStart = (m.index ?? 0) + m[1].length;
    if (tagStart > last) segments.push({ text: text.slice(last, tagStart) });
    segments.push({ text: `#${tag}`, tag });
    last = tagStart + tag.length + 1;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
};

/**
 * The tags used most across a set of posts, for the chip row.
 *
 * Counted rather than listed alphabetically: a row of chips is a shortcut to
 * what is actually being posted about, and an alphabetical list of every tag
 * ever used is a glossary instead.
 */
export const topHashtags = (
  texts: (string | null | undefined)[],
  limit = 12
): { tag: string; count: number }[] => {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const text of texts) {
    for (const tag of extractHashtags(text)) {
      const key = tag.toLowerCase();
      const hit = counts.get(key);
      if (hit) hit.count += 1;
      // The first spelling seen wins the display, so a tag typed two ways is
      // counted once and shown as whoever used it first wrote it.
      else counts.set(key, { tag, count: 1 });
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
};

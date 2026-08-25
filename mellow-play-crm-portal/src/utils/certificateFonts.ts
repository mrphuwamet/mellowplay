/**
 * Which typefaces a certificate may be set in, and getting them to actually
 * arrive.
 *
 * Mirrored in mellow-play-consumer-app/src/utils/certificateFonts.ts — the same
 * certificate is drawn in three places (this designer, the machine that prints
 * it, and a parent's phone), and a font that only exists in one of them
 * silently falls back to something else in the other two. Change both together.
 *
 * Hence two lists, and the difference between them matters:
 *
 *  - GOOGLE fonts are fetched, so they look identical everywhere. This is the
 *    safe choice and the one the designer offers first.
 *  - SYSTEM fonts are whatever is installed on the machine doing the drawing.
 *    TH Sarabun New is the government-document standard and is on nearly every
 *    Thai office computer — but "nearly every" is doing real work in that
 *    sentence, and a parent's iPhone is not one of them.
 *
 * Every choice is stored as a full CSS stack rather than a bare name, so a
 * missing font lands on something deliberate instead of on Times New Roman.
 */

export interface FontChoice {
  /** The family name, as CSS and Google Fonts both spell it. */
  name: string;
  label: string;
  source: 'google' | 'system';
}

/** Free Google fonts that actually carry Thai glyphs. */
export const GOOGLE_FONTS: FontChoice[] = [
  { name: 'Sarabun', label: 'Sarabun — สารบรรณ อ่านง่าย', source: 'google' },
  { name: 'Noto Sans Thai', label: 'Noto Sans Thai — เรียบ ครบทุกน้ำหนัก', source: 'google' },
  { name: 'Noto Serif Thai', label: 'Noto Serif Thai — มีหัว ทางการ', source: 'google' },
  { name: 'Prompt', label: 'Prompt — โมเดิร์น', source: 'google' },
  { name: 'Kanit', label: 'Kanit — หนา เด่น', source: 'google' },
  { name: 'Mitr', label: 'Mitr — กลม เป็นมิตร', source: 'google' },
  { name: 'Athiti', label: 'Athiti — บาง สะอาด', source: 'google' },
  { name: 'Krub', label: 'Krub — อ่านสบาย', source: 'google' },
  { name: 'Niramit', label: 'Niramit — ทางการ อ่านง่าย', source: 'google' },
  { name: 'Trirong', label: 'Trirong — มีหัว คลาสสิก', source: 'google' },
  { name: 'Taviraj', label: 'Taviraj — มีหัว หรูหรา', source: 'google' },
  { name: 'Charmonman', label: 'Charmonman — ลายมือ', source: 'google' },
  { name: 'Mali', label: 'Mali — ลายมือ เด็ก', source: 'google' },
  { name: 'Sriracha', label: 'Sriracha — ลายมือ สนุก', source: 'google' },
  { name: 'Chakra Petch', label: 'Chakra Petch — เหลี่ยม กีฬา', source: 'google' },
  { name: 'IBM Plex Sans Thai', label: 'IBM Plex Sans Thai', source: 'google' },
];

/** Commonly installed on Thai machines. Not guaranteed anywhere. */
export const SYSTEM_FONTS: FontChoice[] = [
  { name: 'TH Sarabun New', label: 'TH Sarabun New — มาตรฐานราชการ', source: 'system' },
  { name: 'TH SarabunPSK', label: 'TH SarabunPSK', source: 'system' },
  { name: 'Leelawadee UI', label: 'Leelawadee UI — มากับ Windows', source: 'system' },
  { name: 'Angsana New', label: 'Angsana New', source: 'system' },
  { name: 'Cordia New', label: 'Cordia New', source: 'system' },
  { name: 'Tahoma', label: 'Tahoma — มีทุกเครื่อง', source: 'system' },
];

/** What a certificate uses when nobody chose. */
export const DEFAULT_FONT = 'Sarabun';

const FALLBACK = `'Sarabun', 'Leelawadee UI', Tahoma, sans-serif`;

/** A full stack, so a missing font lands somewhere chosen. */
export const fontStack = (name?: string | null): string => {
  const n = String(name || '').trim();
  if (!n) return FALLBACK;
  return `'${n.replace(/'/g, '')}', ${FALLBACK}`;
};

export const isGoogleFont = (name?: string | null): boolean =>
  GOOGLE_FONTS.some(f => f.name === String(name || '').trim());

const loaded = new Set<string>();

/**
 * Put a Google font on the page, once.
 *
 * Called by every surface that draws a certificate rather than listed in one
 * index.html: which fonts are needed is a property of the template being drawn,
 * and templates are edited without a deploy.
 */
export const ensureFontLoaded = (name?: string | null): void => {
  const n = String(name || '').trim();
  if (!n || loaded.has(n) || !isGoogleFont(n)) return;
  loaded.add(n);
  if (typeof document === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  // The weights a certificate actually uses — the designer offers normal,
  // semibold and bold, and asking for the whole family would fetch a lot of
  // files nobody prints.
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(n).replace(/%20/g, '+')}:wght@400;600;700&display=swap`;
  document.head.appendChild(link);
};

/**
 * The fonts installed on THIS machine, when the browser will say.
 *
 * Chrome's Local Font Access API, behind a permission prompt. Returns an empty
 * list everywhere else, which is the honest answer — the curated list above is
 * what the picker falls back to.
 */
export const queryMachineFonts = async (): Promise<FontChoice[]> => {
  const q = (window as any).queryLocalFonts;
  if (typeof q !== 'function') return [];
  try {
    const fonts = await q.call(window);
    const names = new Set<string>();
    for (const f of fonts) {
      const family = String(f.family || '').trim();
      if (family) names.add(family);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'th'))
      .map(name => ({ name, label: name, source: 'system' as const }));
  } catch {
    // Denied, or not a secure context. The curated list still works.
    return [];
  }
};

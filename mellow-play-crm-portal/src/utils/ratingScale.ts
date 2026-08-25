/**
 * Rating-scale statistics for evaluation forms.
 *
 * Lifted out of FormResponseDashboard so the arithmetic can be tested on its
 * own. It was a mixed-scale form that made that worth doing: a mean pooled
 * across a 1–5 and a 1–4 item, read against the 1–5 bands, is wrong in a way
 * that looks entirely plausible on screen — the number is in range, the band
 * is a real band, and nothing about the page suggests a problem.
 *
 * "How many people picked each option" is not what an evaluation form is read
 * for. Its output is a mean per item, a standard deviation, and the band the
 * mean falls in — the three columns of the report table these forms end up in.
 */

/** Structurally what this module needs off a form field. */
export interface RatingField {
  field_key: string;
  type: string;
  label: string;
  options_json?: string | null;
  config_json?: string | null;
}

const fieldConfig = (f: RatingField): any => {
  try { return f.config_json ? JSON.parse(f.config_json) : {}; } catch { return {}; }
};

/**
 * Options paired with their answer-key points. Available in the CRM and not in
 * the consumer app: the CRM endpoint returns the form unsanitised, while the
 * public one strips points so a blank form never carries its own answer key.
 */
export const parseScoredOptions = (f: RatingField): { label: string; points: number }[] => {
  try {
    const parsed = f.options_json ? JSON.parse(f.options_json) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((o: any) => ({ label: String(o?.label ?? o), points: Number(o?.points) }))
      .filter(o => !isNaN(o.points));
  } catch {
    return [];
  }
};

/**
 * A question worth averaging. `checkbox` is excluded on purpose: several picks
 * at once have no single value to take a mean of, and summing their points
 * would silently reward whoever ticked the most boxes.
 */
export const isRatingField = (f: RatingField): boolean => {
  if (f.type !== 'radio' && f.type !== 'select') return false;
  const cfg = fieldConfig(f);
  if (cfg.display !== 'scale' && !cfg.scored) return false;
  const opts = parseScoredOptions(f);
  return opts.length >= 2 && opts.some(o => o.points !== 0);
};

// The five bands every Thai evaluation report interprets a mean against. They
// are defined for a 1–5 instrument, so they are only ever applied to one: a 1–4
// or 1–7 scale gets its mean and S.D. with no band rather than the wrong band.
export const LIKERT_BANDS: { min: number; label: string }[] = [
  { min: 4.51, label: 'มากที่สุด' },
  { min: 3.51, label: 'มาก' },
  { min: 2.51, label: 'ปานกลาง' },
  { min: 1.51, label: 'น้อย' },
  { min: -Infinity, label: 'น้อยที่สุด' },
];

export const bandFor = (mean: number, lowest: number, highest: number): string | null =>
  lowest === 1 && highest === 5 ? (LIKERT_BANDS.find(b => mean >= b.min)?.label ?? null) : null;

/**
 * The scale one item is measured on — its own lowest and highest option, not
 * the form's.
 *
 * A form is free to mix them: 1–5 for satisfaction and 1–4 for frequency is an
 * ordinary pairing on a Thai evaluation. Every figure that averages across
 * items has to know which scale each one came from, or it silently produces a
 * number that belongs to no scale at all.
 */
export const scaleOf = (f: RatingField): { min: number; max: number } | null => {
  const points = parseScoredOptions(f).map(o => o.points);
  if (points.length === 0) return null;
  return { min: Math.min(...points), max: Math.max(...points) };
};

export const scaleLabel = (sc: { min: number; max: number }) => `${sc.min}–${sc.max}`;

export interface RatingStats {
  n: number;
  mean: number;
  /** Sample S.D. (n−1) — what a report quotes. null when one answer means no spread. */
  sd: number | null;
  band: string | null;
}

export const ratingStats = (f: RatingField, answered: any[]): RatingStats | null => {
  const byLabel = new Map(parseScoredOptions(f).map(o => [o.label, o.points]));
  // Answers whose option was renamed after they came in have no points to
  // average and drop out — which is why n is reported per question, not once.
  const nums = answered
    .map(v => byLabel.get(String(v)))
    .filter((n): n is number => typeof n === 'number');
  if (nums.length === 0) return null;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const sd = nums.length > 1
    ? Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1))
    : null;
  const points = Array.from(byLabel.values());
  return { n: nums.length, mean, sd, band: bandFor(mean, Math.min(...points), Math.max(...points)) };
};

export interface RatingRow<F extends RatingField = RatingField> {
  field: F;
  scale: { min: number; max: number };
  stats: RatingStats;
}

export interface RatingScaleGroup {
  /** "1–5" — also the label shown on the tile. */
  key: string;
  min: number;
  max: number;
  /** How many items are on this scale. */
  count: number;
  mean: number;
  band: string | null;
}

export interface RatingSummary<F extends RatingField = RatingField> {
  rows: RatingRow<F>[];
  groups: RatingScaleGroup[];
  /** 0–100, where each item sits on its own scale. null if no item has range. */
  index: number | null;
  mixed: boolean;
}

/**
 * Every rating item's mean, and the closing figure — grouped by scale.
 *
 * Item means are averaged unweighted: each question counts once, however many
 * people happened to answer it, which is what "ค่าเฉลี่ยรวม" means on these
 * forms.
 *
 * But only within one scale. A form mixing 1–5 and 1–4 used to get a single
 * pooled average with the 1–5 bands applied to it, because the pooled min and
 * max still came out 1 and 5. Both halves of that were wrong: a perfect 1–4
 * item scores 4.0, so it drags a perfect form down to about 4.6 and reports
 * "มาก" for a form on which nobody chose anything but the top answer. So: one
 * figure per scale, and a normalised index as the single number when there is
 * more than one.
 */
export function summariseRatings<F extends RatingField>(
  questions: F[],
  answersFor: (f: F) => any[],
): RatingSummary<F> | null {
  const rows = questions
    .filter(isRatingField)
    .map(f => ({ field: f, scale: scaleOf(f), stats: ratingStats(f, answersFor(f)) }))
    .filter((r): r is RatingRow<F> => r.stats !== null && r.scale !== null);
  if (rows.length === 0) return null;

  const byScale = new Map<string, RatingRow<F>[]>();
  for (const r of rows) {
    const key = scaleLabel(r.scale);
    byScale.set(key, [...(byScale.get(key) || []), r]);
  }
  const groups: RatingScaleGroup[] = Array.from(byScale.entries())
    .map(([key, gr]) => {
      const mean = gr.reduce((a, r) => a + r.stats.mean, 0) / gr.length;
      return {
        key, min: gr[0].scale.min, max: gr[0].scale.max, count: gr.length, mean,
        band: bandFor(mean, gr[0].scale.min, gr[0].scale.max),
      };
    })
    // Biggest group first: on a mixed form the dominant scale is the one the
    // report is actually about, and it should be the tile read first.
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  // Where each item sits on its own scale, 0–100. The one figure that stays
  // comparable when the scales differ — and the only honest headline for a
  // mixed form.
  const usable = rows.filter(r => r.scale.max > r.scale.min);
  const index = usable.length > 0
    ? (usable.reduce((a, r) => a + (r.stats.mean - r.scale.min) / (r.scale.max - r.scale.min), 0) / usable.length) * 100
    : null;

  return { rows, groups, index, mixed: groups.length > 1 };
}

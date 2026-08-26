/**
 * Turning a stored certificate layout into positioned boxes.
 *
 * Mirrored in mellow-play-consumer-app/src/utils/certificateLayout.ts, which
 * renders the page a family actually opens. The two must agree exactly or a
 * certificate looks one way in the designer and another when it prints —
 * change both together.
 *
 * Positions are percentages of the page, so one layout is correct at any paper
 * size and at any size on screen. Font sizes are points, because that is what
 * anyone laying out a printed page thinks in.
 */

export type FieldType = 'text' | 'field' | 'qr' | 'image';

/** Answers from the registration form are namespaced so they can never collide
 *  with a built-in variable added later. */
export const FORM_PREFIX = 'form:';

/**
 * The variables every certificate can print, whatever form the booking used.
 * A template may also reference `form:<field_key>` for any answer on the
 * booking's registration form — those are offered by the designer from the
 * form's own field list rather than hard-coded here.
 */
export const CERT_VARIABLES: { key: string; label: string; sample: string }[] = [
  { key: 'recipient_name', label: 'ชื่อผู้รับ (ชื่อเล่นถ้ามี)', sample: 'น้องกระถิน' },
  { key: 'child_full_name', label: 'ชื่อ-สกุลเด็ก', sample: 'เด็กหญิงกระถิน ใจดี' },
  { key: 'child_nickname', label: 'ชื่อเล่น', sample: 'กระถิน' },
  { key: 'child_gender', label: 'เพศ', sample: 'female' },
  { key: 'child_birth_date', label: 'วันเกิด', sample: '2018-04-12' },
  { key: 'parent_name', label: 'ชื่อผู้ปกครอง', sample: 'สมหญิง ใจดี' },
  { key: 'course_name', label: 'ชื่อกิจกรรม', sample: 'ครอบครัวทันโลก Family Fact or Fake' },
  { key: 'course_location', label: 'สถานที่', sample: 'Mellow Play สาขาราชพฤกษ์' },
  { key: 'event_date', label: 'วันที่จัดกิจกรรม', sample: '2026-09-06' },
  { key: 'serial', label: 'เลขที่เกียรติบัตร', sample: 'MP-2569-0001' },
  { key: 'public_code', label: 'รหัสตรวจสอบ', sample: 'K7M2QX9BTR' },
  { key: 'booking_id', label: 'หมายเลขการจอง', sample: '10482' },
  { key: 'issued_date', label: 'วันที่ออกเกียรติบัตร', sample: '2026-09-08' },
];

/** Variables printed as a Thai long date rather than the raw ISO value. */
const DATE_VARIABLES = new Set(['event_date', 'issued_date', 'child_birth_date']);

// ── Conditional text ───────────────────────────────────────────────────────

export type RuleOp = 'eq' | 'ne' | 'contains' | 'in' | 'empty' | 'not_empty';

export interface RuleCondition {
  /** Which variable to test — any key, not only the one the field prints. */
  variable: string;
  op: RuleOp;
  /** Ignored by `empty` / `not_empty`. `in` takes a comma-separated list. */
  value?: string;
}

export interface CertRule {
  /** Absent = the default line, which is why order matters. */
  when?: RuleCondition | null;
  /** Output template. `{{variable}}` is replaced with that variable's value. */
  text: string;
}

export const RULE_OPS: { op: RuleOp; label: string; needsValue: boolean }[] = [
  { op: 'eq', label: 'เท่ากับ', needsValue: true },
  { op: 'ne', label: 'ไม่เท่ากับ', needsValue: true },
  { op: 'contains', label: 'มีคำว่า', needsValue: true },
  { op: 'in', label: 'เป็นหนึ่งใน (คั่นด้วย ,)', needsValue: true },
  { op: 'empty', label: 'ไม่ได้กรอก', needsValue: false },
  { op: 'not_empty', label: 'กรอกแล้ว', needsValue: false },
];

const norm = (s: string) => String(s ?? '').trim().toLowerCase();

const conditionHolds = (cond: RuleCondition, values: CertValueMap): boolean => {
  const actual = norm(String(values[cond.variable] ?? ''));
  const expected = norm(cond.value ?? '');
  switch (cond.op) {
    case 'eq': return actual === expected;
    case 'ne': return actual !== expected;
    case 'contains': return expected !== '' && actual.includes(expected);
    case 'in': return expected.split(',').map(norm).filter(Boolean).includes(actual);
    case 'empty': return actual === '';
    case 'not_empty': return actual !== '';
    default: return false;
  }
};

const INTERPOLATE = /\{\{\s*([^}]+?)\s*\}\}/g;

/** `{{variable}}` → its value. An unknown name becomes empty, not the literal. */
export const interpolate = (template: string, values: CertValueMap, useSamples = false): string =>
  String(template ?? '').replace(INTERPOLATE, (_m, name: string) =>
    displayValue(String(name).trim(), values, useSamples));

/**
 * The first rule whose condition holds wins; a rule with no condition is the
 * default and ends the list. Top-to-bottom, first match — the order people
 * already expect from every rule list they have used.
 */
export const applyRules = (
  rules: CertRule[] | undefined | null,
  values: CertValueMap,
  fallback: string,
  useSamples = false,
): string => {
  if (!Array.isArray(rules) || rules.length === 0) return fallback;
  for (const rule of rules) {
    if (!rule) continue;
    if (!rule.when || conditionHolds(rule.when, values)) {
      return interpolate(rule.text || '', values, useSamples);
    }
  }
  // Every rule had a condition and none held: print the plain value rather
  // than nothing, so a half-finished rule list never blanks a name.
  return fallback;
};

// ── Fields ─────────────────────────────────────────────────────────────────

export type CertValueMap = Record<string, string | null | undefined>;

export interface CertField {
  id: string;
  type: FieldType;
  /** Static text, a variable key, or an image URL depending on type. */
  value: string;
  /** All four are percentages of the page. */
  x: number;
  y: number;
  w: number;
  h?: number;
  fontSize?: number;      // points
  fontWeight?: number;
  color?: string;
  align?: 'left' | 'center' | 'right';
  fontFamily?: string;
  /** Conditional text. Empty or absent = print the variable as it is. */
  rules?: CertRule[];
  /**
   * Designer-only. A locked box cannot be dragged or picked up by a stray
   * click — for the background frame and the fixed wording, which are the two
   * things that get nudged while arranging everything else.
   */
  locked?: boolean;
  /**
   * Hidden EVERYWHERE, not only in the designer: a box switched off is left
   * out of the printed sheet and the family-facing page as well, because
   * hiding it in one place and printing it in another is the worst of both.
   */
  hidden?: boolean;
}

export interface CertTemplate {
  background_url?: string | null;
  page_width: number;   // mm
  page_height: number;  // mm
  fields_json: string;
}

export const parseFields = (fieldsJson?: string | null): CertField[] => {
  try {
    const parsed = JSON.parse(fieldsJson || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A malformed layout renders as a blank page rather than throwing — the
    // background and the paper size are still worth showing while it is fixed.
    return [];
  }
};

/**
 * Points to pixels, for a page of `pageWidthMm` drawn `renderedWidthPx` wide.
 *
 * 25.4/72 is a point in millimetres; the rest is how many pixels a millimetre
 * is at whatever size the page is being drawn. One formula, so the designer and
 * the printed page cannot drift apart.
 */
export const ptToPx = (pt: number, pageWidthMm: number, renderedWidthPx: number): number =>
  (pt * 25.4 / 72) * (renderedWidthPx / pageWidthMm);

/** One variable as it should read on the page — dates in Thai, the rest raw. */
export const displayValue = (key: string, values: CertValueMap, useSamples = false): string => {
  const raw = values[key];
  const text = raw == null ? '' : String(raw);
  if (text === '' && useSamples) {
    const sample = CERT_VARIABLES.find(v => v.key === key)?.sample;
    if (sample) return DATE_VARIABLES.has(key) ? formatCertDate(sample) : sample;
    return key.startsWith(FORM_PREFIX) ? '(คำตอบจากฟอร์ม)' : '';
  }
  return DATE_VARIABLES.has(key) ? formatCertDate(text) : text;
};

/** What a field prints, given an issued certificate's own frozen values. */
export const fieldText = (
  field: CertField,
  values: CertValueMap,
  useSamples = false
): string => {
  if (field.type !== 'field') {
    // Static text interpolates too, so a line like "ขอมอบให้ {{recipient_name}}"
    // can be one box instead of three that have to be kept aligned by hand.
    return interpolate(field.value || '', values, useSamples);
  }
  const plain = displayValue(field.value, values, useSamples);
  return applyRules(field.rules, values, plain, useSamples);
};

/** Thai long date, which is how a certificate reads. Falls back to the raw string. */
export const formatCertDate = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return String(iso);
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
};

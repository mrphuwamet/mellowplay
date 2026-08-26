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
  // Worked out at issue time from the name, the sex and the age on the day —
  // see certificateVariables on the server. A Thai name gets เด็กชาย/เด็กหญิง
  // (นาย/นางสาว from fifteen); an English one is left bare, because that is
  // how a Thai certificate writes a Latin name.
  { key: 'recipient_titled_name', label: 'คำนำหน้า + ชื่อ (คิดให้อัตโนมัติ)', sample: 'เด็กหญิงกระถิน ใจดี' },
  { key: 'child_title', label: 'คำนำหน้าอย่างเดียว', sample: 'เด็กหญิง' },
  { key: 'child_full_name', label: 'ชื่อ-สกุลเด็ก', sample: 'เด็กหญิงกระถิน ใจดี' },
  { key: 'child_nickname', label: 'ชื่อเล่น', sample: 'กระถิน' },
  { key: 'child_gender', label: 'เพศ', sample: 'male' },
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

/** Variables printed as a date rather than the raw ISO value. */
const DATE_VARIABLES = new Set(['event_date', 'issued_date', 'child_birth_date']);

// ── Dates ──────────────────────────────────────────────────────────────────

export type DateLang = 'th' | 'en';

/**
 * How a date is written on the page.
 *
 * A certificate is a formal document and the house style differs by
 * organisation, so this is a choice rather than a constant. The tokens are the
 * ones every spreadsheet uses, because that is the notation whoever is laying
 * the page out already knows.
 *
 *   d / dd      day, bare or padded
 *   M / MM      month number
 *   MMM / MMMM  month name, short or full
 *   yy / yyyy   year in the era that goes with the language — พ.ศ. for Thai,
 *               C.E. for English, which is what each is written in
 *   yyyyc       year in C.E. whatever the language, for a Thai page that wants
 *               the Christian era
 *   EEE / EEEE  weekday, short or full
 */
export const DEFAULT_DATE_FORMAT = 'd MMMM yyyy';

const MONTHS: Record<DateLang, { full: string[]; short: string[] }> = {
  th: {
    full: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
    short: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
  },
  en: {
    full: ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'],
    short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
};

const WEEKDAYS: Record<DateLang, { full: string[]; short: string[] }> = {
  th: {
    full: ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'],
    short: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'],
  },
  en: {
    full: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    short: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
};

/** Longest token first, so MMMM is never matched as MMM followed by M. */
const DATE_TOKENS = /yyyyc|yyyy|yy|MMMM|MMM|MM|M|dd|d|EEEE|EEE/g;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * One date, written the way this field asks for it.
 *
 * Falls back to the raw string when the value is not a date at all — a form
 * answer that was supposed to be one and is not should print what the family
 * actually typed, not "Invalid Date".
 */
export const formatCertDate = (
  iso?: string | null,
  pattern: string = DEFAULT_DATE_FORMAT,
  lang: DateLang = 'th',
): string => {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return String(iso);

  const months = MONTHS[lang] || MONTHS.th;
  const weekdays = WEEKDAYS[lang] || WEEKDAYS.th;
  const ce = d.getFullYear();
  // Thai pages are written in the Buddhist era; English ones are not.
  const eraYear = lang === 'th' ? ce + 543 : ce;

  return String(pattern || DEFAULT_DATE_FORMAT).replace(DATE_TOKENS, token => {
    switch (token) {
      case 'yyyyc': return String(ce);
      case 'yyyy': return String(eraYear);
      case 'yy': return String(eraYear).slice(-2);
      case 'MMMM': return months.full[d.getMonth()];
      case 'MMM': return months.short[d.getMonth()];
      case 'MM': return pad(d.getMonth() + 1);
      case 'M': return String(d.getMonth() + 1);
      case 'dd': return pad(d.getDate());
      case 'd': return String(d.getDate());
      case 'EEEE': return weekdays.full[d.getDay()];
      case 'EEE': return weekdays.short[d.getDay()];
      default: return token;
    }
  });
};

/** The formats offered in the designer, previewed against the real value. */
export const DATE_FORMATS: { pattern: string; label: string }[] = [
  { pattern: 'd MMMM yyyy', label: 'วันที่ เดือนเต็ม ปี' },
  { pattern: 'd MMM yyyy', label: 'วันที่ เดือนย่อ ปี' },
  { pattern: 'EEEEที่ d MMMM yyyy', label: 'วันในสัปดาห์ + วันที่เต็ม' },
  { pattern: 'dd/MM/yyyy', label: 'dd/MM/yyyy' },
  { pattern: 'dd-MM-yyyy', label: 'dd-MM-yyyy' },
  { pattern: 'yyyy-MM-dd', label: 'yyyy-MM-dd' },
  { pattern: 'd MMMM yyyyc', label: 'วันที่ เดือนเต็ม ปี ค.ศ.' },
  { pattern: 'MMMM d, yyyyc', label: 'September 6, 2026' },
];

/** Which built-in variables print as a date — for showing the format controls. */
export const isDateVariable = (key: string): boolean => DATE_VARIABLES.has(key);

// ── Conditional text ───────────────────────────────────────────────────────

export type RuleOp =
  | 'eq' | 'ne' | 'contains' | 'in' | 'empty' | 'not_empty'
  | 'is_thai' | 'is_english';

export interface RuleCondition {
  /** Which variable to test — any key, not only the one the field prints. */
  variable: string;
  op: RuleOp;
  /** Ignored by `empty` / `not_empty`. `in` takes a comma-separated list. */
  value?: string;
}

export interface CertRule {
  /**
   * Absent = the default line, which is why order matters.
   *
   * An ARRAY means every condition in it must hold — "ถ้าเป็นผู้ชาย และ ชื่อ
   * เป็นภาษาอังกฤษ". A single object is the older one-condition shape and is
   * still read, so nothing already saved has to be migrated.
   */
  when?: RuleCondition | RuleCondition[] | null;
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
  // Families register in whichever script they think of themselves in, so the
  // same form holds "สมชาย" and "Somchai" — and the right honorific depends on
  // which one this is.
  { op: 'is_thai', label: 'เป็นภาษาไทย', needsValue: false },
  { op: 'is_english', label: 'เป็นภาษาอังกฤษ', needsValue: false },
];

const THAI_LETTERS = /[\u0E00-\u0E7F]/;
const LATIN_LETTERS = /[A-Za-z]/;

const norm = (s: string) => String(s ?? '').trim().toLowerCase();

const conditionHolds = (cond: RuleCondition, values: CertValueMap): boolean => {
  const rawValue = String(values[cond.variable] ?? '');
  const actual = norm(rawValue);
  const expected = norm(cond.value ?? '');
  switch (cond.op) {
    // Thai wins a mixed value on purpose: "สมชาย Smith" on a Thai certificate
    // is a Thai name with a surname attached, and treating it as English would
    // put an English honorific in front of Thai script.
    case 'is_thai': return THAI_LETTERS.test(rawValue);
    case 'is_english': return LATIN_LETTERS.test(rawValue) && !THAI_LETTERS.test(rawValue);
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
export const interpolate = (
  template: string,
  values: CertValueMap,
  useSamples = false,
  opts?: DateOptions,
): string =>
  String(template ?? '').replace(INTERPOLATE, (_m, name: string) =>
    displayValue(String(name).trim(), values, useSamples, opts));

/**
 * The first rule whose condition holds wins; a rule with no condition is the
 * default and ends the list. Top-to-bottom, first match — the order people
 * already expect from every rule list they have used.
 */
/** Every condition has to hold. An empty list is no condition at all. */
const ruleHolds = (rule: CertRule, values: CertValueMap): boolean => {
  if (!rule.when) return true;
  const list = Array.isArray(rule.when) ? rule.when : [rule.when];
  if (list.length === 0) return true;
  return list.every(cond => cond && conditionHolds(cond, values));
};

export const applyRules = (
  rules: CertRule[] | undefined | null,
  values: CertValueMap,
  fallback: string,
  useSamples = false,
  opts?: DateOptions,
): string => {
  if (!Array.isArray(rules) || rules.length === 0) return fallback;
  for (const rule of rules) {
    if (!rule) continue;
    if (ruleHolds(rule, values)) {
      return interpolate(rule.text || '', values, useSamples, opts);
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
  /**
   * Shrink the text until it fits the box width, never growing it.
   *
   * A certificate is laid out around one name and printed for hundreds: the
   * size that suits "มานะ" leaves "ณัฐฐาพัชร์ วรรณศิริกุล" hanging off the
   * page. Off by default, because a box that silently changes size is not what
   * someone expects until they ask for it.
   */
  autoFit?: boolean;
  /** Spreadsheet-style pattern for any date this box prints. */
  dateFormat?: string;
  /** Which language the month and weekday names are written in. */
  dateLang?: DateLang;
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

/** How the field printing this value wants its dates written. */
export interface DateOptions {
  dateFormat?: string;
  dateLang?: DateLang;
}

/** One variable as it should read on the page — dates formatted, the rest raw. */
export const displayValue = (
  key: string,
  values: CertValueMap,
  useSamples = false,
  opts?: DateOptions,
): string => {
  const asDate = (v: string) => formatCertDate(v, opts?.dateFormat, opts?.dateLang);
  const raw = values[key];
  const text = raw == null ? '' : String(raw);
  if (text === '' && useSamples) {
    const sample = CERT_VARIABLES.find(v => v.key === key)?.sample;
    if (sample) return DATE_VARIABLES.has(key) ? asDate(sample) : sample;
    return key.startsWith(FORM_PREFIX) ? '(คำตอบจากฟอร์ม)' : '';
  }
  return DATE_VARIABLES.has(key) ? asDate(text) : text;
};

/** What a field prints, given an issued certificate's own frozen values. */
export const fieldText = (
  field: CertField,
  values: CertValueMap,
  useSamples = false
): string => {
  // The box carries its own date style, so a certificate can print the event
  // date long-form in Thai and the issue date as a short number, which is
  // exactly what a formal page tends to want.
  const opts: DateOptions = { dateFormat: field.dateFormat, dateLang: field.dateLang };
  if (field.type !== 'field') {
    // Static text interpolates too, so a line like "ขอมอบให้ {{recipient_name}}"
    // can be one box instead of three that have to be kept aligned by hand.
    return interpolate(field.value || '', values, useSamples, opts);
  }
  const plain = displayValue(field.value, values, useSamples, opts);
  return applyRules(field.rules, values, plain, useSamples, opts);
};



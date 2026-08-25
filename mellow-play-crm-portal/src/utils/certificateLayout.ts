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

/** The variables a certificate can print. Values come from the issued row. */
export const CERT_VARIABLES: { key: string; label: string; sample: string }[] = [
  { key: 'recipient_name', label: 'ชื่อผู้รับ', sample: 'น้องกระถิน' },
  { key: 'course_name', label: 'ชื่อกิจกรรม', sample: 'ครอบครัวทันโลก Family Fact or Fake' },
  { key: 'event_date', label: 'วันที่จัดกิจกรรม', sample: '6 กันยายน 2569' },
  { key: 'serial', label: 'เลขที่เกียรติบัตร', sample: 'MP-2569-0001' },
];

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

/** What a field prints, given an issued certificate's own frozen values. */
export const fieldText = (
  field: CertField,
  data: Record<string, string | null | undefined>,
  useSamples = false
): string => {
  if (field.type !== 'field') return field.value || '';
  const value = data[field.value];
  if (value) return String(value);
  if (!useSamples) return '';
  return CERT_VARIABLES.find(v => v.key === field.value)?.sample ?? '';
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

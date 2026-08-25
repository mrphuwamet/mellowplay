/**
 * Everything a certificate can print, resolved for one booking.
 *
 * Two callers, one function: the issuer freezes this map onto the certificate
 * row, and the designer's preview asks for it live so what staff arrange on
 * screen is the same data the real page will carry. A second implementation for
 * the preview would drift, and the drift would only ever be discovered on a
 * printed certificate.
 *
 * RAW values only. Conditional text ("เพศ = ชาย → เด็กชาย…") belongs to the
 * template and is applied at render time — see certificateLayout in both front
 * ends.
 */

export type CertValues = Record<string, string>;

/** Built-in variables, in the order the designer lists them. */
export const BUILT_IN_VARIABLES: { key: string; label: string }[] = [
  { key: 'recipient_name', label: 'ชื่อผู้รับ (ชื่อเล่นถ้ามี)' },
  { key: 'child_full_name', label: 'ชื่อ-สกุลเด็ก' },
  { key: 'child_nickname', label: 'ชื่อเล่น' },
  { key: 'child_gender', label: 'เพศ' },
  { key: 'child_birth_date', label: 'วันเกิด' },
  { key: 'parent_name', label: 'ชื่อผู้ปกครอง' },
  { key: 'course_name', label: 'ชื่อกิจกรรม' },
  { key: 'course_location', label: 'สถานที่' },
  { key: 'event_date', label: 'วันที่จัดกิจกรรม' },
  { key: 'serial', label: 'เลขที่เกียรติบัตร' },
  { key: 'public_code', label: 'รหัสตรวจสอบ' },
  { key: 'booking_id', label: 'หมายเลขการจอง' },
  { key: 'issued_date', label: 'วันที่ออกเกียรติบัตร' },
];

/** Answers from the registration form are namespaced, so they can never
 *  collide with a built-in that gets added later. */
export const FORM_PREFIX = 'form:';

const str = (v: any): string => (v == null ? '' : String(v));

/**
 * Flattens one answer to the text a certificate would print.
 *
 * A checkbox answer is an array and an "อื่น ๆ" answer is an object with the
 * typed-in text beside the choice — both have to become a line of text, and
 * joining with a comma is what a person would write.
 */
const answerText = (v: any): string => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(answerText).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    // { value: 'อื่น ๆ', other: 'ป้าเลี้ยง' } → the typed text is the answer.
    const other = str((v as any).other || (v as any).text).trim();
    const value = str((v as any).value || (v as any).label).trim();
    return other || value;
  }
  return str(v);
};

export async function resolveCertificateValues(
  db: D1Database,
  bookingId: number,
  extra?: { serial?: string | null; publicCode?: string | null },
): Promise<CertValues> {
  const row = await db.prepare(`
    SELECT b.id AS booking_id, b.scheduled_at, b.form_submission_id,
           hp.name AS child_name, hp.nickname AS child_nickname,
           hp.gender AS child_gender, hp.birth_date AS child_birth_date,
           u.first_name AS parent_first, u.last_name AS parent_last,
           co.name AS course_name,
           COALESCE(NULLIF(co.location_label, ''), co.location) AS course_location
      FROM Bookings b
      LEFT JOIN Children ch ON ch.id = b.child_id
      LEFT JOIN HD_Profiles hp ON hp.id = ch.hd_profile_id
      LEFT JOIN Users u ON u.id = ch.parent_id
      LEFT JOIN Courses co ON co.id = b.course_id
     WHERE b.id = ?
  `).bind(bookingId).first<any>();
  if (!row) return {};

  const nickname = str(row.child_nickname).trim();
  const fullName = str(row.child_name).trim();

  const values: CertValues = {
    // Nickname first: it is the name a child is called and the one a family
    // expects to see. The full name is the fallback, never a blank.
    recipient_name: nickname || fullName || 'ผู้เข้าร่วมกิจกรรม',
    child_full_name: fullName,
    child_nickname: nickname,
    child_gender: str(row.child_gender),
    child_birth_date: str(row.child_birth_date).slice(0, 10),
    parent_name: [str(row.parent_first), str(row.parent_last)].filter(Boolean).join(' ').trim(),
    course_name: str(row.course_name),
    course_location: str(row.course_location),
    event_date: row.scheduled_at ? str(row.scheduled_at).slice(0, 10) : '',
    serial: str(extra?.serial),
    public_code: str(extra?.publicCode),
    booking_id: String(row.booking_id),
    // The date on the certificate, taken in Bangkok rather than UTC: a
    // certificate issued at 9pm here must not be dated tomorrow.
    issued_date: str(
      (await db.prepare("SELECT DATE('now','+7 hours') AS d").first<any>())?.d
    ),
  };

  // Every answer on the booking's form submission, under form:<field_key>.
  if (row.form_submission_id) {
    const sub = await db.prepare('SELECT answers_json FROM Form_Submissions WHERE id = ?')
      .bind(row.form_submission_id).first<any>();
    try {
      const answers = JSON.parse(sub?.answers_json || '{}');
      if (answers && typeof answers === 'object') {
        for (const [key, v] of Object.entries(answers)) {
          values[`${FORM_PREFIX}${key}`] = answerText(v);
        }
      }
    } catch {
      // A malformed submission costs its form answers, not the certificate.
    }
  }

  return values;
}

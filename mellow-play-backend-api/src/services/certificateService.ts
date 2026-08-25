import { CertificateRepository } from '../repositories/certificateRepository';
import { resolveCertificateValues } from './certificateVariables';

/**
 * Issuing a certificate — the one path, wherever the trigger came from.
 *
 * There are four triggers: a staff member issuing one row, "ออกเกียรติบัตรทั้ง
 * รอบ", the check-in tick, and "จบคลาส". They must all produce the same
 * document, so none of them may build one of their own — they all land here.
 * The alternative is the failure this codebase keeps producing: a rule
 * enforced on one path while the other three write silently past it.
 *
 * Idempotent by way of the one-live-certificate-per-booking index, so pressing
 * a button twice, ticking a scan twice, or checking in and then also marking
 * the class finished all leave exactly one certificate behind.
 */

/** When an item hands out certificates by itself. NULL is the default: never. */
export type CertificateMoment = 'checkin' | 'completion';
export type CertificateSource = 'manual' | CertificateMoment;

export const CERTIFICATE_AUTO_VALUES: (CertificateMoment | 'off')[] = ['off', 'checkin', 'completion'];

// Ambiguous characters left out on purpose (0/O, 1/I/L): a code gets read off a
// printed page and typed in by hand at least some of the time.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Random, not sequential. A running number in the URL would turn one shared
 * certificate into a directory of everyone who attended, since the next code
 * along is always a guess away.
 */
export const generatePublicCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
};

export interface IssueResult {
  issued: boolean;          // false = the booking already had a live certificate
  certificateId?: number;
}

/** Issue for one booking. */
export async function issueForBooking(
  db: D1Database,
  opts: { bookingId: number; templateId?: number | null; source?: CertificateSource; issuedBy?: number | null },
): Promise<IssueResult> {
  const repo = new CertificateRepository(db);
  const src = await repo.getIssueSource(opts.bookingId);
  if (!src) return { issued: false };

  const templateId = opts.templateId ?? await repo.resolveTemplateId(Number(src.course_id));

  // Nickname first: it is the name a child is called and the one a family
  // expects to see. The full name is the fallback, never a blank.
  const recipient = String(src.child_nickname || src.child_name || '').trim() || 'ผู้เข้าร่วมกิจกรรม';

  const year = new Date().getFullYear() + 543; // ปีพุทธศักราช, which is what goes on the page
  const serial = await repo.nextSerial(year);
  const publicCode = generatePublicCode();

  // Frozen here, so a template that later references a new form answer does not
  // retro-fill certificates issued before anyone was asked that question.
  const values = await resolveCertificateValues(db, opts.bookingId, { serial, publicCode });

  const id = await repo.issue({
    templateId,
    bookingId: opts.bookingId,
    childId: src.child_id ?? null,
    userId: src.user_id ?? null,
    recipientName: recipient,
    courseName: src.course_name ?? null,
    eventDate: src.scheduled_at ? String(src.scheduled_at).slice(0, 10) : null,
    serial,
    publicCode,
    issuedBy: opts.issuedBy ?? null,
    source: opts.source ?? 'manual',
    valuesJson: JSON.stringify(values),
  });
  return id == null ? { issued: false } : { issued: true, certificateId: id };
}

/**
 * Issue only if this item asked for it at this moment.
 *
 * Called from the check-in tick and from "จบคลาส", both of which run for every
 * booking whether or not certificates are involved — so the setting is read
 * here rather than at each call site, and an item with the setting off costs
 * one indexed read and nothing else.
 */
export async function autoIssue(
  db: D1Database,
  opts: { bookingId: number; moment: CertificateMoment; actorId?: number | null },
): Promise<IssueResult> {
  const row = await db.prepare(`
    SELECT co.certificate_auto FROM Bookings b
      JOIN Courses co ON co.id = b.course_id
     WHERE b.id = ? AND b.status != 'cancelled'
  `).bind(opts.bookingId).first<{ certificate_auto: string | null }>();

  if (!row || row.certificate_auto !== opts.moment) return { issued: false };
  return await issueForBooking(db, {
    bookingId: opts.bookingId,
    source: opts.moment,
    issuedBy: opts.actorId ?? null,
  });
}

/**
 * Take back a certificate the door issued, when the tick that issued it is
 * undone.
 *
 * Scoped to `source` on purpose: a mis-scan should undo itself, but a
 * certificate a staff member issued deliberately — or one that came from
 * "จบคลาส" — is a decision, and unticking a check-in line is not the place to
 * reverse it.
 */
export async function revokeAutoIssued(
  db: D1Database,
  opts: { bookingId: number; source: CertificateMoment },
): Promise<void> {
  await db.prepare(`
    UPDATE Certificates
       SET revoked_at = datetime('now'), revoke_reason = ?
     WHERE booking_id = ? AND source = ? AND revoked_at IS NULL
  `).bind('ยกเลิกการเช็คอิน', opts.bookingId, opts.source).run();
}

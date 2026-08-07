import { ConfigService } from './configService';
import { SettingsRepository } from '../repositories/settingsRepository';
import { SmsService } from './smsService';
import { SmsRepository } from '../repositories/smsRepository';
import { renderSmsTemplate, buildNameVariables, formatThaiDateTime } from './smsTemplateService';

// The automatic "booking confirmed" send — called from both places a
// booking actually becomes confirmed (adminController.createBooking's
// bypass-payment path, and webhookController's Beam success handler), and
// reused as-is for a CRM-triggered resend so a resend produces the exact
// same message a real-time send would have.
//
// `bookingIds` is one sibling-checkout group (all rows share one course and
// one Form_Submissions row) — a single SMS is sent to the shared parent
// phone, but logged once per booking id so per-booking "was this sent"
// lookups (getUnsentConfirmations) stay a simple row check regardless of
// how many children were in the checkout.
export async function sendBookingSuccessSms(
  db: D1Database,
  config: ConfigService,
  bookingIds: number[],
  sentBy: number | null = null,
): Promise<void> {
  // Notifications must never block or fail a booking that already succeeded.
  try {
    if (bookingIds.length === 0) return;

    const { results: rows } = await db.prepare(`
      SELECT
        b.id as booking_id, b.course_id, b.scheduled_at, b.form_submission_id,
        COALESCE(hp.nickname, hp.name) as child_name,
        hp.name as child_real_name, hp.nickname as child_nickname,
        (u.first_name || ' ' || u.last_name) as parent_name,
        (u.first_name || ' ' || u.last_name) as parent_real_name, u.nickname as parent_nickname,
        u.phone as phone,
        co.name as course_name, co.sms_success_enabled, co.sms_success_template,
        br.name as branch_name
      FROM Bookings b
      JOIN Children ch ON b.child_id = ch.id AND b.child_id != 0
      JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
      JOIN Users u ON ch.parent_id = u.id
      JOIN Courses co ON b.course_id = co.id
      LEFT JOIN Branches br ON b.branch_id = br.id
      WHERE b.id IN (${bookingIds.join(',')})
    `).all();

    const bookingRows = rows as any[];
    if (bookingRows.length === 0) return; // guest checkout — no phone to text

    const first = bookingRows[0];
    if (!first.sms_success_enabled || !first.sms_success_template) return;
    if (!first.phone) return;

    // Sibling children in the same checkout each contribute their own
    // name/nickname, comma-joined — the parent is shared across the group.
    const joinField = (field: string) => bookingRows.map(r => r[field]).filter(Boolean).join(', ');
    const variables: Record<string, string> = {
      ...buildNameVariables(first),
      child_name: joinField('child_name'),
      child_real_name: joinField('child_real_name'),
      child_nickname: joinField('child_nickname') || joinField('child_real_name'),
      course_name: first.course_name ?? '',
      branch_name: first.branch_name ?? '',
      scheduled_at: formatThaiDateTime(first.scheduled_at),
    };

    const smsRepo = new SmsRepository(db);

    if (first.form_submission_id) {
      const submission = await db.prepare('SELECT answers_json FROM Form_Submissions WHERE id = ?')
        .bind(first.form_submission_id).first<{ answers_json: string }>();
      if (submission?.answers_json) {
        try {
          const answers = JSON.parse(submission.answers_json);
          for (const [key, value] of Object.entries(answers)) {
            variables[key] = Array.isArray(value) ? value.join(', ') : String(value ?? '');
          }
        } catch { /* malformed answers_json shouldn't block the send */ }
      }
      // A form that names specifically who's attending (e.g. two-parent
      // households, or an event needing a named participant) beats the
      // account's own linked child/parent as the default for all 6 name
      // variables — see getFormPreferredNames.
      const preferred = await smsRepo.getFormPreferredNames(first.form_submission_id);
      Object.assign(variables, preferred);
    }

    const message = renderSmsTemplate(first.sms_success_template, variables);

    const settingsRepo = new SettingsRepository(db);
    const apiKey = await settingsRepo.getOverridable('sms_api_key', config.smsApiKey);
    const apiSecret = await settingsRepo.getOverridable('sms_api_secret', config.smsApiSecret);
    const senderName = await settingsRepo.getOverridable('sms_sender_name', 'Demo');
    const sms = new SmsService(apiKey, apiSecret, senderName);
    const result = await sms.sendMessage(first.phone, message);

    for (const row of bookingRows) {
      await smsRepo.logSms({
        bookingId: row.booking_id,
        courseId: row.course_id,
        type: 'booking_success',
        phone: first.phone,
        message,
        status: result.ok ? 'sent' : 'failed',
        providerDetail: result.detail ?? null,
        sentBy,
      });
    }
  } catch { /* notification must never block a successful booking */ }
}

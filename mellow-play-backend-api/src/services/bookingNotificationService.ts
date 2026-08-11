import { ConfigService } from './configService';
import { SettingsRepository } from '../repositories/settingsRepository';
import { SmsService } from './smsService';
import { SmsRepository } from '../repositories/smsRepository';
import { EmailService } from './emailService';
import { EmailLogRepository } from '../repositories/emailLogRepository';
import { renderSmsTemplate, buildNameVariables, formatThaiDateTime } from './smsTemplateService';
import { renderEmailTemplate, renderEmailSubject, wrapEmailHtml } from './emailTemplateService';

// The automatic "booking confirmed" send — called from both places a booking
// actually becomes confirmed (adminController.createBooking's bypass-payment
// path, and webhookController's Beam success handler), and reused as-is for a
// CRM-triggered resend so a resend produces exactly what a real-time send would
// have.
//
// Replaces the SMS-only sendBookingSuccessSms. Both channels are driven from one
// place because they share everything that matters: the same row query, the same
// {{variable}} set, the same "never block a booking that already succeeded" rule,
// and the fallback below needs to know what the other channel did.
//
// `bookingIds` is one sibling-checkout group (all rows share one course and one
// Form_Submissions row) — one message goes to the shared parent contact, but it
// is logged once per booking id so per-booking "was this sent" lookups
// (getUnsentConfirmations) stay a simple row check regardless of how many
// children were in the checkout.
export async function sendBookingSuccessNotifications(
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
        u.phone as phone, u.email as parent_email,
        co.name as course_name,
        co.sms_success_enabled, co.sms_success_template,
        co.email_success_enabled, co.email_success_subject, co.email_success_template,
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
    if (bookingRows.length === 0) return; // guest checkout — no contact to reach

    const first = bookingRows[0];

    const wantSms = !!first.sms_success_enabled && !!first.sms_success_template;
    const wantEmail = !!first.email_success_enabled && !!first.email_success_template;
    if (!wantSms && !wantEmail) return;

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

    const settingsRepo = new SettingsRepository(db);
    const hasEmailAddress = !!(first.parent_email || '').trim();

    // Fallback rule (chosen deliberately): a course set up to confirm by email
    // still has to reach a parent who has no email address on file — Users.email
    // is nullable and unverified. It falls back to SMS, but only when SMS is not
    // already being sent for this booking, or the parent would get two texts.
    //
    // It also needs an SMS template to fall back to. A course configured for
    // email only has no reason to have one, and reusing the email body would
    // mean sending a multi-page HTML-derived text at per-segment SMS pricing, so
    // that case is recorded as a failure instead of guessing.
    const emailNeedsFallback = wantEmail && !hasEmailAddress && !wantSms;
    const canFallback = emailNeedsFallback && !!first.sms_success_template;
    const sendSms = (wantSms || canFallback) && !!first.phone;

    if (sendSms) {
      const message = renderSmsTemplate(first.sms_success_template, variables);
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
          // Marked in the log so "why did this parent get an SMS when the course
          // is set to email?" is answerable from the CRM without guesswork.
          providerDetail: canFallback
            ? `fallback from email (no address on file)${result.detail ? `: ${result.detail}` : ''}`
            : result.detail ?? null,
          sentBy,
        });
      }
    }

    if (wantEmail) {
      const emailRepo = new EmailLogRepository(db);
      const subjectTemplate = first.email_success_subject || 'ยืนยันการลงทะเบียน {{course_name}}';
      const subject = renderEmailSubject(subjectTemplate, variables);

      if (!hasEmailAddress) {
        // Nothing was sent by email. Recorded against the booking anyway so the
        // CRM can show that the channel was configured and why it did not run.
        // Uses the parent's phone as the identifier since there is no address —
        // Email_Logs.email is NOT NULL and inventing one would pollute the data.
        await emailRepo.log({
          bookingId: first.booking_id,
          courseId: first.course_id,
          type: 'booking_success',
          email: `(ไม่มีอีเมล) ${first.phone ?? ''}`.trim(),
          subject,
          bodyHtml: null,
          status: 'failed',
          providerDetail: canFallback
            ? 'ผู้ปกครองไม่มีอีเมลในระบบ — ส่ง SMS แทนแล้ว'
            : 'ผู้ปกครองไม่มีอีเมลในระบบ และไม่มี template SMS ให้ส่งแทน',
          sentBy,
        });
      } else {
        const bodyHtml = wrapEmailHtml(renderEmailTemplate(first.email_success_template, variables));
        const fromAddress = await settingsRepo.getOverridable('email_from_address', 'contact@mellowplay.co');
        const fromName = await settingsRepo.getOverridable('email_from_name', 'Mellow Play');
        const replyTo = await settingsRepo.getOverridable('email_reply_to', '');
        const email = new EmailService(config.emailBinding, fromAddress, fromName, replyTo);

        const result = email.isConfigured
          ? await email.sendMessage(first.parent_email, subject, bodyHtml)
          : { ok: false, detail: 'ยังไม่ได้ตั้งค่า Email Sending (ไม่มี binding หรือไม่มีที่อยู่ผู้ส่ง)' };

        for (const row of bookingRows) {
          await emailRepo.log({
            bookingId: row.booking_id,
            courseId: row.course_id,
            type: 'booking_success',
            email: first.parent_email,
            subject,
            bodyHtml,
            status: result.ok ? 'sent' : 'failed',
            providerMessageId: result.messageId ?? null,
            providerDetail: result.detail ?? null,
            sentBy,
          });
        }
      }
    }
  } catch { /* notification must never block a successful booking */ }
}

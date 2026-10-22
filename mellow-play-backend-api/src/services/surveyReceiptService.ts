import { ConfigService } from './configService';
import { SettingsRepository } from '../repositories/settingsRepository';
import { EmailService } from './emailService';
import { wrapEmailHtml, loadEmailTheme, renderEmailTemplate, renderEmailSubject } from './emailTemplateService';
import { EmailLogRepository } from '../repositories/emailLogRepository';

/**
 * The email somebody gets after paying for a form.
 *
 * Two kinds, and the difference is not decoration. 'received' goes out the
 * moment a slip is attached and says only that — the registration and the
 * slip arrived. 'verified' goes out when someone has actually checked it and
 * says the payment is confirmed. Sending the second wording for the first
 * event would be telling a person their money is settled when nobody has
 * looked, which is exactly the sentence they would quote back later.
 *
 * Sent from the same binding, sender and theme as every other email here, so
 * a receipt from a survey looks like a receipt from a class.
 */
export type ReceiptKind = 'received' | 'verified';

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Which answer the receipt is sent to.
 *
 * Asked of the form, in the order its fields are laid out, and never of the
 * answers object on its own. The answers object is keyed in the order the
 * person happened to type, so scanning it meant that someone who wrote their
 * address into a free-text note before reaching the email box would have the
 * note win — the same form, the same answers, a different recipient depending
 * on the order of typing.
 *
 * A form with an email field answers the question by itself: the first such
 * field holding an address is the recipient, and if every one of them is
 * blank there is no recipient — rather than quietly falling through to an
 * address someone typed into a notes box.
 *
 * The two fallbacks below it are for forms built before the field type
 * existed: a `receiptEmail` flag left on a text field, then the first answer
 * anywhere on the form that looks like an address.
 */
async function findEmail(db: any, formId: number, answersJson: string | null | undefined): Promise<string> {
  let answers: Record<string, any> = {};
  try {
    const parsed = JSON.parse(answersJson || '{}');
    if (parsed && typeof parsed === 'object') answers = parsed;
  } catch {
    return '';
  }

  const { results: fields } = await db.prepare(
    'SELECT field_key, type, config_json FROM Survey_Form_Fields WHERE form_id = ? ORDER BY page_index ASC, field_index ASC'
  ).bind(formId).all();

  const valueAt = (key: string): string => {
    const v = answers[key];
    return typeof v === 'string' && EMAIL_SHAPE.test(v.trim()) ? v.trim() : '';
  };

  const emailFields = (fields as any[]).filter((f) => f.type === 'email');
  if (emailFields.length) {
    for (const field of emailFields) {
      const chosen = valueAt(field.field_key);
      if (chosen) return chosen;
    }
    // The form asked for an address and got none. Nothing else on it was
    // offered as somewhere to write one, so there is nowhere to send.
    return '';
  }

  for (const field of (fields as any[])) {
    let marked = false;
    try { marked = !!JSON.parse(field.config_json || '{}').receiptEmail; } catch { marked = false; }
    if (!marked) continue;
    return valueAt(field.field_key);
  }

  for (const field of (fields as any[])) {
    const chosen = valueAt(field.field_key);
    if (chosen) return chosen;
  }
  return '';
}

/**
 * The wording, when nobody has written their own.
 *
 * Kept in the code rather than seeded into the settings table so that a form
 * nobody has been near still sends the mail it sent before this was editable.
 * A settings row appears only when someone saves one.
 */
export const RECEIPT_DEFAULTS: Record<ReceiptKind, { subject: string; template: string }> = {
  received: {
    subject: 'ได้รับใบสมัครและสลิปแล้ว · {{form}}',
    template: `<p>เราได้รับใบสมัครและสลิปโอนเงินของคุณแล้ว</p>
<p style="color:#64748b">ทีมงานจะตรวจสอบและติดต่อกลับหากมีข้อสงสัย หากข้อมูลครบถ้วนถือว่าการสมัครเสร็จสมบูรณ์</p>
<p><b>{{form}}</b></p>
<p>ชื่อผู้สมัคร: {{name}}<br/>เลขที่รายการ: #{{id}}</p>
{{breakdown}}
<p>เก็บอีเมลฉบับนี้ไว้เป็นหลักฐานได้เลยค่ะ</p>`,
  },
  verified: {
    subject: 'ยืนยันการชำระเงิน · {{form}}',
    template: `<p>ยืนยันการชำระเงินเรียบร้อยแล้ว</p>
<p><b>{{form}}</b></p>
<p>ชื่อผู้สมัคร: {{name}}<br/>เลขที่รายการ: #{{id}}</p>
{{breakdown}}
<p>เก็บอีเมลฉบับนี้ไว้เป็นหลักฐานได้เลยค่ะ</p>`,
  },
};

/** Where each kind of receipt keeps its wording in System_Settings. */
export const receiptSettingKeys = (kind: ReceiptKind) => ({
  subject: `survey_receipt_subject_${kind}`,
  template: `survey_receipt_template_${kind}`,
});

/**
 * The priced lines as a table.
 *
 * Handed to the template as a RAW variable: it is markup this file produced,
 * not something a person typed, so escaping it would print the tags at the
 * reader instead of drawing the table.
 */
export function receiptBreakdown(amount: number, lines: { label: string; amount: number }[]): string {
  const total = Number(amount || 0).toLocaleString('th-TH');
  return lines.length
    ? `<table style="width:100%;border-collapse:collapse;margin:12px 0">${lines.map((l) => `
        <tr>
          <td style="padding:4px 0">${l.label}</td>
          <td style="padding:4px 0;text-align:right">${Number(l.amount).toLocaleString('th-TH')} บาท</td>
        </tr>`).join('')}
        <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding-top:8px"></td></tr>
        <tr>
          <td style="padding:4px 0;font-weight:700">รวม</td>
          <td style="padding:4px 0;text-align:right;font-weight:700">${total} บาท</td>
        </tr>
      </table>`
    : `<p>ยอดชำระ: <b>${total} บาท</b></p>`;
}

/**
 * Where the receipt would go, without sending anything.
 *
 * Called before responding so the screen can say "we have emailed you" and be
 * telling the truth, while the send itself happens after the response. The
 * person tapping "ส่งสลิป" should not be watching a spinner for however long
 * an email takes to hand off.
 */
export async function receiptRecipient(config: ConfigService, submissionId: number): Promise<string> {
  try {
    const row = await config.db.prepare(
      'SELECT form_id, answers_json FROM Survey_Submissions WHERE id = ?'
    ).bind(submissionId).first() as any;
    if (!row) return '';
    return findEmail(config.db, row.form_id, row.answers_json);
  } catch {
    return '';
  }
}

/**
 * Never throws and never blocks the thing that triggered it. A slip that was
 * stored and a payment that was confirmed are facts; an inbox that bounced is
 * not a reason to undo either of them.
 *
 * Every attempt is written to Email_Logs, including the ones that never got
 * as far as an address. Before that, a receipt that failed failed in silence:
 * the person did not get their mail, and nobody could find out why — on a
 * form whose own last page promises one within thirty minutes.
 */
export async function sendSurveyReceipt(
  config: ConfigService,
  submissionId: number,
  kind: ReceiptKind,
  lines: { label: string; amount: number }[] = [],
): Promise<{ sent: boolean; detail?: string }> {
  try {
    const row = await config.db.prepare(`
      SELECT s.id, s.form_id, s.amount, s.respondent_name, s.answers_json, f.name AS form_name
      FROM Survey_Submissions s JOIN Survey_Forms f ON f.id = s.form_id
      WHERE s.id = ?
    `).bind(submissionId).first() as any;
    if (!row) return { sent: false, detail: 'submission not found' };

    const settingsRepo = new SettingsRepository(config.db);
    const logs = new EmailLogRepository(config.db);
    const keys = receiptSettingKeys(kind);
    const subjectTemplate = await settingsRepo.getOverridable(keys.subject, RECEIPT_DEFAULTS[kind].subject);
    const bodyTemplate = await settingsRepo.getOverridable(keys.template, RECEIPT_DEFAULTS[kind].template);

    const variables: Record<string, string> = {
      form: row.form_name || '',
      name: row.respondent_name || '-',
      id: String(row.id),
      amount: Number(row.amount || 0).toLocaleString('th-TH'),
    };
    const subject = renderEmailSubject(subjectTemplate, variables);

    const to = await findEmail(config.db, row.form_id, row.answers_json);
    if (!to) {
      // Logged against the submission rather than dropped, so "why did this
      // person never hear from us" has an answer on the screen.
      await logs.log({
        type: 'survey_receipt', email: '(ไม่มีอีเมลในคำตอบ)', subject,
        bodyHtml: null, status: 'failed',
        providerDetail: 'no email address in the answers',
        surveySubmissionId: row.id,
      }).catch(() => {});
      return { sent: false, detail: 'no email address in the answers' };
    }

    const fromAddress = await settingsRepo.getOverridable('email_from_address', 'contact@mellowplay.co');
    const fromName = await settingsRepo.getOverridable('email_from_name', 'Mellow Play');
    const replyTo = await settingsRepo.getOverridable('email_reply_to', '');
    const email = new EmailService(config.emailBinding, fromAddress, fromName, replyTo);

    const html = wrapEmailHtml(
      renderEmailTemplate(bodyTemplate, variables, { breakdown: receiptBreakdown(row.amount, lines) }),
      await loadEmailTheme(settingsRepo),
    );

    const result = email.isConfigured
      ? await email.sendMessage(to, subject, html)
      : { ok: false, detail: 'email sending is not configured', messageId: undefined as string | undefined };

    await logs.log({
      type: 'survey_receipt', email: to, subject, bodyHtml: html,
      status: result.ok ? 'sent' : 'failed',
      providerMessageId: result.messageId ?? null,
      providerDetail: result.detail ?? null,
      surveySubmissionId: row.id,
    }).catch(() => {});

    return { sent: !!result?.ok, detail: result?.detail };
  } catch (e: any) {
    return { sent: false, detail: e?.message };
  }
}

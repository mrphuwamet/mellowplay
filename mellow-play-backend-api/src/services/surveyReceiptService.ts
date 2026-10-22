import { ConfigService } from './configService';
import { SettingsRepository } from '../repositories/settingsRepository';
import { EmailService } from './emailService';
import { wrapEmailHtml, loadEmailTheme } from './emailTemplateService';

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

/** The respondent's address, wherever the form happened to ask for it. */
function findEmail(answersJson: string | null | undefined, fallback?: string | null): string {
  if (fallback && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fallback.trim())) return fallback.trim();
  try {
    const parsed = JSON.parse(answersJson || '{}');
    for (const value of Object.values(parsed)) {
      if (typeof value === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim())) {
        return value.trim();
      }
    }
  } catch {
    // An unreadable answer set simply has no address in it.
  }
  return '';
}

function body(kind: ReceiptKind, row: any, lines: { label: string; amount: number }[]): string {
  const amount = Number(row.amount || 0).toLocaleString('th-TH');
  const breakdown = lines.length
    ? `<table style="width:100%;border-collapse:collapse;margin:12px 0">${lines.map((l) => `
        <tr>
          <td style="padding:4px 0">${l.label}</td>
          <td style="padding:4px 0;text-align:right">${Number(l.amount).toLocaleString('th-TH')} บาท</td>
        </tr>`).join('')}
        <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding-top:8px"></td></tr>
        <tr>
          <td style="padding:4px 0;font-weight:700">รวม</td>
          <td style="padding:4px 0;text-align:right;font-weight:700">${amount} บาท</td>
        </tr>
      </table>`
    : `<p>ยอดชำระ: <b>${amount} บาท</b></p>`;

  const opening = kind === 'verified'
    ? '<p>ยืนยันการชำระเงินเรียบร้อยแล้ว</p>'
    : `<p>เราได้รับใบสมัครและสลิปโอนเงินของคุณแล้ว</p>
       <p style="color:#64748b">ทีมงานจะตรวจสอบและติดต่อกลับหากมีข้อสงสัย หากข้อมูลครบถ้วนถือว่าการสมัครเสร็จสมบูรณ์</p>`;

  return `${opening}
    <p><b>${row.form_name}</b></p>
    <p>ชื่อผู้สมัคร: ${row.respondent_name || '-'}<br/>เลขที่รายการ: #${row.id}</p>
    ${breakdown}
    <p>เก็บอีเมลฉบับนี้ไว้เป็นหลักฐานได้เลยค่ะ</p>`;
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
      'SELECT answers_json FROM Survey_Submissions WHERE id = ?'
    ).bind(submissionId).first() as any;
    return findEmail(row?.answers_json);
  } catch {
    return '';
  }
}

/**
 * Never throws and never blocks the thing that triggered it. A slip that was
 * stored and a payment that was confirmed are facts; an inbox that bounced is
 * not a reason to undo either of them.
 */
export async function sendSurveyReceipt(
  config: ConfigService,
  submissionId: number,
  kind: ReceiptKind,
  lines: { label: string; amount: number }[] = [],
): Promise<{ sent: boolean; detail?: string }> {
  try {
    const row = await config.db.prepare(`
      SELECT s.id, s.amount, s.respondent_name, s.answers_json, f.name AS form_name
      FROM Survey_Submissions s JOIN Survey_Forms f ON f.id = s.form_id
      WHERE s.id = ?
    `).bind(submissionId).first() as any;
    if (!row) return { sent: false, detail: 'submission not found' };

    const to = findEmail(row.answers_json);
    if (!to) return { sent: false, detail: 'no email address in the answers' };

    const settingsRepo = new SettingsRepository(config.db);
    const fromAddress = await settingsRepo.getOverridable('email_from_address', 'contact@mellowplay.co');
    const fromName = await settingsRepo.getOverridable('email_from_name', 'Mellow Play');
    const replyTo = await settingsRepo.getOverridable('email_reply_to', '');
    const email = new EmailService(config.emailBinding, fromAddress, fromName, replyTo);
    if (!email.isConfigured) return { sent: false, detail: 'email sending is not configured' };

    const subject = kind === 'verified'
      ? `ยืนยันการชำระเงิน · ${row.form_name}`
      : `ได้รับใบสมัครและสลิปแล้ว · ${row.form_name}`;

    const html = wrapEmailHtml(body(kind, row, lines), await loadEmailTheme(settingsRepo));
    const result = await email.sendMessage(to, subject, html);
    return { sent: !!result?.ok, detail: result?.detail };
  } catch (e: any) {
    return { sent: false, detail: e?.message };
  }
}

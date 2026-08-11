import { SendEmailBinding } from '../types/env';

export interface EmailSendOutcome {
  ok: boolean;
  detail?: string;
  messageId?: string;
}

// Counterpart to SmsService, deliberately exposing the same
// { ok, detail } result shape so the notification services can treat the two
// channels alike and log both with one code path.
//
// Unlike SmsService this makes no fetch() call and needs no AbortController:
// Cloudflare Email Service is reached through a Worker binding, which is an
// in-process call to the runtime rather than an outbound HTTP request to a
// third party that could hang.
export class EmailService {
  private binding: SendEmailBinding | undefined;
  private fromAddress: string;
  private fromName: string;
  private replyTo: string;

  constructor(
    binding: SendEmailBinding | undefined,
    fromAddress: string,
    fromName: string = 'Mellow Play',
    replyTo: string = '',
  ) {
    this.binding = binding;
    this.fromAddress = fromAddress;
    this.fromName = fromName;
    this.replyTo = replyTo;
  }

  // False until the sending domain is onboarded and the binding is deployed.
  // Callers check this to skip a channel outright instead of logging a failed
  // send for every recipient while the feature is still being set up.
  get isConfigured(): boolean {
    return !!this.binding && !!this.fromAddress;
  }

  // Same wording and 5-minute expiry as SmsService.sendOtp so a code reads
  // identically whichever channel the user picked. Plain text only — an OTP
  // needs no layout, and text-only mail is less likely to be filtered.
  async sendOtp(email: string, otp: string, ref: string): Promise<EmailSendOutcome> {
    const text = `รหัส OTP สำหรับ Mellow Play ของคุณคือ ${otp} (อ้างอิง: ${ref}) หมดอายุภายใน 5 นาที ห้ามบอกหรือส่งต่อรหัสนี้ให้ผู้อื่น`;
    return this.send(email, `รหัส OTP Mellow Play: ${otp}`, undefined, text);
  }

  // CRM "Test Connection" equivalent of SmsService.sendTest — a real send
  // (it counts against the account's daily quota) whose wording makes clear
  // it is a connectivity check, with the provider error surfaced to the admin.
  async sendTest(email: string): Promise<EmailSendOutcome> {
    return this.send(
      email,
      'ทดสอบการเชื่อมต่ออีเมล Mellow Play',
      '<p>นี่คืออีเมลทดสอบการเชื่อมต่อจากระบบ Mellow Play CRM</p>',
      'นี่คืออีเมลทดสอบการเชื่อมต่อจากระบบ Mellow Play CRM',
    );
  }

  // Generic send for rendered templates — booking confirmations, reminders,
  // resends.
  async sendMessage(to: string, subject: string, html: string, text?: string): Promise<EmailSendOutcome> {
    return this.send(to, subject, html, text ?? htmlToPlainText(html));
  }

  private async send(to: string, subject: string, html?: string, text?: string): Promise<EmailSendOutcome> {
    if (!this.binding) {
      return { ok: false, detail: 'Email binding not configured on this Worker (sending domain not onboarded yet)' };
    }
    if (!this.fromAddress) {
      return { ok: false, detail: 'Sender address not configured' };
    }

    try {
      const result = await this.binding.send({
        to,
        // RFC 5322 display-name form. The name is quoted because Thai branch
        // names and commas in a display name break unquoted parsing.
        from: this.fromName ? `"${this.fromName.replace(/"/g, '')}" <${this.fromAddress}>` : this.fromAddress,
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
      });
      return { ok: true, messageId: result?.messageId };
    } catch (error: any) {
      // Email Service throws Errors carrying a machine-readable `.code`
      // (e.g. E_SENDER_NOT_VERIFIED) — keep it in the detail so an admin
      // reading Email_Logs can tell a setup problem from a bad address.
      const detail = [error?.code, error?.message].filter(Boolean).join(': ') || String(error);
      console.error('Email Service Error:', error);
      return { ok: false, detail };
    }
  }
}

// Every mail carries a text/plain alternative: some clients prefer it, and a
// message with no text part scores worse with spam filters. Derived from the
// HTML rather than asked of the template author, who only edits one body.
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

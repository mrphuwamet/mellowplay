import { ConfigService } from './configService';
import { SettingsRepository } from '../repositories/settingsRepository';
import { EmailService } from './emailService';
import { EmailLogRepository } from '../repositories/emailLogRepository';
import { renderEmailTemplate, renderEmailSubject, wrapEmailHtml } from './emailTemplateService';

/**
 * The one-off "your account is ready" mail, sent when an account is created.
 *
 * Authored in System_Settings rather than per-course like the booking
 * confirmation: there is exactly one signup flow, so a per-anything template
 * would be a setting with one possible value.
 *
 * Off by default. Turning it on starts mailing every new signup, which should
 * be a deliberate act after someone has written the body and tested it.
 */
export async function sendWelcomeEmail(
  db: D1Database,
  config: ConfigService,
  user: { id?: number; name?: string; email?: string | null; phone?: string | null },
): Promise<void> {
  // A welcome mail must never be the reason a signup fails — same rule the
  // booking notifications follow.
  try {
    const address = (user.email || '').trim();
    if (!address) return; // email is optional at registration

    const settings = new SettingsRepository(db);
    if (await settings.getSetting('welcome_email_enabled') !== '1') return;

    const subjectTemplate = await settings.getOverridable('welcome_email_subject', 'ยินดีต้อนรับสู่ Mellow Play');
    const bodyTemplate = await settings.getOverridable('welcome_email_template', '');
    if (!bodyTemplate.trim()) return; // enabled but never written — send nothing rather than an empty mail

    const variables: Record<string, string> = {
      name: user.name || '',
      email: address,
      phone: user.phone || '',
    };

    const subject = renderEmailSubject(subjectTemplate, variables);
    const bodyHtml = wrapEmailHtml(renderEmailTemplate(bodyTemplate, variables));

    const fromAddress = await settings.getOverridable('email_from_address', 'contact@mellowplay.co');
    const fromName = await settings.getOverridable('email_from_name', 'Mellow Play');
    const replyTo = await settings.getOverridable('email_reply_to', '');
    const email = new EmailService(config.emailBinding, fromAddress, fromName, replyTo);

    const result = email.isConfigured
      ? await email.sendMessage(address, subject, bodyHtml)
      : { ok: false, detail: 'ยังไม่ได้ตั้งค่า Email Sending', messageId: undefined as string | undefined };

    await new EmailLogRepository(db).log({
      bookingId: null,
      courseId: null,
      type: 'welcome',
      email: address,
      subject,
      bodyHtml,
      status: result.ok ? 'sent' : 'failed',
      providerMessageId: result.messageId ?? null,
      providerDetail: result.detail ?? null,
      sentBy: null,
    });
  } catch { /* never block a signup that already succeeded */ }
}

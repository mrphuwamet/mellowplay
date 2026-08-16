import { ConfigService } from './configService';
import { SettingsRepository } from '../repositories/settingsRepository';
import { EmailService } from './emailService';
import { SmsService } from './smsService';
import { EmailLogRepository } from '../repositories/emailLogRepository';
import { BroadcastRepository } from '../repositories/broadcastRepository';
import { renderEmailTemplate, renderEmailSubject, wrapEmailHtml, loadEmailTheme, escapeHtml } from './emailTemplateService';
import { renderSmsTemplate } from './smsTemplateService';

/**
 * Drains the broadcast queue, a batch per cron tick.
 *
 * Not done in the request that launches a campaign: a Worker has a wall-clock
 * and subrequest ceiling, so a click that tries to mail a thousand people
 * either times out halfway or silently drops the tail. Draining on the
 * schedule also means a send survives a deploy and can report real progress.
 *
 * Every recipient is marked before moving on, so a tick that dies partway
 * resumes rather than re-sending what already went out.
 */
export async function drainBroadcasts(db: D1Database, config: ConfigService): Promise<{ processed: number }> {
  const repo = new BroadcastRepository(db);
  const settings = new SettingsRepository(db);
  // Loaded once for the whole drain rather than per recipient — every message
  // in a broadcast wears the same frame.
  const emailTheme = await loadEmailTheme(settings);

  const batchSize = parseInt(await settings.getOverridable('broadcast_batch_size', '40')) || 40;
  const pending = await repo.nextPending(batchSize);
  if (pending.length === 0) {
    await repo.finishDrained();
    return { processed: 0 };
  }

  const consumerAppUrl = (await settings.getOverridable('consumer_app_url', 'https://mellowplay.co')).replace(/\/+$/, '');
  const fromAddress = await settings.getOverridable('email_from_address', 'contact@mellowplay.co');
  const fromName = await settings.getOverridable('email_from_name', 'Mellow Play');
  const replyTo = await settings.getOverridable('email_reply_to', '');
  const email = new EmailService(config.emailBinding, fromAddress, fromName, replyTo);

  const smsApiKey = await settings.getOverridable('sms_api_key', config.smsApiKey);
  const smsApiSecret = await settings.getOverridable('sms_api_secret', config.smsApiSecret);
  const smsSenderName = await settings.getOverridable('sms_sender_name', 'Demo');
  const sms = new SmsService(smsApiKey, smsApiSecret, smsSenderName);

  const emailLogs = new EmailLogRepository(db);

  for (const r of pending as any[]) {
    try {
      const variables: Record<string, string> = { name: r.name || '', email: r.email || '', phone: r.phone || '' };

      if (r.channel === 'email') {
        if (!r.body_html?.trim()) {
          await repo.markRecipient(r.id, 'skipped', 'ไม่มีเนื้อหาอีเมล');
          continue;
        }
        const subject = renderEmailSubject(r.subject || r.broadcast_name || '', variables);

        // Every marketing mail carries a working opt-out. A recipient with no
        // account (there are none today, but the column is nullable) simply
        // gets no footer rather than a link that cannot identify anyone.
        let footer = '';
        if (r.user_id) {
          const token = await repo.unsubscribeToken(r.user_id);
          const url = `${consumerAppUrl}/unsubscribe/${token}`;
          footer = `<hr style="margin-top:32px;border:none;border-top:1px solid #eee" />
<p style="font-size:12px;color:#888">ไม่ต้องการรับข่าวสารจาก Mellow Play อีก? <a href="${escapeHtml(url)}">ยกเลิกรับข่าวสาร</a></p>`;
        }

        const bodyHtml = wrapEmailHtml(renderEmailTemplate(r.body_html, variables) + footer, emailTheme);
        const result = email.isConfigured
          ? await email.sendMessage(r.email, subject, bodyHtml)
          : { ok: false, detail: 'ยังไม่ได้ตั้งค่า Email Sending', messageId: undefined as string | undefined };

        await emailLogs.log({
          bookingId: null,
          courseId: null,
          type: 'broadcast',
          email: r.email,
          subject,
          bodyHtml,
          status: result.ok ? 'sent' : 'failed',
          providerMessageId: result.messageId ?? null,
          providerDetail: result.detail ?? null,
          sentBy: null,
          broadcastId: r.broadcast_id,
        });
        await repo.markRecipient(r.id, result.ok ? 'sent' : 'failed', result.detail ?? null);
      } else {
        if (!r.sms_message?.trim()) {
          await repo.markRecipient(r.id, 'skipped', 'ไม่มีข้อความ SMS');
          continue;
        }
        const message = renderSmsTemplate(r.sms_message, variables);
        const result = await sms.sendMessage(r.phone, message);

        await db.prepare(`
          INSERT INTO Sms_Logs (booking_id, course_id, type, phone, message, status, provider_detail, sent_by, broadcast_id)
          VALUES (NULL, NULL, 'broadcast', ?, ?, ?, ?, NULL, ?)
        `).bind(r.phone, message, result.ok ? 'sent' : 'failed', result.detail ?? null, r.broadcast_id).run();

        await repo.markRecipient(r.id, result.ok ? 'sent' : 'failed', result.detail ?? null);
      }
    } catch (e: any) {
      // One bad recipient must not stall the queue behind it forever.
      await repo.markRecipient(r.id, 'failed', e?.message ?? 'unexpected error');
    }
  }

  await repo.finishDrained();
  return { processed: pending.length };
}

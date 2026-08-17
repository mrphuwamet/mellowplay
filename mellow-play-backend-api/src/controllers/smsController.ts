import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { SmsRepository } from '../repositories/smsRepository';
import { SettingsRepository } from '../repositories/settingsRepository';
import { SmsService } from '../services/smsService';
import { renderSmsTemplate, buildNameVariables, buildLocationVariables, formatThaiDateTime } from '../services/smsTemplateService';
import { sendBookingSuccessNotifications } from '../services/bookingNotificationService';
import { EmailService } from '../services/emailService';
import { EmailLogRepository } from '../repositories/emailLogRepository';
import { renderEmailTemplate, renderEmailSubject, wrapEmailHtml, loadEmailTheme } from '../services/emailTemplateService';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

export class SmsController {
  private repo(c: C) { return new SmsRepository(new ConfigService(c.env).db); }

  async getReminderCandidates(c: C) {
    try {
      const q = c.req.query();
      const bookings = await this.repo(c).getReminderCandidates({
        courseId: q.courseId ? parseInt(q.courseId) : undefined,
        branchId: q.branchId ? parseInt(q.branchId) : undefined,
        dateFrom: q.dateFrom || undefined,
        dateTo: q.dateTo || undefined,
        status: q.status || undefined,
      });
      return c.json({ success: true, bookings });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // Manual send: the admin's message may still contain raw {{...}} tokens
  // (a builtin or a form field) — rendered per booking so a batch covering
  // several children each gets their own name/answers substituted in.
  async sendReminder(c: C) {
    try {
      const config = new ConfigService(c.env);
      const body = await c.req.json() as {
        bookingIds: number[]; message: string;
        channels?: ('sms' | 'email')[]; emailSubject?: string; emailBody?: string;
      };
      const { bookingIds, message } = body;
      // A reminder can go out by SMS, by email, or by both. Defaults to SMS
      // alone, which is what every caller predating the email channel sends.
      const channels = body.channels?.length ? body.channels : ['sms'];
      const wantsSms = channels.includes('sms');
      const wantsEmail = channels.includes('email');

      if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
        return c.json({ success: false, message: 'bookingIds required' }, 400);
      }
      if (wantsSms && !message?.trim()) {
        return c.json({ success: false, message: 'ต้องมีข้อความ SMS' }, 400);
      }
      if (wantsEmail && !body.emailBody?.trim()) {
        return c.json({ success: false, message: 'ต้องมีเนื้อหาอีเมล' }, 400);
      }

      const sentBy = c.get('crmUser')?.userId ?? null;
      const smsRepo = new SmsRepository(config.db);
      const settingsRepo = new SettingsRepository(config.db);

      const sms = wantsSms
        ? new SmsService(
          await settingsRepo.getOverridable('sms_api_key', config.smsApiKey),
          await settingsRepo.getOverridable('sms_api_secret', config.smsApiSecret),
          await settingsRepo.getOverridable('sms_sender_name', 'Demo'),
        )
        : null;

      // Built once for the whole batch: the theme and the sender identity are
      // the same for every recipient, and each is a settings read.
      const emailer = wantsEmail
        ? new EmailService(
          config.emailBinding,
          await settingsRepo.getOverridable('email_from_address', 'contact@mellowplay.co'),
          await settingsRepo.getOverridable('email_from_name', 'Mellow Play'),
          await settingsRepo.getOverridable('email_reply_to', ''),
        )
        : null;
      const emailTheme = wantsEmail ? await loadEmailTheme(settingsRepo) : null;
      const emailLog = wantsEmail ? new EmailLogRepository(config.db) : null;

      const candidates = await smsRepo.getReminderCandidates({});
      const byId = new Map(candidates.map((row: any) => [row.booking_id, row]));

      let sent = 0;
      const results: Array<{ bookingId: number; ok: boolean; detail?: string }> = [];
      for (const bookingId of bookingIds) {
        const row = byId.get(bookingId);
        if (!row) {
          results.push({ bookingId, ok: false, detail: 'ไม่พบข้อมูลผู้รับ (อาจไม่มีช่องทางติดต่อหรือถูกยกเลิก)' });
          continue;
        }
        // Same "form answer beats account data" preference as the automatic
        // send (see getFormPreferredNames) — a manual reminder should still
        // address whoever the family actually named as attending.
        const preferred = row.form_submission_id ? await smsRepo.getFormPreferredNames(row.form_submission_id) : {};
        const variables = {
          ...buildNameVariables(row),
          ...preferred,
          course_name: row.course_name ?? '',
          branch_name: row.branch_name ?? '',
          ...buildLocationVariables(row),
          scheduled_at: formatThaiDateTime(row.scheduled_at),
        };

        // One row can succeed on one channel and fail on the other. It counts
        // as reached if either got through, and the detail says which did not.
        let reached = false;
        const notes: string[] = [];

        if (wantsSms && sms) {
          if (!row.phone) {
            notes.push('ไม่มีเบอร์โทร');
          } else {
            const rendered = renderSmsTemplate(message, variables);
            const result = await sms.sendMessage(row.phone, rendered);
            reached = reached || result.ok;
            if (!result.ok) notes.push(`SMS: ${result.detail ?? 'ส่งไม่สำเร็จ'}`);
            await smsRepo.logSms({
              bookingId, courseId: row.course_id, type: 'reminder', phone: row.phone,
              message: rendered, status: result.ok ? 'sent' : 'failed', providerDetail: result.detail ?? null, sentBy,
            });
          }
        }

        if (wantsEmail && emailer && emailLog) {
          const address = (row.parent_email || '').trim();
          if (!address) {
            notes.push('ไม่มีอีเมล');
          } else {
            const subject = renderEmailSubject(body.emailSubject || 'แจ้งเตือน {{course_name}}', variables);
            const html = wrapEmailHtml(renderEmailTemplate(body.emailBody || '', variables), emailTheme ?? undefined);
            const result = emailer.isConfigured
              ? await emailer.sendMessage(address, subject, html)
              : { ok: false, detail: 'ยังไม่ได้ตั้งค่า Email Sending', messageId: undefined as string | undefined };
            reached = reached || result.ok;
            if (!result.ok) notes.push(`Email: ${result.detail ?? 'ส่งไม่สำเร็จ'}`);
            await emailLog.log({
              bookingId, courseId: row.course_id, type: 'reminder', email: address,
              subject, bodyHtml: html, status: result.ok ? 'sent' : 'failed',
              providerMessageId: result.messageId ?? null, providerDetail: result.detail ?? null, sentBy,
            });
          }
        }

        if (reached) sent++;
        results.push({ bookingId, ok: reached, detail: notes.join(' · ') || undefined });
      }
      return c.json({ success: true, sent, failed: results.length - sent, results });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async getNonRegisteredMembers(c: C) {
    try {
      const courseId = parseInt(c.req.query('courseId') || '');
      if (!courseId) return c.json({ success: false, message: 'courseId required' }, 400);
      const members = await this.repo(c).getNonRegisteredMembers(courseId);
      return c.json({ success: true, members });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async getUnsentConfirmations(c: C) {
    try {
      const q = c.req.query();
      const bookings = await this.repo(c).getUnsentConfirmations({
        courseId: q.courseId ? parseInt(q.courseId) : undefined,
        dateFrom: q.dateFrom || undefined,
        dateTo: q.dateTo || undefined,
      });
      return c.json({ success: true, bookings });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // Groups the selected bookings by their shared Form_Submissions row (a
  // sibling checkout) so a resend reproduces exactly what the original
  // automatic send would have done — one SMS per group, not one per child.
  // Bookings with no submission (no form on that course) each get their own.
  async resendConfirmation(c: C) {
    try {
      const config = new ConfigService(c.env);
      const { bookingIds } = await c.req.json() as { bookingIds: number[] };
      if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
        return c.json({ success: false, message: 'bookingIds required' }, 400);
      }
      const sentBy = c.get('crmUser')?.userId ?? null;

      const { results: rows } = await config.db.prepare(
        `SELECT id, form_submission_id FROM Bookings WHERE id IN (${bookingIds.join(',')})`
      ).all<{ id: number; form_submission_id: number | null }>();

      const groups = new Map<string, number[]>();
      for (const row of rows) {
        const key = row.form_submission_id ? `sub:${row.form_submission_id}` : `booking:${row.id}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row.id);
      }
      for (const ids of groups.values()) {
        await sendBookingSuccessNotifications(config.db, config, ids, sentBy);
      }
      return c.json({ success: true, groups: groups.size });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

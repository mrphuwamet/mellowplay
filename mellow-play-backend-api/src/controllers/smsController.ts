import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { SmsRepository } from '../repositories/smsRepository';
import { SettingsRepository } from '../repositories/settingsRepository';
import { SmsService } from '../services/smsService';
import {
  renderSmsTemplate, buildNameVariables, buildLocationVariables, formatThaiDateTime, stripUnresolvedTokens,
} from '../services/smsTemplateService';
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
        channels?: ('sms' | 'email')[]; mode?: string; emailSubject?: string; emailBody?: string;
      };
      const { bookingIds, message } = body;
      // The channel policy, in the vocabulary the per-course confirmation
      // already uses (see bookingNotificationService): both / email_first /
      // sms_first / email_only / sms_only. The older `channels` array still
      // works, and a caller that predates either sends SMS alone.
      const mode = body.mode
        || (body.channels?.length
          ? (body.channels.includes('sms') && body.channels.includes('email') ? 'both'
            : body.channels.includes('email') ? 'email_only' : 'sms_only')
          : 'sms_only');
      // What has to be prepared, not what will be used: a fallback needs its
      // channel ready before anyone knows whether the first one failed.
      const wantsSms = mode !== 'email_only';
      const wantsEmail = mode !== 'sms_only';

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

        const notes: string[] = [];

        // Each channel as a callable, so the policy below can order them and
        // react to what the first one did — the same shape the automatic
        // confirmation uses. fallbackFrom goes into the log, because "why did
        // this parent get an SMS?" has to be answerable from the CRM later.
        const sendSmsChannel = async (fallbackFrom: string | null): Promise<boolean> => {
          if (!sms) return false;
          if (!row.phone) { notes.push('ไม่มีเบอร์โทร'); return false; }
          const rendered = stripUnresolvedTokens(renderSmsTemplate(message, variables));
          const result = await sms.sendMessage(row.phone, rendered);
          if (!result.ok) notes.push(`SMS: ${result.detail ?? 'ส่งไม่สำเร็จ'}`);
          await smsRepo.logSms({
            bookingId, courseId: row.course_id, type: 'reminder', phone: row.phone,
            message: rendered, status: result.ok ? 'sent' : 'failed',
            providerDetail: fallbackFrom
              ? `สำรองจาก${fallbackFrom}${result.detail ? `: ${result.detail}` : ''}`
              : result.detail ?? null,
            sentBy,
          });
          return result.ok;
        };

        const sendEmailChannel = async (fallbackFrom: string | null): Promise<boolean> => {
          if (!emailer || !emailLog) return false;
          const address = (row.parent_email || '').trim();
          if (!address) { notes.push('ไม่มีอีเมล'); return false; }
          const subject = stripUnresolvedTokens(renderEmailSubject(body.emailSubject || 'แจ้งเตือน {{course_name}}', variables));
          const html = wrapEmailHtml(stripUnresolvedTokens(renderEmailTemplate(body.emailBody || '', variables)), emailTheme ?? undefined);
          const result = emailer.isConfigured
            ? await emailer.sendMessage(address, subject, html)
            : { ok: false, detail: 'ยังไม่ได้ตั้งค่า Email Sending', messageId: undefined as string | undefined };
          if (!result.ok) notes.push(`Email: ${result.detail ?? 'ส่งไม่สำเร็จ'}`);
          await emailLog.log({
            bookingId, courseId: row.course_id, type: 'reminder', email: address,
            subject, bodyHtml: html, status: result.ok ? 'sent' : 'failed',
            providerMessageId: result.messageId ?? null,
            providerDetail: fallbackFrom
              ? `สำรองจาก${fallbackFrom}${result.detail ? `: ${result.detail}` : ''}`
              : result.detail ?? null,
            sentBy,
          });
          return result.ok;
        };

        // A failed send counts the same as a missing address: an email that
        // bounces is no more use to the parent than none at all.
        let reached = false;
        switch (mode) {
          case 'both': {
            const byEmail = await sendEmailChannel(null);
            const bySms = await sendSmsChannel(null);
            reached = byEmail || bySms;
            break;
          }
          case 'email_first':
            reached = await sendEmailChannel(null);
            if (!reached) reached = await sendSmsChannel('อีเมล');
            break;
          case 'sms_first':
            reached = await sendSmsChannel(null);
            if (!reached) reached = await sendEmailChannel('SMS');
            break;
          case 'email_only':
            reached = await sendEmailChannel(null);
            break;
          default:
            reached = await sendSmsChannel(null);
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

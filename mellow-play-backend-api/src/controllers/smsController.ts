import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { SmsRepository } from '../repositories/smsRepository';
import { SettingsRepository } from '../repositories/settingsRepository';
import { SmsService } from '../services/smsService';
import { renderSmsTemplate, buildNameVariables, buildLocationVariables, formatThaiDateTime } from '../services/smsTemplateService';
import { sendBookingSuccessNotifications } from '../services/bookingNotificationService';

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
      const { bookingIds, message } = await c.req.json() as { bookingIds: number[]; message: string };
      if (!Array.isArray(bookingIds) || bookingIds.length === 0 || !message?.trim()) {
        return c.json({ success: false, message: 'bookingIds and message required' }, 400);
      }
      const sentBy = c.get('crmUser')?.userId ?? null;
      const smsRepo = new SmsRepository(config.db);
      const settingsRepo = new SettingsRepository(config.db);
      const apiKey = await settingsRepo.getOverridable('sms_api_key', config.smsApiKey);
      const apiSecret = await settingsRepo.getOverridable('sms_api_secret', config.smsApiSecret);
      const senderName = await settingsRepo.getOverridable('sms_sender_name', 'Demo');
      const sms = new SmsService(apiKey, apiSecret, senderName);

      const candidates = await smsRepo.getReminderCandidates({});
      const byId = new Map(candidates.map((row: any) => [row.booking_id, row]));

      let sent = 0;
      const results: Array<{ bookingId: number; ok: boolean; detail?: string }> = [];
      for (const bookingId of bookingIds) {
        const row = byId.get(bookingId);
        if (!row) {
          results.push({ bookingId, ok: false, detail: 'ไม่พบข้อมูลผู้รับ (อาจไม่มีเบอร์โทรหรือถูกยกเลิก)' });
          continue;
        }
        // Same "form answer beats account data" preference as the automatic
        // send (see getFormPreferredNames) — a manual reminder should still
        // address whoever the family actually named as attending.
        const preferred = row.form_submission_id ? await smsRepo.getFormPreferredNames(row.form_submission_id) : {};
        const rendered = renderSmsTemplate(message, {
          ...buildNameVariables(row),
          ...preferred,
          course_name: row.course_name ?? '',
          branch_name: row.branch_name ?? '',
          ...buildLocationVariables(row),
          scheduled_at: formatThaiDateTime(row.scheduled_at),
        });
        const result = await sms.sendMessage(row.phone, rendered);
        if (result.ok) sent++;
        await smsRepo.logSms({
          bookingId, courseId: row.course_id, type: 'reminder', phone: row.phone,
          message: rendered, status: result.ok ? 'sent' : 'failed', providerDetail: result.detail ?? null, sentBy,
        });
        results.push({ bookingId, ok: result.ok, detail: result.detail });
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

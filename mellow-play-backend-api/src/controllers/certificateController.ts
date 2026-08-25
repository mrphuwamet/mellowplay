import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { CertificateRepository } from '../repositories/certificateRepository';
import { SettingsRepository } from '../repositories/settingsRepository';
import { EmailService } from '../services/emailService';
import { EmailLogRepository } from '../repositories/emailLogRepository';
import { wrapEmailHtml, loadEmailTheme } from '../services/emailTemplateService';
import { issueForBooking } from '../services/certificateService';
import { resolveCertificateValues, BUILT_IN_VARIABLES } from '../services/certificateVariables';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

/** The frozen variable map, with the pre-0101 columns as the fallback. */
const safeValues = (cert: any): Record<string, string> => {
  const base = {
    recipient_name: String(cert.recipient_name ?? ""),
    course_name: String(cert.course_name ?? ""),
    event_date: String(cert.event_date ?? ""),
    serial: String(cert.serial ?? ""),
    public_code: String(cert.public_code ?? ""),
  };
  try {
    const parsed = JSON.parse(cert.values_json || "{}");
    return parsed && typeof parsed === "object" ? { ...base, ...parsed } : base;
  } catch {
    // A malformed map costs the extra variables, not the certificate.
    return base;
  }
};

export class CertificateController {
  private repo(c: C) { return new CertificateRepository(new ConfigService(c.env).db); }

  // ── Templates ───────────────────────────────────────────────────────────
  async listTemplates(c: C) {
    try {
      const repo = this.repo(c);
      return c.json({ success: true, templates: await repo.listTemplates(), bindings: await repo.listBindings() });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async createTemplate(c: C) {
    try {
      const body = await c.req.json();
      if (!body.name?.trim()) return c.json({ success: false, message: 'ต้องตั้งชื่อแบบเกียรติบัตร' }, 400);
      const id = await this.repo(c).createTemplate({
        name: body.name.trim(),
        backgroundUrl: body.background_url ?? null,
        pageWidth: body.page_width, pageHeight: body.page_height,
        fieldsJson: body.fields_json,
      });
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async updateTemplate(c: C) {
    try {
      const body = await c.req.json();
      await this.repo(c).updateTemplate(parseInt(c.req.param('id')), {
        name: body.name,
        backgroundUrl: body.background_url ?? null,
        pageWidth: body.page_width, pageHeight: body.page_height,
        fieldsJson: body.fields_json,
      });
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async deleteTemplate(c: C) {
    try {
      await this.repo(c).deactivateTemplate(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async setBinding(c: C) {
    try {
      const { scope, ref_id, template_id } = await c.req.json();
      if (scope !== 'course' && scope !== 'calendar') {
        return c.json({ success: false, message: 'scope must be course or calendar' }, 400);
      }
      await this.repo(c).setBinding(scope, Number(ref_id), template_id == null ? null : Number(template_id));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Issuing ─────────────────────────────────────────────────────────────

  /**
   * Issue for one booking, or for every live booking on a round.
   *
   * Idempotent by way of the one-live-certificate-per-booking index, so the
   * "issue for this round" button can be pressed twice — which it will be, by
   * whoever is not sure the first press worked.
   */
  async issue(c: C) {
    try {
      const config = new ConfigService(c.env);
      const repo = new CertificateRepository(config.db);
      const body = await c.req.json();

      let bookingIds: number[] = [];
      if (Array.isArray(body.booking_ids)) bookingIds = body.booking_ids.map(Number);
      else if (body.booking_id) bookingIds = [Number(body.booking_id)];
      else if (body.course_id && body.slot_date && body.slot_start_time) {
        bookingIds = await repo.bookingIdsForRound(Number(body.course_id), body.slot_date, body.slot_start_time);
      }
      if (bookingIds.length === 0) return c.json({ success: false, message: 'ไม่พบการจองที่จะออกเกียรติบัตร' }, 400);

      const issuedBy = c.get('crmUser')?.userId ?? null;
      let issued = 0;
      let skipped = 0;

      for (const bookingId of bookingIds) {
        const res = await issueForBooking(config.db, {
          bookingId,
          templateId: body.template_id ? Number(body.template_id) : undefined,
          source: 'manual',
          issuedBy,
        });
        if (res.issued) issued++; else skipped++;
      }

      return c.json({ success: true, issued, skipped, total: bookingIds.length });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Email the certificate — as a link, never as an attachment.
   *
   * A link can be reopened, reprinted and forwarded; an attached PDF is one
   * copy that ages in an inbox, and it is also what makes a message look like
   * spam. The link is returned in the response too, so staff can hand it over
   * on LINE for the many families with no email on file — which is the only
   * route that reaches them at all.
   */
  async sendEmail(c: C) {
    try {
      const config = new ConfigService(c.env);
      const repo = new CertificateRepository(config.db);
      const cert = await repo.getWithRecipientEmail(parseInt(c.req.param('id')));
      if (!cert) return c.json({ success: false, message: 'ไม่พบเกียรติบัตรนี้' }, 404);
      if (cert.revoked_at) return c.json({ success: false, message: 'เกียรติบัตรนี้ถูกยกเลิกแล้ว' }, 400);

      const settings = new SettingsRepository(config.db);
      const appUrl = (await settings.getOverridable('consumer_app_url', 'https://mellowplay.co')).replace(/\/+$/, '');
      const link = `${appUrl}/certificate/${cert.public_code}`;

      if (!cert.parent_email) {
        // Not an error: most families have no address on file, and the link is
        // still the useful half of the answer.
        return c.json({ success: true, link, emailStatus: 'skipped', message: 'บัญชีนี้ไม่มีอีเมลในระบบ — ใช้ลิงก์ส่งเองได้' });
      }

      const fromAddress = await settings.getOverridable('email_from_address', 'contact@mellowplay.co');
      const fromName = await settings.getOverridable('email_from_name', 'Mellow Play');
      const replyTo = await settings.getOverridable('email_reply_to', '');
      const mailer = new EmailService(config.emailBinding, fromAddress, fromName, replyTo);

      const subject = `เกียรติบัตร ${cert.course_name || ''} · ${cert.recipient_name}`.trim();
      const body = wrapEmailHtml(
        `<p>สวัสดีค่ะ</p>
         <p>เกียรติบัตรของ <strong>${cert.recipient_name}</strong> จากกิจกรรม
         <strong>${cert.course_name || ''}</strong> พร้อมแล้วค่ะ</p>
         <p><a href="${link}">เปิดเกียรติบัตร</a></p>
         <p>เปิดลิงก์แล้วกด “บันทึกเป็น PDF” เพื่อเก็บไฟล์ไว้ หรือสั่งพิมพ์ได้เลยค่ะ</p>`,
        await loadEmailTheme(settings)
      );

      const result = mailer.isConfigured
        ? await mailer.sendMessage(cert.parent_email, subject, body)
        : { ok: false, detail: 'ยังไม่ได้ตั้งค่า Email Sending', messageId: undefined as string | undefined };

      await new EmailLogRepository(config.db).log({
        bookingId: cert.booking_id ?? null,
        type: 'certificate',
        email: cert.parent_email,
        subject,
        bodyHtml: body,
        status: result.ok ? 'sent' : 'failed',
        providerMessageId: result.messageId ?? null,
        providerDetail: result.detail ?? null,
        sentBy: c.get('crmUser')?.userId ?? null,
      });

      return c.json({
        success: true, link,
        emailStatus: result.ok ? 'sent' : 'failed',
        email: cert.parent_email,
        emailDetail: result.detail ?? null,
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * The variable values for one real booking, for the designer's preview.
   *
   * The same resolver the issuer uses, so what staff arrange against a real
   * family's data is exactly what the printed certificate will carry. A second
   * implementation for previewing would drift, and the drift would only ever
   * be found on paper.
   */
  async previewValues(c: C) {
    try {
      const config = new ConfigService(c.env);
      const bookingId = parseInt(c.req.param('bookingId'));
      const values = await resolveCertificateValues(config.db, bookingId);
      if (Object.keys(values).length === 0) {
        return c.json({ success: false, message: 'ไม่พบการจองนี้' }, 404);
      }
      return c.json({ success: true, values, builtIns: BUILT_IN_VARIABLES });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Recent bookings to preview against, newest first.
   *
   * Bookings that carry a form submission come first: a template that prints
   * form answers looks empty against a booking that has none, which reads as a
   * broken template rather than as an unlucky choice of sample.
   */
  async sampleBookings(c: C) {
    try {
      const config = new ConfigService(c.env);
      const courseId = parseInt(c.req.query('course_id') || '') || null;
      const q = (c.req.query('q') || '').trim();
      const { results } = await config.db.prepare(`
        SELECT b.id, b.scheduled_at, b.form_submission_id,
               COALESCE(NULLIF(hp.nickname, ''), hp.name) AS who,
               co.name AS course_name
          FROM Bookings b
          LEFT JOIN Children ch ON ch.id = b.child_id
          LEFT JOIN HD_Profiles hp ON hp.id = ch.hd_profile_id
          LEFT JOIN Courses co ON co.id = b.course_id
         WHERE b.status != 'cancelled'
           AND (? IS NULL OR b.course_id = ?)
           AND (? = '' OR hp.name LIKE ? OR hp.nickname LIKE ? OR CAST(b.id AS TEXT) = ?)
         ORDER BY (b.form_submission_id IS NULL), b.id DESC
         LIMIT 30
      `).bind(courseId, courseId, q, `%${q}%`, `%${q}%`, q).all();
      return c.json({ success: true, bookings: results });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Everything needed to print a stack of certificates in one go.
   *
   * Returns only bookings that already hold a live certificate, and says how
   * many did not — printing must never quietly issue, because issuing is what
   * assigns a serial number and there is no undoing that from a print dialog.
   */
  async printBatch(c: C) {
    try {
      const config = new ConfigService(c.env);
      const body = await c.req.json();
      const ids = Array.isArray(body.booking_ids) ? body.booking_ids.map(Number) : [];
      if (ids.length === 0) return c.json({ success: false, message: 'ยังไม่ได้เลือกรายการ' }, 400);

      const certificates = await new CertificateRepository(config.db).listForPrinting(ids);
      const found = new Set(certificates.map((x: any) => Number(x.booking_id)));
      return c.json({
        success: true,
        certificates,
        missing: ids.filter((id: number) => !found.has(id)),
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /** Which of these bookings already have one — for the ticks in the CRM list. */
  async listForBookings(c: C) {
    try {
      const body = await c.req.json();
      const ids = Array.isArray(body.booking_ids) ? body.booking_ids.map(Number) : [];
      return c.json({ success: true, certificates: await this.repo(c).listForBookings(ids) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async revoke(c: C) {
    try {
      const { reason } = await c.req.json().catch(() => ({ reason: null }));
      await this.repo(c).revoke(parseInt(c.req.param('id')), reason ?? null);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Public ──────────────────────────────────────────────────────────────

  /**
   * One certificate, by the code in its URL — this is what the printable page
   * and the verification page both read.
   *
   * Returns only what is already printed on the certificate itself. A code that
   * leaks should reveal nothing a photograph of the page would not.
   */
  async getPublic(c: C) {
    try {
      const repo = this.repo(c);
      const cert = await repo.getByPublicCode(c.req.param('code'));
      if (!cert) return c.json({ success: false, message: 'ไม่พบเกียรติบัตรนี้' }, 404);

      const template = cert.template_id ? await repo.getTemplate(cert.template_id) : null;
      return c.json({
        success: true,
        certificate: {
          recipient_name: cert.recipient_name,
          course_name: cert.course_name,
          event_date: cert.event_date,
          serial: cert.serial,
          public_code: cert.public_code,
          issued_at: cert.issued_at,
          revoked: !!cert.revoked_at,
          // Rows issued before values_json existed fall back to the three
          // columns below, which is all their templates could reference.
          values: safeValues(cert),
        },
        template: template ? {
          background_url: template.background_url,
          page_width: template.page_width,
          page_height: template.page_height,
          fields_json: template.fields_json,
        } : null,
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /** A family's own certificates, for the app. */
  async listMine(c: C) {
    try {
      const userId = parseInt(c.req.query('userId') || '');
      if (!userId) return c.json({ success: false, message: 'userId is required' }, 400);
      return c.json({ success: true, certificates: await this.repo(c).listForUser(userId) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { CertificateRepository } from '../repositories/certificateRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

// Ambiguous characters left out on purpose (0/O, 1/I/L): a code gets read off a
// printed page and typed in by hand at least some of the time.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Random, not sequential. A running number in the URL would turn one shared
 * certificate into a directory of everyone who attended, since the next code
 * along is always a guess away.
 */
const generatePublicCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
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
      const year = new Date().getFullYear() + 543; // ปีพุทธศักราช, which is what goes on the page
      let issued = 0;
      let skipped = 0;

      for (const bookingId of bookingIds) {
        const src = await repo.getIssueSource(bookingId);
        if (!src) { skipped++; continue; }

        const templateId = body.template_id
          ? Number(body.template_id)
          : await repo.resolveTemplateId(Number(src.course_id));

        // Nickname first: it is the name a child is called and the one a family
        // expects to see. The full name is the fallback, never a blank.
        const recipient = String(src.child_nickname || src.child_name || '').trim() || 'ผู้เข้าร่วมกิจกรรม';

        const created = await repo.issue({
          templateId,
          bookingId,
          childId: src.child_id ?? null,
          userId: src.user_id ?? null,
          recipientName: recipient,
          courseName: src.course_name ?? null,
          eventDate: src.scheduled_at ? String(src.scheduled_at).slice(0, 10) : null,
          serial: await repo.nextSerial(year),
          publicCode: generatePublicCode(),
          issuedBy,
        });
        if (created) issued++; else skipped++;
      }

      return c.json({ success: true, issued, skipped, total: bookingIds.length });
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

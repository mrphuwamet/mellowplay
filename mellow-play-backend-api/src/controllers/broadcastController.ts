import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { BroadcastRepository, AudienceFilter } from '../repositories/broadcastRepository';
import { drainBroadcasts } from '../services/broadcastSender';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

const CHANNELS = ['email', 'sms', 'both'];

const parseAudience = (raw: any): AudienceFilter => ({
  marketingConsent: !!raw?.marketingConsent,
  allMembers: !!raw?.allMembers,
  hasBooking: !!raw?.hasBooking,
  hasReport: !!raw?.hasReport,
  // Anything but an explicit 'all' means 'any', so a campaign saved before
  // this field existed keeps reaching exactly who it reached before.
  matchMode: raw?.matchMode === 'all' ? 'all' : 'any',
  courseIds: Array.isArray(raw?.courseIds)
    ? raw.courseIds.map((n: any) => parseInt(n)).filter(Number.isInteger)
    : undefined,
});

export class BroadcastController {
  private repo(c: C) { return new BroadcastRepository(new ConfigService(c.env).db); }

  async list(c: C) {
    try {
      return c.json({ success: true, broadcasts: await this.repo(c).list() });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async get(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const repo = this.repo(c);
      const broadcast = await repo.findById(id);
      if (!broadcast) return c.json({ success: false, message: 'ไม่พบแคมเปญนี้' }, 404);
      return c.json({ success: true, broadcast, recipients: await repo.recipients(id) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /** How many people a set of filters currently reaches — shown before launch. */
  async previewAudience(c: C) {
    try {
      const body = await c.req.json();
      const members = await this.repo(c).resolveAudience(parseAudience(body.audience));
      return c.json({
        success: true,
        total: members.length,
        withEmail: members.filter(m => m.email?.trim()).length,
        withPhone: members.filter(m => m.phone?.trim()).length,
        sample: members.slice(0, 10).map(m => ({ name: m.name, email: m.email, phone: m.phone })),
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async create(c: C) {
    try {
      const body = await c.req.json();
      if (!body.name) return c.json({ success: false, message: 'กรุณาตั้งชื่อแคมเปญ' }, 400);
      const channel = CHANNELS.includes(body.channel) ? body.channel : 'email';
      const id = await this.repo(c).create({
        name: body.name,
        channel,
        subject: body.subject,
        bodyHtml: body.bodyHtml,
        smsMessage: body.smsMessage,
        audience: parseAudience(body.audience),
        createdBy: c.get('jwtPayload')?.userId ?? null,
      });
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async update(c: C) {
    try {
      const body = await c.req.json();
      if (!body.name) return c.json({ success: false, message: 'กรุณาตั้งชื่อแคมเปญ' }, 400);
      await this.repo(c).update(parseInt(c.req.param('id')), {
        name: body.name,
        channel: CHANNELS.includes(body.channel) ? body.channel : 'email',
        subject: body.subject,
        bodyHtml: body.bodyHtml,
        smsMessage: body.smsMessage,
        audience: parseAudience(body.audience),
      });
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async remove(c: C) {
    try {
      await this.repo(c).remove(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Freezes the audience and hands the campaign to the cron drain.
   *
   * Nothing is sent in this request on purpose — see broadcastSender. The
   * response tells staff how many rows were queued so the screen can show a
   * real number instead of "started".
   */
  async launch(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const repo = this.repo(c);
      const broadcast = await repo.findById(id);
      if (!broadcast) return c.json({ success: false, message: 'ไม่พบแคมเปญนี้' }, 404);
      if (broadcast.status !== 'draft') {
        return c.json({ success: false, message: 'แคมเปญนี้ส่งไปแล้ว' }, 409);
      }

      let audience: AudienceFilter = {};
      try { audience = JSON.parse(broadcast.audience_json || '{}'); } catch { /* empty filter reaches nobody, handled below */ }
      const members = await repo.resolveAudience(audience);
      const queued = await repo.launch(id, members);
      if (queued === 0) {
        return c.json({ success: false, message: 'ไม่มีผู้รับที่ตรงเงื่อนไข (หรือไม่มีอีเมล/เบอร์โทรให้ส่ง)' }, 400);
      }
      return c.json({ success: true, queued });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async cancel(c: C) {
    try {
      await this.repo(c).cancel(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /** Manual "send the next batch now" — the cron does this on its own schedule. */
  async drainNow(c: C) {
    try {
      const config = new ConfigService(c.env);
      return c.json({ success: true, ...(await drainBroadcasts(config.db, config)) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Public ───────────────────────────────────────────────────────────────

  /**
   * Unsubscribe. No auth: the token IS the credential, and requiring a login
   * to stop marketing mail is the kind of friction that gets a sender reported
   * as spam instead.
   */
  async unsubscribe(c: C) {
    try {
      const token = c.req.param('token');
      const ok = await this.repo(c).unsubscribeByToken(token);
      if (!ok) return c.json({ success: false, message: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว' }, 404);
      return c.json({ success: true, message: 'ยกเลิกรับข่าวสารเรียบร้อยแล้ว' });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { AuthService } from '../services/authService';
import { CheckinAccessLinkRepository, isCheckinLinkUsable } from '../repositories/checkinAccessLinkRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

const SESSION_SECONDS = 60 * 60 * 24; // 24h — a device that entered the PIN once doesn't need it again until this lapses

export class CheckinAccessController {
  private repo(c: C) { return new CheckinAccessLinkRepository(new ConfigService(c.env).db); }

  async create(c: C) {
    try {
      const { label, pin, expiresAt } = await c.req.json();
      if (!pin || !/^\d{4,8}$/.test(pin)) return c.json({ success: false, message: 'PIN ต้องเป็นตัวเลข 4-8 หลัก' }, 400);
      const crmUserId = c.get('crmUser')?.userId ?? null;
      const { id, token } = await this.repo(c).create(label?.trim() || null, pin, expiresAt || null, crmUserId);
      return c.json({ success: true, id, token });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async list(c: C) {
    try {
      return c.json({ success: true, links: await this.repo(c).list() });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async revoke(c: C) {
    try {
      await this.repo(c).revoke(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // Public (see ADMIN_PUBLIC_ROUTES in index.ts) — the PIN itself is the
  // credential, since whoever holds this link isn't a CRM user at all. On
  // success we issue a session token good for 24h so a volunteer's device
  // doesn't need to re-enter the PIN on every visit within that window.
  async verifyPin(c: C) {
    try {
      const token = c.req.param('token');
      const { pin } = await c.req.json();
      const link = await this.repo(c).findByToken(token);
      if (!isCheckinLinkUsable(link)) return c.json({ success: false, message: 'ลิงก์นี้ถูกยกเลิกหรือหมดอายุแล้ว' }, 403);

      const valid = await AuthService.verifyPassword(pin || '', link!.pin_hash);
      if (!valid) return c.json({ success: false, message: 'PIN ไม่ถูกต้อง' }, 401);

      const config = new ConfigService(c.env);
      const sessionToken = await AuthService.generateTokenWithExpiry(
        { type: 'checkin_access', linkId: link!.id }, config.jwtSecret, SESSION_SECONDS
      );
      return c.json({ success: true, sessionToken, label: link!.label, expiresIn: SESSION_SECONDS });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

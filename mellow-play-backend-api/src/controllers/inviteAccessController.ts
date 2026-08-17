import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { AuthService } from '../services/authService';
import { InviteAccessLinkRepository, isInviteLinkUsable, isInviteLinkOpen, InviteAccessLink } from '../repositories/inviteAccessLinkRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

const SESSION_SECONDS = 60 * 60 * 24; // 24h — same window as checkin-access sessions

export class InviteAccessController {
  private repo(c: C) { return new InviteAccessLinkRepository(new ConfigService(c.env).db); }

  async create(c: C) {
    try {
      const { label, pin, courseId, calendarSlotRuleId, expiresAt } = await c.req.json();
      // A PIN is optional now: an invite sent to one family in a private chat
      // is already a secret, and asking them to also type a code was a step
      // that only ever lost people. Given one, it must still be a real one.
      const trimmedPin = (pin ?? '').toString().trim();
      if (trimmedPin && !/^\d{4,8}$/.test(trimmedPin)) {
        return c.json({ success: false, message: 'ถ้าตั้งรหัสผ่าน ต้องเป็นตัวเลข 4-8 หลัก' }, 400);
      }
      if (!courseId || !calendarSlotRuleId) return c.json({ success: false, message: 'courseId และ calendarSlotRuleId จำเป็นต้องระบุ' }, 400);
      const crmUserId = c.get('crmUser')?.userId ?? null;
      const { id, token, shortCode } = await this.repo(c).create(
        label?.trim() || null, trimmedPin || null, parseInt(courseId), parseInt(calendarSlotRuleId), expiresAt || null, crmUserId
      );
      return c.json({ success: true, id, token, shortCode });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async listForRule(c: C) {
    try {
      const calendarSlotRuleId = parseInt(c.req.query('calendarSlotRuleId') || '');
      if (!calendarSlotRuleId) return c.json({ success: false, message: 'calendarSlotRuleId is required' }, 400);
      return c.json({ success: true, links: await this.repo(c).listForRule(calendarSlotRuleId) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async revoke(c: C) {
    try {
      await this.repo(c).revoke(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * What the link is, before anyone types anything.
   *
   * Public, and deliberately thin: whether a PIN is needed, and which course it
   * opens. A link with no PIN can then take the guest straight to the booking
   * page instead of showing them an empty box to fill in.
   */
  async info(c: C) {
    try {
      const token = c.req.param('token');
      const link = await this.repo(c).findByToken(token);
      if (!isInviteLinkUsable(link)) return c.json({ success: false, message: 'ลิงก์นี้ถูกยกเลิกหรือหมดอายุแล้ว' }, 403);

      const config = new ConfigService(c.env);
      const course = await config.db.prepare('SELECT name FROM Courses WHERE id = ?').bind(link!.course_id).first() as any;
      return c.json({
        success: true,
        requiresPin: !isInviteLinkOpen(link),
        label: link!.label,
        courseId: link!.course_id,
        courseName: course?.name || null,
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // Public (see ADMIN_PUBLIC_ROUTES in index.ts) — the PIN itself is the
  // credential, since whoever holds this link is a guest, not a CRM user.
  // On success returns a session token (used to unlock the extra capacity
  // on this exact course+round — see resolveInviteBoostRuleId below) plus
  // courseId so the consumer app can deep-link straight into booking it.
  async verifyPin(c: C) {
    try {
      const token = c.req.param('token');
      const { pin } = await c.req.json();
      const link = await this.repo(c).findByToken(token);
      if (!isInviteLinkUsable(link)) return c.json({ success: false, message: 'ลิงก์นี้ถูกยกเลิกหรือหมดอายุแล้ว' }, 403);

      // An open link hands out the session without a check; a protected one is
      // verified as before. The empty hash is never compared against anything.
      if (!isInviteLinkOpen(link)) {
        const valid = await AuthService.verifyPassword(pin || '', link!.pin_hash);
        if (!valid) return c.json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' }, 401);
      }

      const config = new ConfigService(c.env);
      const course = await config.db.prepare('SELECT name FROM Courses WHERE id = ?').bind(link!.course_id).first() as any;
      const sessionToken = await AuthService.generateTokenWithExpiry(
        { type: 'invite_access', linkId: link!.id }, config.jwtSecret, SESSION_SECONDS
      );
      return c.json({
        success: true, sessionToken, label: link!.label, expiresIn: SESSION_SECONDS,
        courseId: link!.course_id, courseName: course?.name || null,
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

// Shared by calendarController (availability display) and adminController
// (booking-time capacity check) — resolves an invite session token down to
// the one calendar_slot_rule_id it's allowed to boost, or null if missing/
// invalid/revoked/expired. courseId is checked too so a session can't boost
// capacity for a course it was never issued for, even if by coincidence its
// rule_id collided with another course's round.
export async function resolveInviteBoostRuleId(
  sessionToken: string | undefined, courseId: number | undefined, db: D1Database, jwtSecret: string
): Promise<number | null> {
  if (!sessionToken || !courseId) return null;
  const payload = await AuthService.verifyToken(sessionToken, jwtSecret);
  if (!payload || payload.type !== 'invite_access') return null;
  const link = await new InviteAccessLinkRepository(db).findById(payload.linkId) as InviteAccessLink | null;
  if (!isInviteLinkUsable(link) || link!.course_id !== courseId) return null;
  return link!.calendar_slot_rule_id;
}

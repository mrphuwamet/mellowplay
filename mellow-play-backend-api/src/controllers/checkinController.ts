import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { CheckinRepository } from '../repositories/checkinRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

export class CheckinController {
  private repo(c: C) { return new CheckinRepository(new ConfigService(c.env).db); }

  async getActions(c: C) {
    try {
      const courseId = parseInt(c.req.param('id'));
      return c.json({ success: true, actions: await this.repo(c).getActionsForCourse(courseId) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async saveActions(c: C) {
    try {
      const courseId = parseInt(c.req.param('id'));
      const { actions } = await c.req.json();
      if (!Array.isArray(actions)) return c.json({ success: false, message: 'actions must be an array' }, 400);
      await this.repo(c).saveActionsForCourse(courseId, actions.filter(a => a?.label?.trim()));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // Scanned by the in-CRM camera scanner — token comes straight off the QR,
  // no other auth on the attendee's side needed since the token itself is
  // the unguessable credential (same trust model as a password-reset link).
  async lookup(c: C) {
    try {
      const token = c.req.param('token');
      const result = await this.repo(c).lookupByToken(token);
      if (!result) return c.json({ success: false, message: 'ไม่พบข้อมูลการจองสำหรับ QR นี้' }, 404);
      return c.json({ success: true, booking: result });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async toggleAction(c: C) {
    try {
      const bookingId = parseInt(c.req.param('bookingId'));
      const actionId = parseInt(c.req.param('actionId'));
      const checkedByCrmUserId = c.get('crmUser')?.userId ?? null;
      const checked = await this.repo(c).toggleAction(bookingId, actionId, checkedByCrmUserId);
      return c.json({ success: true, checked });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

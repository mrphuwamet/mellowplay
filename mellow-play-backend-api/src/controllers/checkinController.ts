import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { CheckinRepository } from '../repositories/checkinRepository';
import { AuthService } from '../services/authService';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

// True when the caller is CRM staff or holds a check-in access link — the two
// audiences that work the door and need the parent's contact details. Anyone
// else (a parent opening the QR link from their email, or whoever they
// forwarded it to) is not one of them. Returns false rather than throwing on a
// bad token: an unreadable token is simply not staff.
async function isStaffRequest(c: C): Promise<boolean> {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return false;
  try {
    const payload = await AuthService.verifyToken(token, new ConfigService(c.env).jwtSecret);
    return payload?.type === 'admin' || payload?.type === 'checkin_access';
  } catch {
    return false;
  }
}

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

      // This route is reachable without a login so the QR button in a
      // confirmation email works (the token is the credential). Staff scanning
      // at the door need the parent's name and phone to sort out a mismatch;
      // the emailed page shows none of it, and an emailed link gets forwarded
      // — so whoever merely holds the token gets the booking, not the family's
      // contact details.
      //
      // The token is verified here rather than read off the context: this is
      // in ADMIN_PUBLIC_ROUTES now, and requireCrmAuth returns early on those
      // without ever setting crmUser, so trusting the context would strip the
      // fields from the scanner too.
      if (!(await isStaffRequest(c))) {
        const { parent_first_name, parent_last_name, parent_phone, ...publicBooking } = result;
        return c.json({ success: true, booking: publicBooking });
      }
      return c.json({ success: true, booking: result });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async searchByPhone(c: C) {
    try {
      const phone = c.req.param('phone');
      const bookings = await this.repo(c).searchByPhone(phone);
      return c.json({ success: true, bookings });
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

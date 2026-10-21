import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { quoteBooking } from '../services/pricingService';

/**
 * What a booking would cost, before anyone commits to it.
 *
 * The screen that shows the amount and the code that charges it run the same
 * function, so the figure on the button is the figure Beam is handed. Nothing
 * here accepts a total from the caller — a price arriving from a browser is
 * a price somebody can edit.
 */
export class PricingController {
  /** The parent's own preview. Only their own family can be priced. */
  async quoteForParent(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const payload = c.get('jwtPayload');
    if (!payload?.userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

    const body = await c.req.json().catch(() => ({}));
    const requested = (body.childIds || []).map((id: any) => parseInt(id) || 0);

    const config = new ConfigService(c.env);

    // A quote reveals whether a child holds a Premium membership, by price.
    // Restricting it to the caller's own roster keeps that from being a way
    // to ask about somebody else's family. Guests (ids <= 0) have no roster
    // row to own and pass through.
    const realIds = requested.filter((id: number) => id > 0);
    let allowed = realIds;
    if (realIds.length > 0) {
      const { results } = await config.db.prepare(
        `SELECT id FROM Children WHERE parent_id = ? AND id IN (${realIds.map(() => '?').join(',')})`
      ).bind(payload.userId, ...realIds).all();
      const owned = new Set((results as any[]).map((r) => Number(r.id)));
      allowed = realIds.filter((id: number) => owned.has(id));
      if (allowed.length !== realIds.length) {
        return c.json({ success: false, message: 'มีผู้เข้าร่วมที่ไม่ได้อยู่ในบัญชีนี้' }, 403);
      }
    }
    const childIds = requested.filter((id: number) => id <= 0).concat(allowed);

    return this.respond(c, { ...body, childIds });
  }

  /** The CRM's preview while staff build a booking on someone's behalf. */
  async quoteForStaff(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const body = await c.req.json().catch(() => ({}));
    return this.respond(c, body);
  }

  private async respond(c: Context<{ Bindings: Bindings; Variables: Variables }>, body: any) {
    try {
      const config = new ConfigService(c.env);
      const courseId = parseInt(body.courseId);
      if (!courseId) return c.json({ success: false, message: 'courseId required' }, 400);

      const quote = await quoteBooking(config.db, {
        courseId,
        childIds: (body.childIds || []).map((id: any) => parseInt(id) || 0),
        ageGroup: body.ageGroup ?? null,
        formId: body.formId ? parseInt(body.formId) : null,
        formAnswers: body.formAnswers ?? null,
        promoCode: body.promoCode ?? null,
      });

      return c.json({ success: true, quote });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }
}

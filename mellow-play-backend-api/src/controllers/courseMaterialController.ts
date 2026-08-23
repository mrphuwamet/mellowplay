import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { CourseMaterialRepository } from '../repositories/courseMaterialRepository';
import { awardParticipation } from '../services/stampService';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

export class CourseMaterialController {
  private repo(c: C) { return new CourseMaterialRepository(new ConfigService(c.env).db); }

  async getMaterials(c: C) {
    try {
      const courseId = parseInt(c.req.param('courseId'));
      return c.json({ success: true, materials: await this.repo(c).getMaterials(courseId) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async upsertMaterial(c: C) {
    try {
      const courseId = parseInt(c.req.param('courseId'));
      const { productId, quantity, unit, note } = await c.req.json();
      if (!productId || !quantity) return c.json({ success: false, message: 'productId and quantity required' }, 400);
      await this.repo(c).upsertMaterial(courseId, productId, quantity, unit, note);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async deleteMaterial(c: C) {
    try {
      await this.repo(c).deleteMaterial(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async completeClass(c: C) {
    try {
      const bookingId = parseInt(c.req.param('bookingId'));
      const config = new ConfigService(c.env);
      await this.repo(c).deductStock(bookingId);
      await config.db.prepare("UPDATE Bookings SET status='completed' WHERE id=?").bind(bookingId).run();

      // One collection stamp for the item, the item's points, and the
      // participation medal if it grants one. A no-op if the child was already
      // stamped at check-in.
      await awardParticipation(config.db, {
        bookingId,
        source: 'completion',
        actorId: c.get('crmUser')?.userId ?? null,
      });

      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async cancelBooking(c: C) {
    try {
      const bookingId = parseInt(c.req.param('bookingId'));
      const config = new ConfigService(c.env);
      
      const booking = await config.db.prepare(
        'SELECT child_id, age_group, payment_status, status, branch_id FROM Bookings WHERE id=?'
      ).bind(bookingId).first() as any;

      if (booking && booking.status !== 'cancelled') {
        const childId = booking.child_id;
        if (childId > 0) {
          const ag = booking.age_group || 'junior';
          const couponColumn = ag === 'little_junior' ? 'little_junior_balance' : 'junior_balance';
          
          await config.db.prepare(`
            UPDATE Member_Coupons 
            SET ${couponColumn} = ${couponColumn} + 1, updated_at = CURRENT_TIMESTAMP 
            WHERE child_id = ?
          `).bind(childId).run();
          
          const userIdQuery = await config.db.prepare('SELECT parent_id FROM Children WHERE id=?').bind(childId).first() as any;
          const userId = userIdQuery?.parent_id ?? null;
          
          await config.db.prepare(`
            INSERT INTO Transactions (branch_id, user_id, child_id, type, amount, payment_method, item_type, booking_id)
            VALUES (?, ?, ?, 'refund_booking', 0, 'coupon', ?, ?)
          `).bind(booking.branch_id || 1, userId, childId, ag, bookingId).run();
        }
      }

      await this.repo(c).releaseStock(bookingId);
      await config.db.prepare("UPDATE Bookings SET status='cancelled', cancelled_at=COALESCE(cancelled_at, datetime('now')) WHERE id=?").bind(bookingId).run();
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

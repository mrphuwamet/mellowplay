import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { CourseMaterialRepository } from '../repositories/courseMaterialRepository';

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
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async cancelBooking(c: C) {
    try {
      const bookingId = parseInt(c.req.param('bookingId'));
      const config = new ConfigService(c.env);
      await this.repo(c).releaseStock(bookingId);
      await config.db.prepare("UPDATE Bookings SET status='cancelled' WHERE id=?").bind(bookingId).run();
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

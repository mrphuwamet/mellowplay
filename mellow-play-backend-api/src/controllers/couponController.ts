import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';

export class CouponController {
  // --- Coupon Types ---
  async getCouponTypes(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { results } = await config.db.prepare(`
        SELECT * FROM CouponTypes ORDER BY id ASC
      `).all();
      return c.json({ success: true, couponTypes: results });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async createCouponType(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const body = await c.req.json();
      const { name, color, icon_url } = body;
      
      const { success } = await config.db.prepare(`
        INSERT INTO CouponTypes (name, color, icon_url)
        VALUES (?, ?, ?)
      `).bind(name, color || '#A78BFA', icon_url || null).run();
      
      if (!success) throw new Error('Failed to create coupon type');
      return c.json({ success: true, message: 'Coupon type created' });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateCouponType(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = c.req.param('id');
      const body = await c.req.json();
      const { name, color, icon_url } = body;
      
      const { success } = await config.db.prepare(`
        UPDATE CouponTypes
        SET name = ?, color = ?, icon_url = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(name, color, icon_url, id).run();
      
      if (!success) throw new Error('Failed to update coupon type');
      return c.json({ success: true, message: 'Coupon type updated' });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deleteCouponType(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const transferTo = c.req.query('transferTo');

      // Check usage
      const courseCountResult = await config.db.prepare(`SELECT COUNT(*) as count FROM CourseCoupons WHERE coupon_type_id = ?`).bind(id).first() as any;
      const childCountResult = await config.db.prepare(`SELECT COUNT(*) as count FROM ChildCoupons WHERE coupon_type_id = ?`).bind(id).first() as any;
      const userCountResult = await config.db.prepare(`SELECT COUNT(*) as count FROM User_Coupons WHERE type_id = ?`).bind(id.toString()).first() as any;

      const courseCount = courseCountResult?.count || 0;
      const childCount = childCountResult?.count || 0;
      const userCount = userCountResult?.count || 0;

      const totalUsage = courseCount + childCount + userCount;

      if (totalUsage > 0 && !transferTo) {
        return c.json({ 
          success: false, 
          message: `Coupon is in use (Courses: ${courseCount}, Children: ${childCount}, Users: ${userCount}). Please select a coupon to transfer data to before deleting.`,
          usage: { courseCount, childCount, userCount }
        }, 400);
      }

      if (transferTo && parseInt(transferTo) !== id) {
        const toId = parseInt(transferTo);
        const toIdStr = transferTo;

        // Transfer CourseCoupons: update or ignore, then delete remaining
        await config.db.prepare(`UPDATE OR IGNORE CourseCoupons SET coupon_type_id = ? WHERE coupon_type_id = ?`).bind(toId, id).run();
        await config.db.prepare(`DELETE FROM CourseCoupons WHERE coupon_type_id = ?`).bind(id).run();

        // Transfer ChildCoupons: sum balances if both exist, else update
        const conflicts = await config.db.prepare(`SELECT child_id, balance FROM ChildCoupons WHERE coupon_type_id = ?`).bind(id).all();
        for (const row of conflicts.results) {
           const childId = row.child_id;
           const balance = row.balance;
           const existing = await config.db.prepare(`SELECT balance FROM ChildCoupons WHERE child_id = ? AND coupon_type_id = ?`).bind(childId, toId).first() as any;
           if (existing) {
             await config.db.prepare(`UPDATE ChildCoupons SET balance = balance + ? WHERE child_id = ? AND coupon_type_id = ?`).bind(balance, childId, toId).run();
             await config.db.prepare(`DELETE FROM ChildCoupons WHERE child_id = ? AND coupon_type_id = ?`).bind(childId, id).run();
           } else {
             await config.db.prepare(`UPDATE ChildCoupons SET coupon_type_id = ? WHERE child_id = ? AND coupon_type_id = ?`).bind(toId, childId, id).run();
           }
        }

        // Transfer User_Coupons
        await config.db.prepare(`UPDATE User_Coupons SET type_id = ? WHERE type_id = ?`).bind(toIdStr, id.toString()).run();
      }

      const { success } = await config.db.prepare(`
        DELETE FROM CouponTypes WHERE id = ?
      `).bind(id).run();
      
      if (!success) throw new Error('Failed to delete coupon type');
      return c.json({ success: true, message: 'Coupon type deleted' });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // --- Course Coupons ---
  async getCourseCoupons(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const courseId = c.req.param('courseId');
      const { results } = await config.db.prepare(`
        SELECT cc.quantity_required, ct.*
        FROM CourseCoupons cc
        JOIN CouponTypes ct ON cc.coupon_type_id = ct.id
        WHERE cc.course_id = ?
      `).bind(courseId).all();
      return c.json({ success: true, courseCoupons: results });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateCourseCoupons(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const courseId = c.req.param('courseId');
      const body = await c.req.json();
      const { coupons } = body; // Array of { coupon_type_id, quantity_required }

      // Delete existing
      await config.db.prepare(`DELETE FROM CourseCoupons WHERE course_id = ?`).bind(courseId).run();
      
      // Insert new ones
      for (const coupon of coupons) {
        await config.db.prepare(`
          INSERT INTO CourseCoupons (course_id, coupon_type_id, quantity_required)
          VALUES (?, ?, ?)
        `).bind(courseId, coupon.coupon_type_id, coupon.quantity_required || 1).run();
      }
      
      return c.json({ success: true, message: 'Course coupons updated' });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // --- Child Coupons ---
  async getChildCoupons(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const childId = c.req.param('childId');
      
      const { results } = await config.db.prepare(`
        SELECT cc.balance, ct.*
        FROM ChildCoupons cc
        JOIN CouponTypes ct ON cc.coupon_type_id = ct.id
        WHERE cc.child_id = ?
      `).bind(childId).all();
      
      return c.json({ success: true, childCoupons: results });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateChildCouponBalance(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const childId = c.req.param('childId');
      const couponTypeId = c.req.param('couponTypeId');
      const body = await c.req.json();
      const { amount } = body; // Can be positive to add, negative to deduct, or absolute if setting directly? 
      const { type } = body; // 'add', 'deduct', 'set'
      
      let currentBalance = 0;
      const existing = await config.db.prepare(`SELECT balance FROM ChildCoupons WHERE child_id = ? AND coupon_type_id = ?`).bind(childId, couponTypeId).first();
      
      if (existing) {
         currentBalance = existing.balance as number;
      }
      
      let newBalance = currentBalance;
      if (type === 'add') newBalance += amount;
      else if (type === 'deduct') newBalance = Math.max(0, newBalance - amount);
      else if (type === 'set') newBalance = amount;
      
      if (existing) {
        await config.db.prepare(`
          UPDATE ChildCoupons SET balance = ?, updated_at = CURRENT_TIMESTAMP
          WHERE child_id = ? AND coupon_type_id = ?
        `).bind(newBalance, childId, couponTypeId).run();
      } else {
        await config.db.prepare(`
          INSERT INTO ChildCoupons (child_id, coupon_type_id, balance)
          VALUES (?, ?, ?)
        `).bind(childId, couponTypeId, newBalance).run();
      }
      
      return c.json({ success: true, newBalance });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }
}

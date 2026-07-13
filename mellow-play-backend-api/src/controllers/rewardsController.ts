import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';

export class RewardsController {
  
  // ================= CONSUMER API =================
  async getAvailableRewards(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { results } = await config.db.prepare(`
        SELECT id, name, description, image_url, stamp_cost, stock 
        FROM Rewards 
        WHERE is_active = 1 AND stock > 0
        ORDER BY stamp_cost ASC
      `).all();
      return c.json({ success: true, rewards: results });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async redeemReward(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { childId, rewardId } = await c.req.json();
      
      // 1. Get Reward info
      const reward = await config.db.prepare(`SELECT * FROM Rewards WHERE id = ?`).bind(rewardId).first<any>();
      if (!reward || reward.stock <= 0 || !reward.is_active) {
        return c.json({ success: false, message: 'Reward is not available' }, 400);
      }

      // 2. Get Child Coupon balance (assuming coupon_type_id = 1 for stamps)
      const childCoupon = await config.db.prepare(`SELECT * FROM ChildCoupons WHERE child_id = ? AND coupon_type_id = 1`).bind(childId).first<any>();
      if (!childCoupon || childCoupon.balance < reward.stamp_cost) {
        return c.json({ success: false, message: 'Insufficient stamps' }, 400);
      }

      // 3. Perform redemption transaction
      const claimCode = 'RWD-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      
      const batch = await config.db.batch([
        config.db.prepare(`UPDATE Rewards SET stock = stock - 1 WHERE id = ?`).bind(rewardId),
        config.db.prepare(`UPDATE ChildCoupons SET balance = balance - ? WHERE child_id = ? AND coupon_type_id = 1`).bind(reward.stamp_cost, childId),
        config.db.prepare(`
          INSERT INTO Redemptions (child_id, reward_id, reward_name, stamp_cost, status, claim_code) 
          VALUES (?, ?, ?, ?, 'pending', ?)
        `).bind(childId, rewardId, reward.name, reward.stamp_cost, claimCode)
      ]);

      return c.json({ success: true, claimCode });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ================= ADMIN (CRM) API =================
  async getAllRewards(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { results } = await config.db.prepare(`SELECT * FROM Rewards ORDER BY created_at DESC`).all();
      return c.json({ success: true, rewards: results });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async createReward(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { name, description, image_url, stamp_cost, stock } = await c.req.json();
      
      const result = await config.db.prepare(`
        INSERT INTO Rewards (name, description, image_url, stamp_cost, stock, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
      `).bind(name, description, image_url, stamp_cost, stock).run();

      return c.json({ success: true, rewardId: result.meta.last_row_id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateReward(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const { name, description, image_url, stamp_cost, stock, is_active } = await c.req.json();

      await config.db.prepare(`
        UPDATE Rewards 
        SET name = ?, description = ?, image_url = ?, stamp_cost = ?, stock = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(name, description, image_url, stamp_cost, stock, is_active ? 1 : 0, id).run();

      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deleteReward(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      await config.db.prepare(`DELETE FROM Rewards WHERE id = ?`).bind(id).run();
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }
}

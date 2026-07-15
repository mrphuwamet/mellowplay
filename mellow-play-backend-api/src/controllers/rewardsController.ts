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

      // 2. Sweep any stamps that have quietly passed their expiry, then take
      // the oldest available stamps (FIFO) to cover this reward's cost.
      await config.db.prepare(`
        UPDATE Stamps SET status = 'expired'
        WHERE child_id = ? AND status = 'available' AND expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
      `).bind(childId).run();

      const { results: spendStamps } = await config.db.prepare(`
        SELECT id FROM Stamps WHERE child_id = ? AND status = 'available'
        ORDER BY earned_at ASC, id ASC LIMIT ?
      `).bind(childId, reward.stamp_cost).all<any>();

      if (spendStamps.length < reward.stamp_cost) {
        return c.json({ success: false, message: 'Insufficient stamps' }, 400);
      }

      // 3. Perform redemption transaction
      const claimCode = 'RWD-' + Math.random().toString(36).substring(2, 8).toUpperCase();

      const redemptionResult = await config.db.prepare(`
        INSERT INTO Redemptions (child_id, reward_id, reward_name, stamp_cost, status, claim_code)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `).bind(childId, rewardId, reward.name, reward.stamp_cost, claimCode).run();
      const redemptionId = redemptionResult.meta.last_row_id;

      await config.db.batch([
        config.db.prepare(`UPDATE Rewards SET stock = stock - 1 WHERE id = ?`).bind(rewardId),
        ...spendStamps.map((s: any) =>
          config.db.prepare(`UPDATE Stamps SET status = 'used', used_at = CURRENT_TIMESTAMP, redemption_id = ? WHERE id = ?`)
            .bind(redemptionId, s.id)
        ),
      ]);

      return c.json({ success: true, claimCode });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ================= STAMPS (CONSUMER API) =================
  async getChildStamps(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const childId = parseInt(c.req.param('childId'));

      // Lazily expire any stamps that have quietly passed their expiry date.
      await config.db.prepare(`
        UPDATE Stamps SET status = 'expired'
        WHERE child_id = ? AND status = 'available' AND expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP
      `).bind(childId).run();

      const { results: rows } = await config.db.prepare(`
        SELECT s.*, co.name as course_name
        FROM Stamps s
        LEFT JOIN Courses co ON s.course_id = co.id
        WHERE s.child_id = ?
        ORDER BY s.earned_at ASC, s.id ASC
      `).bind(childId).all<any>();

      const { results: ranges } = await config.db.prepare(
        `SELECT * FROM Stamp_Image_Ranges ORDER BY range_start ASC`
      ).all<any>();

      const stamps = rows.map((s, i) => {
        const position = i + 1;
        const range = ranges.find((r: any) => position >= r.range_start && position <= r.range_end);
        return { ...s, position, image_url: range?.image_url || null };
      });

      const available = stamps.filter(s => s.status === 'available');
      const soonThreshold = new Date(Date.now() + 30 * 86400000);
      const expiringSoon = available.filter(s => s.expires_at && new Date(s.expires_at) <= soonThreshold);
      const nearestExpiry = expiringSoon.reduce((earliest: string | null, s: any) => {
        if (!earliest) return s.expires_at;
        return new Date(s.expires_at) < new Date(earliest) ? s.expires_at : earliest;
      }, null as string | null);

      return c.json({
        success: true,
        stamps,
        totalCount: stamps.length,
        availableCount: available.length,
        expiringSoonCount: expiringSoon.length,
        nearestExpiryDate: nearestExpiry,
      });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ================= STAMP IMAGE RANGES (CRM) =================
  async getStampImageRanges(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { results } = await config.db.prepare(
        `SELECT * FROM Stamp_Image_Ranges ORDER BY range_start ASC`
      ).all();
      return c.json({ success: true, ranges: results });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async createStampImageRange(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { rangeStart, rangeEnd, imageUrl } = await c.req.json();
      if (!rangeStart || !rangeEnd || !imageUrl) {
        return c.json({ success: false, message: 'rangeStart, rangeEnd, imageUrl required' }, 400);
      }
      const result = await config.db.prepare(`
        INSERT INTO Stamp_Image_Ranges (range_start, range_end, image_url) VALUES (?, ?, ?)
      `).bind(rangeStart, rangeEnd, imageUrl).run();
      return c.json({ success: true, id: result.meta.last_row_id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateStampImageRange(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const { rangeStart, rangeEnd, imageUrl } = await c.req.json();
      await config.db.prepare(`
        UPDATE Stamp_Image_Ranges SET range_start = ?, range_end = ?, image_url = ? WHERE id = ?
      `).bind(rangeStart, rangeEnd, imageUrl, id).run();
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deleteStampImageRange(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      await config.db.prepare(`DELETE FROM Stamp_Image_Ranges WHERE id = ?`).bind(id).run();
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ================= STAMP PAGE BACKGROUNDS =================
  // Public (consumer app) — cheap, no auth needed, same trust level as the
  // stamp image ranges above.
  async getStampPageBackgrounds(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { results } = await config.db.prepare(
        `SELECT * FROM Stamp_Page_Backgrounds ORDER BY page_number ASC`
      ).all();
      return c.json({ success: true, backgrounds: results });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async createStampPageBackground(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { pageNumber, imageUrl } = await c.req.json();
      if (!pageNumber || !imageUrl) {
        return c.json({ success: false, message: 'pageNumber, imageUrl required' }, 400);
      }
      const result = await config.db.prepare(`
        INSERT INTO Stamp_Page_Backgrounds (page_number, image_url) VALUES (?, ?)
      `).bind(pageNumber, imageUrl).run();
      return c.json({ success: true, id: result.meta.last_row_id });
    } catch (error: any) {
      const message = error.message?.includes('UNIQUE')
        ? 'หน้านี้มีการตั้งค่าพื้นหลังไว้แล้ว กรุณาแก้ไขรายการเดิมแทน'
        : error.message;
      return c.json({ success: false, message }, 500);
    }
  }

  async updateStampPageBackground(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const { pageNumber, imageUrl } = await c.req.json();
      await config.db.prepare(`
        UPDATE Stamp_Page_Backgrounds SET page_number = ?, image_url = ? WHERE id = ?
      `).bind(pageNumber, imageUrl, id).run();
      return c.json({ success: true });
    } catch (error: any) {
      const message = error.message?.includes('UNIQUE')
        ? 'หน้านี้มีการตั้งค่าพื้นหลังไว้แล้ว กรุณาแก้ไขรายการเดิมแทน'
        : error.message;
      return c.json({ success: false, message }, 500);
    }
  }

  async deleteStampPageBackground(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      await config.db.prepare(`DELETE FROM Stamp_Page_Backgrounds WHERE id = ?`).bind(id).run();
      return c.json({ success: true });
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

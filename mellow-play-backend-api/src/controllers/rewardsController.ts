import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import {
  getPointsBalance, creditPoints, awardParticipation, revokeParticipation, awardBadge,
} from '../services/stampService';

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

      // 2. Rewards are paid for with points, not with the collection. Spending
      // used to mark stamps 'used', which greyed out a child's souvenirs every
      // time they claimed a prize — the two were never the same thing.
      const balance = await getPointsBalance(config.db, childId);
      if (balance < reward.stamp_cost) {
        return c.json({ success: false, message: 'Insufficient points' }, 400);
      }

      // 3. Perform redemption transaction
      const claimCode = 'RWD-' + Math.random().toString(36).substring(2, 8).toUpperCase();

      const redemptionResult = await config.db.prepare(`
        INSERT INTO Redemptions (child_id, reward_id, reward_name, stamp_cost, status, claim_code)
        VALUES (?, ?, ?, ?, 'pending', ?)
      `).bind(childId, rewardId, reward.name, reward.stamp_cost, claimCode).run();
      const redemptionId = redemptionResult.meta.last_row_id;

      await config.db.prepare(`UPDATE Rewards SET stock = stock - 1 WHERE id = ?`).bind(rewardId).run();
      await creditPoints(config.db, {
        childId, delta: -reward.stamp_cost, reason: 'redeem',
        redemptionId: Number(redemptionId), note: reward.name,
      });

      return c.json({ success: true, claimCode });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ================= STAMPS (CONSUMER API) =================
  /**
   * A child's collection: every item they have joined, with the artwork of the
   * item itself and which visit it was. Nothing here is ever masked — a stamp
   * is a memory, and spending points does not take memories away.
   */
  async getChildStamps(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const childId = parseInt(c.req.param('childId'));

      const { results: rows } = await config.db.prepare(`
        SELECT s.id, s.course_id, s.booking_id, s.earned_at, s.visit_number, s.source,
               co.name AS course_name, co.thumbnail_url AS course_image,
               co.is_event, co.is_service,
               d.id AS design_id, d.name AS design_name, d.image_url AS design_image,
               d.accent_color AS design_accent, d.show_visit_number
        FROM Stamps s
        LEFT JOIN Courses co ON s.course_id = co.id
        LEFT JOIN Stamp_Designs d ON s.design_id = d.id
        WHERE s.child_id = ? AND s.revoked_at IS NULL
        ORDER BY s.earned_at ASC, s.id ASC
      `).bind(childId).all<any>();

      // Stamps issued before per-item artwork existed still resolve through the
      // old position ranges, so nobody's page suddenly goes blank.
      const { results: ranges } = await config.db.prepare(
        `SELECT * FROM Stamp_Image_Ranges ORDER BY range_start ASC`
      ).all<any>();

      const stamps = rows.map((s, i) => {
        const position = i + 1;
        const legacy = ranges.find((r: any) => position >= r.range_start && position <= r.range_end);
        return {
          ...s,
          position,
          image_url: s.design_image || legacy?.image_url || null,
          accent_color: s.design_accent || null,
          show_visit_number: s.design_id ? s.show_visit_number === 1 : false,
        };
      });

      const balance = await getPointsBalance(config.db, childId);

      // What is about to expire is a property of the points now, not of the
      // collection.
      const soon = new Date(Date.now() + 30 * 86400000).toISOString();
      const expiring = await config.db.prepare(`
        SELECT COALESCE(SUM(delta), 0) AS n, MIN(expires_at) AS nearest
        FROM Reward_Points
        WHERE child_id = ? AND delta > 0 AND expires_at IS NOT NULL
          AND expires_at > CURRENT_TIMESTAMP AND expires_at <= ?
      `).bind(childId, soon).first<any>();

      return c.json({
        success: true,
        stamps,
        totalCount: stamps.length,
        pointsBalance: balance,
        // Kept under the old name so an app build that predates this deploy
        // keeps showing a sensible number.
        availableCount: balance,
        expiringSoonCount: expiring?.n ?? 0,
        nearestExpiryDate: expiring?.nearest ?? null,
      });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  /**
   * The medals a child holds, plus the full ladder so the app can show the
   * ones still locked — the empty slots are the point of a collection.
   */
  async getChildBadges(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const childId = parseInt(c.req.param('childId'));

      const { results: earned } = await config.db.prepare(`
        SELECT cb.id, cb.tier, cb.course_id, cb.booking_id, cb.note, cb.source, cb.awarded_at,
               co.name AS course_name
        FROM Child_Badges cb
        LEFT JOIN Courses co ON cb.course_id = co.id
        WHERE cb.child_id = ? AND cb.revoked_at IS NULL
        ORDER BY cb.tier ASC, cb.awarded_at DESC
      `).bind(childId).all<any>();

      const { results: designs } = await config.db.prepare(`
        SELECT id, tier, name, description, image_url, accent_color, course_id
        FROM Badge_Designs WHERE is_active = 1
        ORDER BY tier ASC, course_id IS NULL DESC
      `).all<any>();

      const defaults = designs.filter((d: any) => d.course_id === null);
      const tiers = [1, 2, 3].map(tier => {
        const mine = earned.filter((b: any) => b.tier === tier);
        const design = designs.find((d: any) => d.tier === tier && mine[0]?.course_id && d.course_id === mine[0].course_id)
          || defaults.find((d: any) => d.tier === tier);
        return {
          tier,
          name: design?.name || `อันดับ ${tier}`,
          description: design?.description || null,
          image_url: design?.image_url || null,
          accent_color: design?.accent_color || null,
          count: mine.length,
          unlocked: mine.length > 0,
          awards: mine,
        };
      });

      return c.json({ success: true, tiers, totalCount: earned.length });
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

  // ================= STAMP DESIGNS (CRM) =================
  // The artwork library. A design is written once and pointed at from as many
  // items or rounds as needed, which is what makes "a different stamp per
  // competition round" a two-click job rather than an upload each time.
  async getStampDesigns(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { results: designs } = await config.db.prepare(`
        SELECT d.*, (SELECT COUNT(*) FROM Stamp_Design_Bindings b WHERE b.design_id = d.id) AS binding_count,
               (SELECT COUNT(*) FROM Stamps s WHERE s.design_id = d.id AND s.revoked_at IS NULL) AS issued_count
        FROM Stamp_Designs d ORDER BY d.is_active DESC, d.id DESC
      `).all<any>();

      const { results: bindings } = await config.db.prepare(`
        SELECT b.*,
               CASE b.scope
                 WHEN 'course' THEN (SELECT name FROM Courses WHERE id = b.ref_id)
                 WHEN 'calendar' THEN (SELECT name FROM Calendars WHERE id = b.ref_id)
                 ELSE (SELECT calendar_id || ' · ' || start_time FROM Calendar_Slot_Rules WHERE id = b.ref_id)
               END AS ref_label
        FROM Stamp_Design_Bindings b ORDER BY b.scope, b.ref_id
      `).all<any>();

      return c.json({ success: true, designs, bindings });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async createStampDesign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { name, image_url, accent_color, show_visit_number } = await c.req.json();
      if (!name?.trim()) return c.json({ success: false, message: 'ต้องตั้งชื่อดีไซน์' }, 400);
      const res = await config.db.prepare(`
        INSERT INTO Stamp_Designs (name, image_url, accent_color, show_visit_number) VALUES (?, ?, ?, ?)
      `).bind(name.trim(), image_url || null, accent_color || '#7452d6', show_visit_number ? 1 : 0).run();
      return c.json({ success: true, id: res.meta.last_row_id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateStampDesign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const { name, image_url, accent_color, show_visit_number, is_active } = await c.req.json();
      await config.db.prepare(`
        UPDATE Stamp_Designs
        SET name = ?, image_url = ?, accent_color = ?, show_visit_number = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        name, image_url || null, accent_color || '#7452d6',
        show_visit_number ? 1 : 0, is_active === false ? 0 : 1, id,
      ).run();
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deleteStampDesign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      // Stamps already issued keep pointing at this design, so deleting one
      // would blank out artwork people already earned. Deactivate instead —
      // it disappears from the pickers and stays on the history.
      const issued = await config.db.prepare(
        'SELECT COUNT(*) AS n FROM Stamps WHERE design_id = ? AND revoked_at IS NULL'
      ).bind(id).first<any>();
      if ((issued?.n ?? 0) > 0) {
        await config.db.prepare('UPDATE Stamp_Designs SET is_active = 0 WHERE id = ?').bind(id).run();
        return c.json({ success: true, deactivated: true, issued: issued.n });
      }
      await config.db.prepare('DELETE FROM Stamp_Designs WHERE id = ?').bind(id).run();
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Binding a design to an item, a calendar or a single round. Passing a null
  // design_id clears the binding, so "use the item's design after all" is the
  // same call.
  async setStampDesignBinding(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { scope, ref_id, design_id } = await c.req.json();
      if (!['course', 'calendar', 'slot_rule'].includes(scope)) {
        return c.json({ success: false, message: 'scope ไม่ถูกต้อง' }, 400);
      }
      if (!design_id) {
        await config.db.prepare('DELETE FROM Stamp_Design_Bindings WHERE scope = ? AND ref_id = ?')
          .bind(scope, ref_id).run();
        return c.json({ success: true, cleared: true });
      }
      await config.db.prepare(`
        INSERT INTO Stamp_Design_Bindings (scope, ref_id, design_id) VALUES (?, ?, ?)
        ON CONFLICT(scope, ref_id) DO UPDATE SET design_id = excluded.design_id
      `).bind(scope, ref_id, design_id).run();
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  /**
   * An item's reward setup: which stamp it gives and whether joining earns a
   * medal. Its own endpoint rather than two more columns threaded through the
   * ~60-parameter course insert/update, which is where mistakes live.
   */
  async setCourseRewardSettings(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const courseId = parseInt(c.req.param('courseId'));
      const { design_id, participation_badge_tier, certificate_auto, certificate_template_id } = await c.req.json();

      const tier = participation_badge_tier ? Number(participation_badge_tier) : null;
      if (tier !== null && ![1, 2, 3].includes(tier)) {
        return c.json({ success: false, message: 'tier ต้องเป็น 1, 2 หรือ 3' }, 400);
      }
      // NULL is off. Validated here because the column carries no CHECK — see
      // migration 0100 for why it deliberately does not.
      const auto = certificate_auto === 'checkin' || certificate_auto === 'completion' ? certificate_auto : null;
      await config.db.prepare('UPDATE Courses SET participation_badge_tier = ?, certificate_auto = ? WHERE id = ?')
        .bind(tier, auto, courseId).run();

      if (design_id) {
        await config.db.prepare(`
          INSERT INTO Stamp_Design_Bindings (scope, ref_id, design_id) VALUES ('course', ?, ?)
          ON CONFLICT(scope, ref_id) DO UPDATE SET design_id = excluded.design_id
        `).bind(courseId, design_id).run();
      } else {
        await config.db.prepare("DELETE FROM Stamp_Design_Bindings WHERE scope = 'course' AND ref_id = ?")
          .bind(courseId).run();
      }

      // Clearing it means this item stops issuing certificates entirely —
      // there is no default to fall back to, by design.
      if (certificate_template_id) {
        await config.db.prepare(`
          INSERT INTO Certificate_Template_Bindings (scope, ref_id, template_id) VALUES ('course', ?, ?)
          ON CONFLICT(scope, ref_id) DO UPDATE SET template_id = excluded.template_id
        `).bind(courseId, Number(certificate_template_id)).run();
      } else {
        await config.db.prepare("DELETE FROM Certificate_Template_Bindings WHERE scope = 'course' AND ref_id = ?")
          .bind(courseId).run();
      }
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getCourseRewardSettings(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const courseId = parseInt(c.req.param('courseId'));
      const course = await config.db.prepare(
        'SELECT participation_badge_tier, certificate_auto, stamps_on_completion, stamp_expiry_months, calendar_id FROM Courses WHERE id = ?'
      ).bind(courseId).first<any>();
      const binding = await config.db.prepare(
        "SELECT design_id FROM Stamp_Design_Bindings WHERE scope = 'course' AND ref_id = ?"
      ).bind(courseId).first<any>();
      const certBinding = await config.db.prepare(
        "SELECT template_id FROM Certificate_Template_Bindings WHERE scope = 'course' AND ref_id = ?"
      ).bind(courseId).first<any>();
      // Inherited from the calendar when the item itself has none, so the form
      // can show where the design is actually coming from.
      const certInherited = await config.db.prepare(`
        SELECT b.template_id FROM Certificate_Template_Bindings b
         WHERE b.scope = 'calendar' AND b.ref_id = ?
      `).bind(course?.calendar_id ?? null).first<any>();
      const { results: certTemplates } = await config.db.prepare(
        'SELECT id, name FROM Certificate_Templates WHERE is_active = 1 ORDER BY id'
      ).all<any>();

      // The rounds of this item's calendar, each with its own override if it
      // has one — this is the list the CRM shows for "a different stamp per
      // round".
      const { results: rounds } = course?.calendar_id ? await config.db.prepare(`
        SELECT r.id, r.day_of_week, r.specific_date, r.start_time, r.end_time,
               b.design_id
        FROM Calendar_Slot_Rules r
        LEFT JOIN Stamp_Design_Bindings b ON b.scope = 'slot_rule' AND b.ref_id = r.id
        WHERE r.calendar_id = ? AND r.is_active = 1
        ORDER BY r.specific_date IS NULL, r.specific_date, r.day_of_week, r.start_time
      `).bind(course.calendar_id).all<any>() : { results: [] };

      return c.json({
        success: true,
        participation_badge_tier: course?.participation_badge_tier ?? null,
        certificate_auto: course?.certificate_auto ?? null,
        certificate_template_id: certBinding?.template_id ?? null,
        certificate_template_inherited: certInherited?.template_id ?? null,
        certificate_templates: certTemplates,
        design_id: binding?.design_id ?? null,
        stamps_on_completion: course?.stamps_on_completion ?? 0,
        rounds,
      });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ================= BADGE DESIGNS (CRM) =================
  async getBadgeDesigns(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { results } = await config.db.prepare(`
        SELECT bd.*, co.name AS course_name,
               (SELECT COUNT(*) FROM Child_Badges cb WHERE cb.tier = bd.tier AND cb.revoked_at IS NULL) AS awarded_count
        FROM Badge_Designs bd
        LEFT JOIN Courses co ON bd.course_id = co.id
        ORDER BY bd.course_id IS NULL DESC, bd.course_id, bd.tier
      `).all<any>();
      return c.json({ success: true, badges: results });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async upsertBadgeDesign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { tier, name, description, image_url, accent_color, course_id } = await c.req.json();
      if (![1, 2, 3].includes(Number(tier))) return c.json({ success: false, message: 'tier ต้องเป็น 1, 2 หรือ 3' }, 400);
      await config.db.prepare(`
        INSERT INTO Badge_Designs (tier, name, description, image_url, accent_color, course_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(tier, course_id) DO UPDATE SET
          name = excluded.name, description = excluded.description,
          image_url = excluded.image_url, accent_color = excluded.accent_color,
          updated_at = CURRENT_TIMESTAMP
      `).bind(
        Number(tier), name || `อันดับ ${tier}`, description || null,
        image_url || null, accent_color || null, course_id || null,
      ).run();
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deleteBadgeDesign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      // The three default medals are the fallback for everything, so they are
      // editable but not removable.
      const row = await config.db.prepare('SELECT course_id FROM Badge_Designs WHERE id = ?').bind(id).first<any>();
      if (row && row.course_id === null) {
        return c.json({ success: false, message: 'ลบเหรียญค่าเริ่มต้นไม่ได้ (แก้ไขรูป/ชื่อได้)' }, 400);
      }
      await config.db.prepare('DELETE FROM Badge_Designs WHERE id = ?').bind(id).run();
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ================= MANUAL GRANTS (CRM) =================
  // The path for competition results and for restoring history that was lost.
  async grantBookingStamp(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const bookingId = parseInt(c.req.param('bookingId'));
      const body = await c.req.json().catch(() => ({}));
      const result = await awardParticipation(config.db, {
        bookingId, source: 'manual',
        actorId: c.get('crmUser')?.userId ?? null,
        note: body?.note || null,
      });
      return c.json({ success: true, ...result });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async revokeBookingStamp(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const bookingId = parseInt(c.req.param('bookingId'));
      const revoked = await revokeParticipation(config.db, {
        bookingId, actorId: c.get('crmUser')?.userId ?? null,
      });
      return c.json({ success: true, revoked });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async grantBookingBadge(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const bookingId = parseInt(c.req.param('bookingId'));
      const { tier, note } = await c.req.json();
      if (![1, 2, 3].includes(Number(tier))) return c.json({ success: false, message: 'tier ต้องเป็น 1, 2 หรือ 3' }, 400);

      const booking = await config.db.prepare(
        'SELECT child_id, course_id FROM Bookings WHERE id = ?'
      ).bind(bookingId).first<any>();
      if (!booking) return c.json({ success: false, message: 'ไม่พบการจอง' }, 404);

      const awarded = await awardBadge(config.db, {
        childId: booking.child_id, tier: Number(tier), courseId: booking.course_id,
        bookingId, source: 'manual', note: note || null,
        actorId: c.get('crmUser')?.userId ?? null,
      });
      return c.json({ success: true, awarded });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async revokeBookingBadge(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const bookingId = parseInt(c.req.param('bookingId'));
      const tier = parseInt(c.req.param('tier'));
      await config.db.prepare(
        'UPDATE Child_Badges SET revoked_at = CURRENT_TIMESTAMP WHERE booking_id = ? AND tier = ? AND revoked_at IS NULL'
      ).bind(bookingId, tier).run();
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // What a booking currently holds — shown in the booking row so staff can see
  // whether a stamp/medal is already there before granting another.
  async getBookingAwards(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const bookingId = parseInt(c.req.param('bookingId'));
      const stamp = await config.db.prepare(`
        SELECT s.id, s.visit_number, s.source, s.earned_at, d.name AS design_name, d.image_url AS design_image
        FROM Stamps s LEFT JOIN Stamp_Designs d ON d.id = s.design_id
        WHERE s.booking_id = ? AND s.revoked_at IS NULL
      `).bind(bookingId).first<any>();
      const { results: badges } = await config.db.prepare(
        'SELECT id, tier, source, note, awarded_at FROM Child_Badges WHERE booking_id = ? AND revoked_at IS NULL ORDER BY tier'
      ).bind(bookingId).all<any>();
      const points = await config.db.prepare(
        "SELECT COALESCE(SUM(delta), 0) AS n FROM Reward_Points WHERE booking_id = ? AND reason = 'attend'"
      ).bind(bookingId).first<any>();
      return c.json({ success: true, stamp: stamp || null, badges, points: points?.n ?? 0 });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Points adjusted by hand — a goodwill top-up, or clawing back a mistake.
  async adjustPoints(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const childId = parseInt(c.req.param('childId'));
      const { delta, note } = await c.req.json();
      const amount = Number(delta);
      if (!amount) return c.json({ success: false, message: 'ระบุจำนวนแต้ม' }, 400);
      await creditPoints(config.db, {
        childId, delta: amount, reason: 'manual', note: note || null,
        actorId: c.get('crmUser')?.userId ?? null,
      });
      return c.json({ success: true, balance: await getPointsBalance(config.db, childId) });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }
}

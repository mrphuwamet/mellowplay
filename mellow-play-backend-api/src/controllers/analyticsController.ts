import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { AnalyticsRepository } from '../repositories/analyticsRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

export class AnalyticsController {
  private repo(c: C) { return new AnalyticsRepository(new ConfigService(c.env).db); }

  async getDashboardAnalytics(c: C) {
    try {
      const range = (c.req.query('range') as 'week' | 'month' | 'year' | 'custom') || 'month';
      const startDate = c.req.query('startDate');
      const endDate = c.req.query('endDate');
      const repo = this.repo(c);
      const [demographics, topClasses, parents, parentRelationships, trends, funnel] = await Promise.all([
        repo.getDemographics(),
        repo.getTopClasses(5),
        repo.getParentStats(),
        repo.getParentRelationshipStats(),
        repo.getTrends(range, startDate, endDate),
        repo.getCourseFunnel(),
      ]);
      return c.json({ success: true, demographics, topClasses, parents, parentRelationships, trends, funnel });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  // Lightweight presence ping (not a full session/analytics system) — the
  // consumer app calls this once per page load with a client-generated
  // sessionId, and the Dashboard polls getActiveUsers to show a near-realtime
  // "active now" count (distinct sessions pinged in the last 5 minutes).
  async pingVisit(c: C) {
    try {
      const config = new ConfigService(c.env);
      const { sessionId, path } = await c.req.json();
      if (!sessionId) return c.json({ success: false, message: 'sessionId required' }, 400);
      await config.db.prepare(
        `INSERT INTO Site_Visits (session_id, path) VALUES (?, ?)`
      ).bind(sessionId, path ?? null).run();
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async getActiveUsers(c: C) {
    try {
      const config = new ConfigService(c.env);
      const activeRow = await config.db.prepare(
        `SELECT COUNT(DISTINCT session_id) as count FROM Site_Visits WHERE created_at >= datetime('now', '-5 minutes')`
      ).first<any>();
      // created_at is UTC; shift to Thailand's UTC+7 before comparing dates
      // so visits between midnight-7am local time count as "today", not
      // yesterday.
      const todayRow = await config.db.prepare(
        `SELECT COUNT(DISTINCT session_id) as count FROM Site_Visits WHERE DATE(created_at, '+7 hours') = DATE('now', '+7 hours')`
      ).first<any>();
      return c.json({ success: true, activeNow: activeRow?.count || 0, visitsToday: todayRow?.count || 0 });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async recordCourseView(c: C) {
    try {
      const config = new ConfigService(c.env);
      const courseId = parseInt(c.req.param('courseId'));
      const { childId } = await c.req.json().catch(() => ({ childId: null }));
      await config.db.prepare(
        `INSERT INTO Course_Views (course_id, child_id) VALUES (?, ?)`
      ).bind(courseId, childId ?? null).run();
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async getCourseReviews(c: C) {
    try {
      const config = new ConfigService(c.env);
      const courseId = parseInt(c.req.param('courseId'));
      const { results } = await config.db.prepare(`
        SELECT r.*, hp.nickname, hp.name as child_name
        FROM Course_Reviews r
        LEFT JOIN Children ch ON r.child_id = ch.id
        LEFT JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
        WHERE r.course_id = ?
        ORDER BY r.created_at DESC
      `).bind(courseId).all();
      return c.json({ success: true, reviews: results });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async createCourseReview(c: C) {
    try {
      const config = new ConfigService(c.env);
      const { courseId, childId, bookingId, rating, comment } = await c.req.json();
      if (!courseId || !childId || !rating) {
        return c.json({ success: false, message: 'courseId, childId, rating required' }, 400);
      }
      if (rating < 1 || rating > 5) {
        return c.json({ success: false, message: 'rating must be between 1 and 5' }, 400);
      }
      const result = await config.db.prepare(`
        INSERT INTO Course_Reviews (course_id, child_id, booking_id, rating, comment)
        VALUES (?, ?, ?, ?, ?)
      `).bind(courseId, childId, bookingId ?? null, rating, comment ?? null).run();
      return c.json({ success: true, id: result.meta.last_row_id });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }
}

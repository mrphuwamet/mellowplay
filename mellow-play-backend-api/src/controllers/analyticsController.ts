import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { AnalyticsRepository } from '../repositories/analyticsRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

export class AnalyticsController {
  private repo(c: C) { return new AnalyticsRepository(new ConfigService(c.env).db); }

  async getDashboardAnalytics(c: C) {
    try {
      const range = (c.req.query('range') as 'week' | 'month' | 'year') || 'month';
      const repo = this.repo(c);
      const [demographics, topClasses, parents, trends, funnel] = await Promise.all([
        repo.getDemographics(),
        repo.getTopClasses(5),
        repo.getParentStats(),
        repo.getTrends(range),
        repo.getCourseFunnel(),
      ]);
      return c.json({ success: true, demographics, topClasses, parents, trends, funnel });
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

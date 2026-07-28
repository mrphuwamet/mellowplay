import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { CourseEngagementRepository } from '../repositories/courseEngagementRepository';
import { ConfigService } from '../services/configService';
import { AuthService } from '../services/authService';

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

// Likes/comments on a recommended-class feed card are member-only, but
// reads still resolve for guests (just with isLiked always false) — same
// split as NewsFeedController, which this mirrors.
export class CourseEngagementController {
  private async getOptionalUserId(c: Ctx, config: ConfigService): Promise<number | undefined> {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return undefined;
    const payload = await AuthService.verifyToken(token, config.jwtSecret);
    return payload?.userId ?? undefined;
  }

  async getEngagement(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getOptionalUserId(c, config);
      const idsParam = c.req.query('ids') || '';
      const courseIds = idsParam.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
      const repo = new CourseEngagementRepository(config.db);
      const engagement = await repo.getEngagementMap(courseIds, userId);
      return c.json({ success: true, engagement });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async toggleLike(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getOptionalUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const courseId = parseInt(c.req.param('id'));
      const repo = new CourseEngagementRepository(config.db);
      const result = await repo.toggleLike(courseId, userId);
      return c.json({ success: true, ...result });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getComments(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const courseId = parseInt(c.req.param('id'));
      const repo = new CourseEngagementRepository(config.db);
      const comments = await repo.getComments(courseId);
      return c.json({ success: true, comments });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async addComment(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getOptionalUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const courseId = parseInt(c.req.param('id'));
      const { comment } = await c.req.json();
      const text = (comment || '').trim();
      if (!text) return c.json({ success: false, message: 'Comment text is required' }, 400);
      if (text.length > 500) return c.json({ success: false, message: 'Comment is too long (max 500 characters)' }, 400);

      const repo = new CourseEngagementRepository(config.db);
      const commentId = await repo.addComment(courseId, userId, text);
      return c.json({ success: true, id: commentId });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }
}

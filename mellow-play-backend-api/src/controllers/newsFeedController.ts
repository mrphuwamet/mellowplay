import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { NewsFeedRepository } from '../repositories/newsFeedRepository';
import { ConfigService } from '../services/configService';
import { AuthService } from '../services/authService';

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

export class NewsFeedController {
  // Likes/comments are member-only, but the feed itself is public — so
  // reads (getPublished/getOne) need an OPTIONAL userId (to compute
  // is_liked for whoever happens to be logged in, null for guests),
  // while writes (like/comment) require a real one via requireAuthedUserId.
  private async getOptionalUserId(c: Ctx, config: ConfigService): Promise<number | undefined> {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return undefined;
    const payload = await AuthService.verifyToken(token, config.jwtSecret);
    return payload?.userId ?? undefined;
  }

  // ── CRM (all items, including unpublished) ──────────────────────────────
  async getAll(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new NewsFeedRepository(config.db);
      const items = await repo.getAll();
      return c.json({ success: true, items });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async create(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new NewsFeedRepository(config.db);
      const data = await c.req.json();
      if (!data.title || !data.type) {
        return c.json({ success: false, message: 'type and title are required' }, 400);
      }
      const id = await repo.create(data);
      return c.json({ success: true, id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async update(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new NewsFeedRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const data = await c.req.json();
      await repo.update(id, data);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async delete(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new NewsFeedRepository(config.db);
      const id = parseInt(c.req.param('id'));
      await repo.delete(id);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ── Consumer app (published only) ───────────────────────────────────────
  async getPublished(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new NewsFeedRepository(config.db);
      const userId = await this.getOptionalUserId(c, config);
      const type = c.req.query('type') as 'news' | 'media' | undefined;
      const items = await repo.getPublished(type, userId);
      return c.json({ success: true, items });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getOne(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new NewsFeedRepository(config.db);
      const userId = await this.getOptionalUserId(c, config);
      const id = parseInt(c.req.param('id'));
      const item = await repo.getById(id, userId);
      if (!item || !item.is_published) return c.json({ success: false, message: 'Not found' }, 404);
      return c.json({ success: true, item });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ── Likes (member-only) ──────────────────────────────────────────────────
  async toggleLike(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getOptionalUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const repo = new NewsFeedRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const item = await repo.getById(id);
      if (!item || !item.is_published) return c.json({ success: false, message: 'Not found' }, 404);

      const result = await repo.toggleLike(id, userId);
      return c.json({ success: true, ...result });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  async getComments(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new NewsFeedRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const comments = await repo.getComments(id);
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

      const repo = new NewsFeedRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const item = await repo.getById(id);
      if (!item || !item.is_published) return c.json({ success: false, message: 'Not found' }, 404);

      const { comment } = await c.req.json();
      const text = (comment || '').trim();
      if (!text) return c.json({ success: false, message: 'Comment text is required' }, 400);
      if (text.length > 500) return c.json({ success: false, message: 'Comment is too long (max 500 characters)' }, 400);

      const commentId = await repo.addComment(id, userId, text);
      return c.json({ success: true, id: commentId });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }
}

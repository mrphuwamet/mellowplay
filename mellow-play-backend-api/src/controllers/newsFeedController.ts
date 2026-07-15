import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { NewsFeedRepository } from '../repositories/newsFeedRepository';
import { ConfigService } from '../services/configService';

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

export class NewsFeedController {
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
      const type = c.req.query('type') as 'news' | 'media' | undefined;
      const items = await repo.getPublished(type);
      return c.json({ success: true, items });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }
}

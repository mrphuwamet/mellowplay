import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { AdsRepository } from '../repositories/adsRepository';
import { ConfigService } from '../services/configService';

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

const TARGET_TYPES = ['course', 'news'];

export class AdsController {
  private repo(c: Ctx) { return new AdsRepository(new ConfigService(c.env).db); }

  // Public — the consumer app's feed shows ads to guests too.
  async getActive(c: Ctx) {
    try {
      const ads = await this.repo(c).getActive();
      return c.json({ success: true, ads });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async recordClick(c: Ctx) {
    try {
      const id = parseInt(c.req.param('id'));
      await this.repo(c).recordClick(id);
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  // CRM-only management endpoints below.
  async listAll(c: Ctx) {
    try {
      const ads = await this.repo(c).getAllForAdmin();
      return c.json({ success: true, ads });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async create(c: Ctx) {
    try {
      const { title, targetType, targetId, customImageUrl, customCaption } = await c.req.json();
      if (!title?.trim()) return c.json({ success: false, message: 'Title is required' }, 400);
      if (!TARGET_TYPES.includes(targetType)) return c.json({ success: false, message: 'Invalid targetType' }, 400);
      if (!targetId) return c.json({ success: false, message: 'targetId is required' }, 400);

      const id = await this.repo(c).create({ title: title.trim(), targetType, targetId, customImageUrl, customCaption });
      return c.json({ success: true, id });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async update(c: Ctx) {
    try {
      const id = parseInt(c.req.param('id'));
      const body = await c.req.json();
      if (body.targetType !== undefined && !TARGET_TYPES.includes(body.targetType)) {
        return c.json({ success: false, message: 'Invalid targetType' }, 400);
      }
      await this.repo(c).update(id, body);
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async remove(c: Ctx) {
    try {
      const id = parseInt(c.req.param('id'));
      await this.repo(c).delete(id);
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }
}

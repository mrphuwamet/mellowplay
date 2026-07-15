import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

export class BirthdayWishController {
  // ── CRM (all rows, including inactive) ──────────────────────────────────
  async getAll(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const { results } = await config.db.prepare(
        'SELECT * FROM Birthday_Wishes ORDER BY id DESC'
      ).all();
      return c.json({ success: true, wishes: results });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async create(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const { messageTh, messageEn } = await c.req.json();
      if (!messageTh) return c.json({ success: false, message: 'messageTh is required' }, 400);
      const result = await config.db.prepare(
        'INSERT INTO Birthday_Wishes (message_th, message_en) VALUES (?, ?)'
      ).bind(messageTh, messageEn || null).run();
      return c.json({ success: true, id: result.meta.last_row_id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async update(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const { messageTh, messageEn, isActive } = await c.req.json();
      await config.db.prepare(
        'UPDATE Birthday_Wishes SET message_th = ?, message_en = ?, is_active = ? WHERE id = ?'
      ).bind(messageTh, messageEn || null, isActive === false ? 0 : 1, id).run();
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async delete(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      await config.db.prepare('DELETE FROM Birthday_Wishes WHERE id = ?').bind(id).run();
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ── Consumer app (active only) ───────────────────────────────────────────
  async getActive(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const { results } = await config.db.prepare(
        'SELECT id, message_th, message_en FROM Birthday_Wishes WHERE is_active = 1'
      ).all();
      return c.json({ success: true, wishes: results });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }
}

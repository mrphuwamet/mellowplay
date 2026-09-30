import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { ConsentRepository, isConsentKey } from '../repositories/consentRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Consent documents — the wording families are asked to agree to, and every
 * version of it ever published. See migration 0119 and ConsentRepository.
 *
 * The public reads are genuinely public: a privacy notice nobody can open
 * without an account is not a notice. Everything that writes sits behind the
 * CRM guard with the rest of /admin.
 */
export class ConsentController {
  private repo(c: C) { return new ConsentRepository(new ConfigService(c.env).db); }

  // ── Public ────────────────────────────────────────────────────────────────

  /** The policy page. No account needed, by design. */
  async listPublic(c: C) {
    try { return c.json({ success: true, documents: await this.repo(c).listPublic() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /** One document by slug, for a form that needs to show the full text. */
  async getPublicByKey(c: C) {
    try {
      const key = String(c.req.param('key') ?? '');
      if (!isConsentKey(key)) return c.json({ success: false, message: 'invalid key' }, 400);
      const doc = await this.repo(c).getByKey(key);
      if (!doc || !doc.is_active) return c.json({ success: false, message: 'ไม่พบเอกสารนี้' }, 404);
      return c.json({ success: true, document: doc });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * The exact wording behind a consent already given.
   *
   * This is the read that makes the archive worth keeping: a CRM screen
   * showing a booking can produce the words that family actually saw, not
   * today's wording standing in for them.
   */
  async getVersion(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const version = parseInt(c.req.param('version'));
      if (Number.isNaN(id) || Number.isNaN(version)) {
        return c.json({ success: false, message: 'invalid id or version' }, 400);
      }
      const doc = await this.repo(c).getVersion(id, version);
      if (!doc) return c.json({ success: false, message: 'ไม่พบเอกสารฉบับนี้' }, 404);
      return c.json({ success: true, document: doc });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── CRM ───────────────────────────────────────────────────────────────────

  async list(c: C) {
    try { return c.json({ success: true, documents: await this.repo(c).list() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /** What the form builder offers — retired documents must not be attachable. */
  async listActive(c: C) {
    try { return c.json({ success: true, documents: await this.repo(c).listActive() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async listVersions(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      if (Number.isNaN(id)) return c.json({ success: false, message: 'invalid id' }, 400);
      return c.json({ success: true, versions: await this.repo(c).listVersions(id) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async create(c: C) {
    try {
      const body = await c.req.json();
      const docKey = String(body.docKey ?? '').trim().toLowerCase();
      if (!isConsentKey(docKey)) {
        return c.json({ success: false, message: 'รหัสเอกสารต้องเป็นอักษรอังกฤษพิมพ์เล็ก ตัวเลข หรือ - เท่านั้น' }, 400);
      }
      if (!String(body.title ?? '').trim()) {
        return c.json({ success: false, message: 'ต้องระบุชื่อเอกสาร' }, 400);
      }
      const id = await this.repo(c).create({ ...body, docKey, title: String(body.title).trim() });
      return c.json({ success: true, id });
    } catch (e: any) {
      // The slug is UNIQUE; a clash is the caller's to fix, not a server fault.
      if (/UNIQUE/i.test(e.message || '')) {
        return c.json({ success: false, message: 'รหัสเอกสารนี้ถูกใช้ไปแล้ว' }, 409);
      }
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async update(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      if (Number.isNaN(id)) return c.json({ success: false, message: 'invalid id' }, 400);
      const body = await c.req.json();
      const docKey = String(body.docKey ?? '').trim().toLowerCase();
      if (!isConsentKey(docKey)) {
        return c.json({ success: false, message: 'รหัสเอกสารต้องเป็นอักษรอังกฤษพิมพ์เล็ก ตัวเลข หรือ - เท่านั้น' }, 400);
      }
      if (!String(body.title ?? '').trim()) {
        return c.json({ success: false, message: 'ต้องระบุชื่อเอกสาร' }, 400);
      }
      const version = await this.repo(c).update(
        id,
        { ...body, docKey, title: String(body.title).trim() },
        c.get('crmUser')?.userId ?? null,
      );
      if (version === null) return c.json({ success: false, message: 'ไม่พบเอกสารนี้' }, 404);
      // The caller needs to know whether this published — the CRM says so, so
      // nobody edits wording believing consent was re-versioned when it wasn't.
      return c.json({ success: true, version });
    } catch (e: any) {
      if (/UNIQUE/i.test(e.message || '')) {
        return c.json({ success: false, message: 'รหัสเอกสารนี้ถูกใช้ไปแล้ว' }, 409);
      }
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async retire(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      if (Number.isNaN(id)) return c.json({ success: false, message: 'invalid id' }, 400);
      await this.repo(c).retire(id);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async restore(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      if (Number.isNaN(id)) return c.json({ success: false, message: 'invalid id' }, 400);
      await this.repo(c).restore(id);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { EventAlbumRepository } from '../repositories/eventAlbumRepository';
import { NewsFeedRepository } from '../repositories/newsFeedRepository';
import { SettingsRepository } from '../repositories/settingsRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Event photo albums (อัลบั้มรูปกิจกรรม).
 *
 * The heavy work — listing the Google Drive folder, downloading, downscaling,
 * detecting faces — all happens in the CRM admin's browser; this controller
 * only receives the finished artifacts (R2 URLs + face embeddings) and gates
 * who may read them. The Worker never talks to Drive.
 *
 * Consumer access rule, everywhere: the album's course must have a
 * non-cancelled booking by one of the caller's children. Same join the
 * profile booking lists use.
 */
/**
 * The rounds an album covers, from whatever the client sent.
 *
 * Undefined stays undefined — that is "I am not talking about the rounds", and
 * the update path relies on the difference so that saving a cover photo does
 * not clear them. An empty array is a real answer: no particular round.
 */
function parseRounds(raw: any): { slotDate: string; slotStartTime: string | null }[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => (typeof r === 'string'
      // "date|HH:MM", the shape the CRM's pickers use everywhere.
      ? { slotDate: r.split('|')[0] || '', slotStartTime: r.split('|')[1] || null }
      : { slotDate: String(r?.slotDate ?? ''), slotStartTime: r?.slotStartTime ?? null }))
    .filter(r => r.slotDate);
}

export class EventAlbumController {
  private repo(c: C) { return new EventAlbumRepository(new ConfigService(c.env).db); }

  // ── CRM ──────────────────────────────────────────────────────────────────

  async list(c: C) {
    try {
      return c.json({ success: true, albums: await this.repo(c).listAll() });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * The Drive API key the sync loop in the browser uses. Kept in
   * System_Settings (editable without a deploy) rather than baked into the
   * CRM bundle; the key itself should be referrer-restricted to the CRM
   * domain in the Google console since any CRM user's browser sees it.
   */
  async config(c: C) {
    try {
      const config = new ConfigService(c.env);
      const settings = new SettingsRepository(config.db);
      const driveApiKey = await settings.getOverridable('google_drive_api_key', '');
      return c.json({ success: true, driveApiKey });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async create(c: C) {
    try {
      const body = await c.req.json();
      if (!body.name?.trim() || !body.courseId) {
        return c.json({ success: false, message: 'ต้องระบุชื่ออัลบั้มและกิจกรรม' }, 400);
      }
      const id = await this.repo(c).create({
        name: String(body.name).trim(),
        courseId: Number(body.courseId),
        rounds: parseRounds(body.rounds) || [],
        description: body.description || null,
        driveFolderId: body.driveFolderId || null,
      });
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async update(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const body = await c.req.json();
      if (!body.name?.trim() || !body.courseId) {
        return c.json({ success: false, message: 'ต้องระบุชื่ออัลบั้มและกิจกรรม' }, 400);
      }
      await this.repo(c).update(id, {
        name: String(body.name).trim(),
        courseId: Number(body.courseId),
        rounds: parseRounds(body.rounds),
        description: body.description || null,
        driveFolderId: body.driveFolderId || null,
        coverPhotoUrl: body.coverPhotoUrl || null,
      });
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * The rounds of one course, so an album can be scoped to the one it covers.
   *
   * An event runs several rounds in a day and the photos differ per round, so a
   * date alone cannot say which album is which.
   */
  async rounds(c: C) {
    try {
      const courseId = parseInt(c.req.query('courseId') || '');
      if (!courseId) return c.json({ success: false, message: 'courseId required' }, 400);
      return c.json({ success: true, rounds: await this.repo(c).getRounds(courseId) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async remove(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      // R2 objects under event-albums/{id}/ are left behind in v1 — storage
      // is cheap and a bulk prefix delete from a Worker needs list+delete
      // batching that isn't worth blocking the feature on.
      await this.repo(c).remove(id);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async listPhotos(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const after = parseInt(c.req.query('after') || '0') || 0;
      const limit = parseInt(c.req.query('limit') || '200') || 200;
      return c.json({ success: true, photos: await this.repo(c).listPhotos(id, after, limit) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async addPhotos(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const { photos } = await c.req.json();
      if (!Array.isArray(photos) || photos.length === 0) {
        return c.json({ success: false, message: 'photos is required' }, 400);
      }
      if (photos.length > 50) {
        return c.json({ success: false, message: 'ส่งได้ครั้งละไม่เกิน 50 รูป' }, 400);
      }
      const result = await this.repo(c).addPhotos(id, photos);
      return c.json({ success: true, ...result });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /** Re-index: the CRM re-ran face detection on an existing photo. */
  async replaceFaces(c: C) {
    try {
      const photoId = parseInt(c.req.param('photoId'));
      const { faces } = await c.req.json();
      if (!Array.isArray(faces)) return c.json({ success: false, message: 'faces is required' }, 400);
      await this.repo(c).replaceFaces(photoId, faces);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async removePhoto(c: C) {
    try {
      const photoId = parseInt(c.req.param('photoId'));
      const repo = this.repo(c);
      const photo = await repo.getPhoto(photoId);
      if (!photo) return c.json({ success: false, message: 'ไม่พบรูปนี้' }, 404);

      // Best-effort R2 cleanup: the display copy and thumbnail were uploaded
      // through /admin/upload, whose URLs embed the R2 key after /files/.
      const bucket = c.env.BUCKET;
      for (const url of [photo.image_url, photo.thumb_url]) {
        const key = typeof url === 'string' ? url.split('/api/v1/files/')[1] : null;
        if (key) { try { await bucket.delete(decodeURIComponent(key)); } catch { /* orphan is acceptable */ } }
      }
      await repo.removePhoto(photoId);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Publish/unpublish; optionally announce it as a news post. The post is
   * created once — republishing an album that already has one just flips the
   * flag, so the feed never fills with duplicates.
   */
  async publish(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const body = await c.req.json();
      const repo = this.repo(c);
      const album = await repo.getById(id);
      if (!album) return c.json({ success: false, message: 'ไม่พบอัลบั้มนี้' }, 404);

      const isPublished = body.isPublished === true;
      let newsFeedId: number | null | undefined = undefined;
      if (isPublished && body.createNewsPost === true && !album.news_feed_id) {
        const news = new NewsFeedRepository(new ConfigService(c.env).db);
        newsFeedId = await news.create({
          type: 'media',
          title: album.name,
          content: album.description || `ประมวลภาพกิจกรรม ${album.course_name}`,
          imageUrl: album.cover_photo_url || undefined,
          linkUrl: `/event-albums/${id}`,
          isPublished: true,
        });
      }
      await repo.setPublished(id, isPublished, newsFeedId);
      return c.json({ success: true, newsFeedId: newsFeedId ?? album.news_feed_id ?? null });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Consumer ─────────────────────────────────────────────────────────────

  private userId(c: C): number | null {
    const payload = c.get('jwtPayload') as any;
    return payload?.userId ? Number(payload.userId) : null;
  }

  async listMine(c: C) {
    try {
      const userId = this.userId(c);
      if (!userId) return c.json({ success: false, message: 'unauthorized' }, 401);
      return c.json({ success: true, albums: await this.repo(c).listForUser(userId) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async getMine(c: C) {
    try {
      const userId = this.userId(c);
      if (!userId) return c.json({ success: false, message: 'unauthorized' }, 401);
      const id = parseInt(c.req.param('id'));
      const repo = this.repo(c);
      // "Not yours" and "does not exist" are the same answer on purpose:
      // album ids must not be probeable.
      const album = await repo.userCanView(userId, id);
      if (!album) return c.json({ success: false, message: 'ไม่พบอัลบั้มนี้' }, 404);

      const after = parseInt(c.req.query('after') || '0') || 0;
      const limit = Math.min(parseInt(c.req.query('limit') || '60') || 60, 200);
      const photos = await repo.listPhotos(id, after, limit);
      return c.json({ success: true, album, photos });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Face search. The client sends only the 128-float embedding of the
   * reference photo (computed on-device — the photo itself never leaves the
   * phone). Distance threshold is staff-tunable via System_Settings; the
   * client may relax it slightly ("show more") but never beyond 0.65, past
   * which face-api matches are noise.
   */
  async faceSearch(c: C) {
    try {
      const userId = this.userId(c);
      if (!userId) return c.json({ success: false, message: 'unauthorized' }, 401);
      const id = parseInt(c.req.param('id'));
      const repo = this.repo(c);
      const album = await repo.userCanView(userId, id);
      if (!album) return c.json({ success: false, message: 'ไม่พบอัลบั้มนี้' }, 404);

      const body = await c.req.json();
      if (typeof body.embedding !== 'string' || !body.embedding) {
        return c.json({ success: false, message: 'embedding is required' }, 400);
      }
      const config = new ConfigService(c.env);
      const settings = new SettingsRepository(config.db);
      const defaultThreshold = parseFloat(await settings.getOverridable('face_search_threshold', '0.55')) || 0.55;
      const requested = typeof body.maxDistance === 'number' ? body.maxDistance : defaultThreshold;
      const maxDistance = Math.min(Math.max(requested, 0.3), 0.65);

      const matches = await repo.faceSearch(id, body.embedding, maxDistance);
      const photoMap = await repo.getPhotosByIds(matches.map(m => m.photoId));
      return c.json({
        success: true,
        threshold: maxDistance,
        matches: matches
          .filter(m => photoMap.has(m.photoId))
          .map(m => ({ ...photoMap.get(m.photoId), distance: Math.round(m.distance * 1000) / 1000 })),
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

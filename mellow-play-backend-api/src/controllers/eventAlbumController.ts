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

  /**
   * Fetch one Drive file's bytes through the Worker.
   *
   * The browser used to call googleapis.com directly with the API key. Google's
   * abuse protection answers a run of downloads from one address with a 403
   * "your computer or network may be sending automated queries" — an HTML page
   * carrying NO CORS headers, so the browser cannot read it at all and reports
   * only "Failed to fetch". Every import failed with a message that named the
   * wrong problem, and the status check in the sync loop never got to run.
   *
   * Proxying fixes three things at once. Same-origin, so CORS stops mattering
   * and a real status code reaches the caller. Retried here with backoff, where
   * a throttle can actually be waited out. And the key stays on the server
   * rather than being handed to every CRM browser.
   */
  async driveFile(c: C) {
    try {
      const fileId = c.req.param('fileId');
      if (!fileId || !/^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
        return c.json({ success: false, message: 'file id ไม่ถูกต้อง' }, 400);
      }
      const config = new ConfigService(c.env);
      const key = await new SettingsRepository(config.db).getOverridable('google_drive_api_key', '');
      if (!key) return c.json({ success: false, message: 'ยังไม่ได้ตั้งค่า Google Drive API key' }, 400);

      const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(key)}`;

      // Three tries, waiting longer each time. Google's throttle lifts on its
      // own; giving up on the first refusal turns a pause into a failed import
      // that someone has to notice and restart.
      let last: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 400 * Math.pow(3, attempt)));
        last = await fetch(url);
        if (last.ok) {
          return new Response(last.body, {
            status: 200,
            headers: {
              'Content-Type': last.headers.get('Content-Type') || 'application/octet-stream',
              // Never cached: the bytes are wanted once, at import.
              'Cache-Control': 'no-store',
            },
          });
        }
        // 403 here is nearly always the abuse throttle rather than permission —
        // a genuinely unshared file fails the listing step long before this.
        if (last.status !== 403 && last.status !== 429 && last.status < 500) break;
      }

      const status = last?.status ?? 502;
      const detail = status === 403 || status === 429
        ? 'Google กำลังจำกัดการดาวน์โหลดชั่วคราว (ยิงถี่เกินไป) — รอสักครู่แล้วกดซิงค์ต่อได้ รูปที่เข้าไปแล้วจะไม่ถูกโหลดซ้ำ'
        : `ดาวน์โหลดจาก Google Drive ไม่สำเร็จ (${status})`;
      return c.json({ success: false, message: detail }, status === 403 || status === 429 ? 429 : 502);
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  /** Create the share link, or return the existing one. */
  async shareLink(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const token = await this.repo(c).ensureShareToken(id);
      return c.json({ success: true, shareToken: token });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /** Revoke it. Every copy of the old link stops working immediately. */
  async revokeShareLink(c: C) {
    try {
      await this.repo(c).revokeShareToken(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Open an album by its share link. No account required — the token is the
   * permission.
   *
   * A wrong token and a deleted album give the same answer, so the endpoint
   * cannot be used to learn which tokens exist.
   */
  async getShared(c: C) {
    try {
      const token = String(c.req.param('token') || '');
      if (!/^[a-f0-9]{32}$/.test(token)) return c.json({ success: false, message: 'ไม่พบอัลบั้มนี้' }, 404);
      const repo = this.repo(c);
      const album = await repo.getByShareToken(token);
      if (!album) return c.json({ success: false, message: 'ไม่พบอัลบั้มนี้' }, 404);

      const after = parseInt(c.req.query('after') || '0') || 0;
      const limit = Math.min(parseInt(c.req.query('limit') || '60') || 60, 200);
      const photos = await repo.listPhotos(album.id, after, limit);
      return c.json({ success: true, album, photos });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Face search inside a shared album.
   *
   * Offered because it is what the album is for, and it gives away nothing the
   * link does not already: whoever holds it can see every photo anyway, and the
   * reference face never leaves the device — only its embedding is sent.
   */
  async faceSearchShared(c: C) {
    try {
      const token = String(c.req.param('token') || '');
      if (!/^[a-f0-9]{32}$/.test(token)) return c.json({ success: false, message: 'ไม่พบอัลบั้มนี้' }, 404);
      const repo = this.repo(c);
      const album = await repo.getByShareToken(token);
      if (!album) return c.json({ success: false, message: 'ไม่พบอัลบั้มนี้' }, 404);
      return await this.runFaceSearch(c, album.id);
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async create(c: C) {
    try {
      const body = await c.req.json();
      if (!body.name?.trim()) {
        return c.json({ success: false, message: 'ต้องระบุชื่ออัลบั้ม' }, 400);
      }
      const id = await this.repo(c).create({
        name: String(body.name).trim(),
        courseId: body.courseId ? Number(body.courseId) : null,
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
      if (!body.name?.trim()) {
        return c.json({ success: false, message: 'ต้องระบุชื่ออัลบั้ม' }, 400);
      }
      await this.repo(c).update(id, {
        name: String(body.name).trim(),
        courseId: body.courseId ? Number(body.courseId) : null,
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
          // 'news' rather than 'media': this is an announcement that carries one
          // picture and a way in, which is what the ข่าวสาร tab is. 'media' is
          // the multi-image slideshow, and an album post has exactly one image
          // — the album itself holds the rest.
          type: 'news',
          title: album.name,
          // The album's own description is the post. The fallback names the
          // activity only when there is one — an album spanning several
          // activities in one hall has no single name to borrow.
          content: album.description
            || (album.course_name ? `ประมวลภาพกิจกรรม ${album.course_name}` : `ประมวลภาพ ${album.name}`),
          // The chosen cover, or failing that the album's first photo. A post
          // with no picture at all reads as broken next to the ones that have
          // one, and an album always has a picture to offer.
          imageUrl: album.cover_photo_url || (await repo.firstPhotoUrl(id)) || undefined,
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
      return await this.runFaceSearch(c, id);
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * The search itself, once the caller has been shown to be allowed in.
   *
   * Shared by the logged-in path and the share-link path so the threshold and
   * its clamp are decided in one place — a shared album quietly matching on
   * looser rules than a private one is the kind of difference nobody would
   * think to check.
   */
  private async runFaceSearch(c: C, albumId: number) {
    const repo = this.repo(c);
    const body = await c.req.json();
    if (typeof body.embedding !== 'string' || !body.embedding) {
      return c.json({ success: false, message: 'embedding is required' }, 400);
    }
    const config = new ConfigService(c.env);
    const settings = new SettingsRepository(config.db);
    const defaultThreshold = parseFloat(await settings.getOverridable('face_search_threshold', '0.55')) || 0.55;
    const requested = typeof body.maxDistance === 'number' ? body.maxDistance : defaultThreshold;
    const maxDistance = Math.min(Math.max(requested, 0.3), 0.65);

    const matches = await repo.faceSearch(albumId, body.embedding, maxDistance);
    const photoMap = await repo.getPhotosByIds(matches.map(m => m.photoId));
    return c.json({
      success: true,
      threshold: maxDistance,
      matches: matches
        .filter(m => photoMap.has(m.photoId))
        .map(m => ({ ...photoMap.get(m.photoId), distance: Math.round(m.distance * 1000) / 1000 })),
    });
  }
}

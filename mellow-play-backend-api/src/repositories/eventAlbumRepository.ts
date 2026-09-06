// Event photo albums: bulk event photos imported from Google Drive by CRM
// staff, published per course, face-searchable. See migrations/0109.
//
// The face embedding travels as base64(Float32Array(128) little-endian) over
// the wire and lives as a 512-byte BLOB in D1. Decode/encode happen here so
// neither the controller nor the clients ever hold both representations.

export interface EventAlbumPhotoInput {
  imageUrl: string;
  thumbUrl?: string | null;
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
  driveFileId?: string | null;
  driveFileName?: string | null;
  faces?: { embedding: string; bbox?: any; score?: number }[];
}

export const decodeEmbedding = (b64: string): Uint8Array => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

/**
 * "HH:MM", or null.
 *
 * Bookings hold start times both ways ("14:00" and "14:00:00") depending on the
 * path that wrote them, and the picker sends whatever the list gave it. Trimming
 * on the way in means an album's round compares equal to a booking's round
 * without every reader having to remember to SUBSTR.
 */
function normaliseTime(value?: string | null): string | null {
  const t = String(value ?? '').trim();
  return t ? t.slice(0, 5) : null;
}

/** One round an album covers. A null time means the whole of that date. */
export interface AlbumRound { slotDate: string; slotStartTime?: string | null }

export class EventAlbumRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  // ── CRM ──────────────────────────────────────────────────────────────────

  async listAll(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT a.*, c.name AS course_name,
        (SELECT COUNT(*) FROM Event_Album_Photos p WHERE p.album_id = a.id) AS photo_count,
        (SELECT COUNT(*) FROM Event_Photo_Faces f WHERE f.album_id = a.id) AS face_count
      FROM Event_Albums a
      JOIN Courses c ON c.id = a.course_id
      ORDER BY a.created_at DESC
    `).all();
    return this.withRounds(results as any[]);
  }

  async getById(id: number): Promise<any | null> {
    const album = await this.db.prepare(`
      SELECT a.*, c.name AS course_name
      FROM Event_Albums a JOIN Courses c ON c.id = a.course_id
      WHERE a.id = ?
    `).bind(id).first();
    if (!album) return null;
    return (await this.withRounds([album as any]))[0];
  }

  async create(data: {
    name: string; courseId: number; rounds?: AlbumRound[];
    description?: string | null; driveFolderId?: string | null;
  }): Promise<number> {
    const res = await this.db.prepare(`
      INSERT INTO Event_Albums (name, course_id, description, drive_folder_id)
      VALUES (?, ?, ?, ?)
    `).bind(data.name, data.courseId, data.description || null, data.driveFolderId || null).run();
    const id = res.meta.last_row_id as number;
    await this.setRounds(id, data.rounds || []);
    return id;
  }

  /**
   * Give this album a share link, or hand back the one it already has.
   *
   * Idempotent on purpose: pressing the button twice must not invalidate the
   * link someone was already given. Replacing it is a separate, deliberate act
   * — see revokeShareToken.
   */
  async ensureShareToken(albumId: number): Promise<string> {
    const row = await this.db.prepare('SELECT share_token FROM Event_Albums WHERE id = ?')
      .bind(albumId).first<{ share_token: string | null }>();
    if (row?.share_token) return row.share_token;

    // 32 hex characters from the platform's CSPRNG. The token IS the
    // permission, so it has to be unguessable rather than merely unique.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    await this.db.prepare('UPDATE Event_Albums SET share_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(token, albumId).run();
    return token;
  }

  /** Take the link back. Anything already sent out stops working. */
  async revokeShareToken(albumId: number): Promise<void> {
    await this.db.prepare('UPDATE Event_Albums SET share_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(albumId).run();
  }

  /**
   * The album a share token opens.
   *
   * No is_published check. The link is its own permission and is handed out by
   * staff for exactly this album — requiring publication as well would mean the
   * only way to share a private album is to make it public first, which is the
   * opposite of what the link is for.
   */
  async getByShareToken(token: string): Promise<any | null> {
    const album = await this.db.prepare(`
      SELECT a.id, a.name, a.description, a.cover_photo_url, a.created_at,
             c.name AS course_name,
        (SELECT COUNT(*) FROM Event_Album_Photos p WHERE p.album_id = a.id) AS photo_count,
        (SELECT COUNT(*) FROM Event_Photo_Faces f WHERE f.album_id = a.id) AS face_count
      FROM Event_Albums a
      JOIN Courses c ON c.id = a.course_id
      WHERE a.share_token = ?
    `).bind(token).first();
    if (!album) return null;
    return (await this.withRounds([album as any]))[0];
  }

  /**
   * Replace an album's rounds with exactly this set.
   *
   * Delete-then-insert rather than a diff: the set is a handful of rows that
   * nothing else references, and working out which to add and which to remove
   * is more code and more ways to be wrong than simply restating the answer.
   */
  async setRounds(albumId: number, rounds: AlbumRound[]): Promise<void> {
    await this.db.prepare('DELETE FROM Event_Album_Rounds WHERE album_id = ?').bind(albumId).run();
    const clean = rounds
      .map(r => ({ slotDate: String(r.slotDate || '').trim(), slotStartTime: normaliseTime(r.slotStartTime) }))
      .filter(r => r.slotDate);
    if (clean.length === 0) return;
    await this.db.batch(clean.map(r => this.db.prepare(
      'INSERT OR IGNORE INTO Event_Album_Rounds (album_id, slot_date, slot_start_time) VALUES (?, ?, ?)'
    ).bind(albumId, r.slotDate, r.slotStartTime)));
  }

  /**
   * The rounds of each of these albums, keyed by album id.
   *
   * One query for the whole page rather than one per album — the list draws a
   * grid of cards and each needs its rounds to be tellable apart.
   */
  async getRoundsForAlbums(albumIds: number[]): Promise<Map<number, any[]>> {
    const out = new Map<number, any[]>();
    if (albumIds.length === 0) return out;
    // D1 caps bound parameters per statement; a page of albums stays well
    // under, but chunking costs nothing and removes the ceiling.
    for (let i = 0; i < albumIds.length; i += 90) {
      const chunk = albumIds.slice(i, i + 90);
      const { results } = await this.db.prepare(`
        SELECT album_id, slot_date, slot_start_time
          FROM Event_Album_Rounds
         WHERE album_id IN (${chunk.map(() => '?').join(',')})
         ORDER BY slot_date, slot_start_time
      `).bind(...chunk).all<any>();
      for (const r of results as any[]) {
        if (!out.has(r.album_id)) out.set(r.album_id, []);
        out.get(r.album_id)!.push({ slot_date: r.slot_date, slot_start_time: r.slot_start_time });
      }
    }
    return out;
  }

  /** Attaches a `rounds` array to each album row, in one extra query. */
  private async withRounds(albums: any[]): Promise<any[]> {
    const byAlbum = await this.getRoundsForAlbums(albums.map(a => Number(a.id)));
    return albums.map(a => ({ ...a, rounds: byAlbum.get(Number(a.id)) || [] }));
  }

  async update(id: number, data: {
    name: string; courseId: number; rounds?: AlbumRound[];
    description?: string | null; driveFolderId?: string | null; coverPhotoUrl?: string | null;
  }): Promise<void> {
    await this.db.prepare(`
      UPDATE Event_Albums
         SET name = ?, course_id = ?,
             description = ?, drive_folder_id = ?,
             cover_photo_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
    `).bind(data.name, data.courseId, data.description || null,
            data.driveFolderId || null, data.coverPhotoUrl || null, id).run();
    // Only when the caller actually said something about the rounds. Setting a
    // cover photo reuses this method and has no opinion on them — treating
    // "not mentioned" as "empty" is how picking a cover would wipe them.
    if (data.rounds !== undefined) await this.setRounds(id, data.rounds);
  }

  /**
   * The rounds this course actually ran, for the album's round picker.
   *
   * Read from the bookings rather than the calendar rules, because an album is
   * made after the event: what matters is the rounds that happened and have
   * people in them, not the ones that were once schedulable.
   */
  async getRounds(courseId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT b.slot_date, SUBSTR(b.slot_start_time, 1, 5) AS slot_start_time, COUNT(*) AS booking_count
        FROM Bookings b
       WHERE b.course_id = ? AND b.status != 'cancelled' AND b.slot_date IS NOT NULL
       GROUP BY b.slot_date, SUBSTR(b.slot_start_time, 1, 5)
       ORDER BY b.slot_date DESC, slot_start_time
    `).bind(courseId).all();
    return results;
  }

  async setPublished(id: number, isPublished: boolean, newsFeedId?: number | null): Promise<void> {
    if (newsFeedId !== undefined) {
      await this.db.prepare(
        'UPDATE Event_Albums SET is_published = ?, news_feed_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(isPublished ? 1 : 0, newsFeedId, id).run();
    } else {
      await this.db.prepare(
        'UPDATE Event_Albums SET is_published = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(isPublished ? 1 : 0, id).run();
    }
  }

  async remove(id: number): Promise<void> {
    // Face rows cascade from photos, photos cascade from the album.
    await this.db.prepare('DELETE FROM Event_Albums WHERE id = ?').bind(id).run();
  }

  /** Keyset pagination — an album can hold thousands of photos. */
  async listPhotos(albumId: number, after = 0, limit = 200): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT id, image_url, thumb_url, width, height, size_bytes,
             drive_file_id, drive_file_name, face_count, created_at
        FROM Event_Album_Photos
       WHERE album_id = ? AND id > ?
       ORDER BY id ASC
       LIMIT ?
    `).bind(albumId, after, Math.min(Math.max(limit, 1), 500)).all();
    return results;
  }

  /**
   * Bulk insert from the CRM sync loop. Skips photos whose (album_id,
   * drive_file_id) already exists — that is what makes re-running a sync
   * import only new files. Inserts run photo-by-photo because each needs its
   * own last_row_id to attach face rows; the client already chunks requests
   * to ~20 photos, so per-request statement count stays small.
   */
  async addPhotos(albumId: number, photos: EventAlbumPhotoInput[]): Promise<{ inserted: number; skipped: number }> {
    let inserted = 0, skipped = 0;
    for (const p of photos) {
      if (p.driveFileId) {
        const dup = await this.db.prepare(
          'SELECT id FROM Event_Album_Photos WHERE album_id = ? AND drive_file_id = ?'
        ).bind(albumId, p.driveFileId).first();
        if (dup) { skipped++; continue; }
      }
      const faces = Array.isArray(p.faces) ? p.faces : [];
      const res = await this.db.prepare(`
        INSERT INTO Event_Album_Photos
          (album_id, image_url, thumb_url, width, height, size_bytes, drive_file_id, drive_file_name, face_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        albumId, p.imageUrl, p.thumbUrl || null, p.width ?? null, p.height ?? null,
        p.sizeBytes ?? null, p.driveFileId || null, p.driveFileName || null, faces.length,
      ).run();
      const photoId = res.meta.last_row_id as number;
      if (faces.length > 0) {
        await this.db.batch(faces.map(f =>
          this.db.prepare(
            'INSERT INTO Event_Photo_Faces (photo_id, album_id, embedding, bbox, detection_score) VALUES (?, ?, ?, ?, ?)'
          ).bind(photoId, albumId, decodeEmbedding(f.embedding).buffer, f.bbox ? JSON.stringify(f.bbox) : null, f.score ?? null)
        ));
      }
      inserted++;
    }
    return { inserted, skipped };
  }

  /** Re-index support: replace a photo's face rows with a fresh detection. */
  async replaceFaces(photoId: number, faces: { embedding: string; bbox?: any; score?: number }[]): Promise<void> {
    const photo = await this.db.prepare('SELECT album_id FROM Event_Album_Photos WHERE id = ?').bind(photoId).first<any>();
    if (!photo) throw new Error('ไม่พบรูปนี้');
    await this.db.batch([
      this.db.prepare('DELETE FROM Event_Photo_Faces WHERE photo_id = ?').bind(photoId),
      this.db.prepare('UPDATE Event_Album_Photos SET face_count = ? WHERE id = ?').bind(faces.length, photoId),
      ...faces.map(f =>
        this.db.prepare(
          'INSERT INTO Event_Photo_Faces (photo_id, album_id, embedding, bbox, detection_score) VALUES (?, ?, ?, ?, ?)'
        ).bind(photoId, photo.album_id, decodeEmbedding(f.embedding).buffer, f.bbox ? JSON.stringify(f.bbox) : null, f.score ?? null)
      ),
    ]);
  }

  async getPhoto(photoId: number): Promise<any | null> {
    return await this.db.prepare('SELECT * FROM Event_Album_Photos WHERE id = ?').bind(photoId).first();
  }

  async removePhoto(photoId: number): Promise<void> {
    await this.db.prepare('DELETE FROM Event_Album_Photos WHERE id = ?').bind(photoId).run();
  }

  // ── Consumer ─────────────────────────────────────────────────────────────

  /**
   * Published albums the family can open: any non-cancelled booking for the
   * album's course by any of the account's children unlocks it.
   */
  async listForUser(userId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT a.id, a.name, a.description, a.cover_photo_url, a.created_at,
             c.name AS course_name,
        (SELECT COUNT(*) FROM Event_Album_Photos p WHERE p.album_id = a.id) AS photo_count
      FROM Event_Albums a
      JOIN Courses c ON c.id = a.course_id
      WHERE a.is_published = 1
        AND EXISTS (
          SELECT 1 FROM Bookings b
          JOIN Children ch ON b.child_id = ch.id
          WHERE ch.parent_id = ? AND b.course_id = a.course_id AND b.status != 'cancelled'
        )
      ORDER BY a.created_at DESC
    `).bind(userId).all();
    return this.withRounds(results as any[]);
  }

  async userCanView(userId: number, albumId: number): Promise<any | null> {
    const album = await this.db.prepare(`
      SELECT a.id, a.name, a.description, a.cover_photo_url, a.created_at,
             c.name AS course_name,
        (SELECT COUNT(*) FROM Event_Album_Photos p WHERE p.album_id = a.id) AS photo_count,
        (SELECT COUNT(*) FROM Event_Photo_Faces f WHERE f.album_id = a.id) AS face_count
      FROM Event_Albums a
      JOIN Courses c ON c.id = a.course_id
      WHERE a.id = ? AND a.is_published = 1
        AND EXISTS (
          SELECT 1 FROM Bookings b
          JOIN Children ch ON b.child_id = ch.id
          WHERE ch.parent_id = ? AND b.course_id = a.course_id AND b.status != 'cancelled'
        )
    `).bind(albumId, userId).first();
    if (!album) return null;
    return (await this.withRounds([album as any]))[0];
  }

  /**
   * Brute-force nearest-face scan for one album.
   *
   * D1 has no vector index, and does not need one at this scale: an album of
   * a few thousand photos holds a few tens of thousands of 512-byte rows,
   * paged here 2000 at a time (~1MB a page). Distance is Euclidean over the
   * 128-dim face-api descriptor; the best (lowest) distance per photo wins.
   */
  async faceSearch(albumId: number, queryB64: string, maxDistance: number, cap = 200): Promise<{ photoId: number; distance: number }[]> {
    const qBytes = decodeEmbedding(queryB64);
    if (qBytes.byteLength !== 512) throw new Error('รูปแบบข้อมูลใบหน้าไม่ถูกต้อง');
    const q = new Float32Array(qBytes.buffer);

    const best = new Map<number, number>();
    let after = 0;
    let scanned = 0;
    const SCAN_LIMIT = 60000; // ~30MB of embeddings — far beyond any expected album

    while (scanned < SCAN_LIMIT) {
      const { results } = await this.db.prepare(
        'SELECT id, photo_id, embedding FROM Event_Photo_Faces WHERE album_id = ? AND id > ? ORDER BY id ASC LIMIT 2000'
      ).bind(albumId, after).all();
      const rows = results as any[];
      if (rows.length === 0) break;

      for (const row of rows) {
        after = row.id;
        scanned++;
        // D1 returns BLOB columns as number[] (or ArrayBuffer depending on
        // driver) — normalize before viewing as floats.
        const raw = row.embedding;
        const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : Uint8Array.from(raw as number[]);
        if (bytes.byteLength !== 512) continue;
        const emb = new Float32Array(bytes.buffer, bytes.byteOffset, 128);
        let sum = 0;
        for (let i = 0; i < 128; i++) { const d = q[i] - emb[i]; sum += d * d; }
        const dist = Math.sqrt(sum);
        if (dist <= maxDistance) {
          const prev = best.get(row.photo_id);
          if (prev === undefined || dist < prev) best.set(row.photo_id, dist);
        }
      }
      if (rows.length < 2000) break;
    }

    return [...best.entries()]
      .map(([photoId, distance]) => ({ photoId, distance }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, cap);
  }

  /** Photo rows for a set of ids, order preserved by the caller. Chunked under D1's bind cap. */
  async getPhotosByIds(ids: number[]): Promise<Map<number, any>> {
    const map = new Map<number, any>();
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      const { results } = await this.db.prepare(
        `SELECT id, image_url, thumb_url, width, height FROM Event_Album_Photos WHERE id IN (${chunk.map(() => '?').join(',')})`
      ).bind(...chunk).all();
      for (const r of results as any[]) map.set(r.id, r);
    }
    return map;
  }
}

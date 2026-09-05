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
    return results;
  }

  async getById(id: number): Promise<any | null> {
    return await this.db.prepare(`
      SELECT a.*, c.name AS course_name
      FROM Event_Albums a JOIN Courses c ON c.id = a.course_id
      WHERE a.id = ?
    `).bind(id).first();
  }

  async create(data: { name: string; courseId: number; slotDate?: string | null; description?: string | null; driveFolderId?: string | null }): Promise<number> {
    const res = await this.db.prepare(`
      INSERT INTO Event_Albums (name, course_id, slot_date, description, drive_folder_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(data.name, data.courseId, data.slotDate || null, data.description || null, data.driveFolderId || null).run();
    return res.meta.last_row_id as number;
  }

  async update(id: number, data: { name: string; courseId: number; slotDate?: string | null; description?: string | null; driveFolderId?: string | null; coverPhotoUrl?: string | null }): Promise<void> {
    await this.db.prepare(`
      UPDATE Event_Albums
         SET name = ?, course_id = ?, slot_date = ?, description = ?, drive_folder_id = ?,
             cover_photo_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
    `).bind(data.name, data.courseId, data.slotDate || null, data.description || null,
            data.driveFolderId || null, data.coverPhotoUrl || null, id).run();
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
      SELECT a.id, a.name, a.description, a.slot_date, a.cover_photo_url, a.created_at,
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
    return results;
  }

  async userCanView(userId: number, albumId: number): Promise<any | null> {
    return await this.db.prepare(`
      SELECT a.id, a.name, a.description, a.slot_date, a.cover_photo_url, a.created_at,
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

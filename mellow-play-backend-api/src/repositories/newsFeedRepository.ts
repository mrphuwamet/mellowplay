export interface NewsFeedItem {
  id: number;
  type: 'news' | 'media';
  title: string;
  title_en?: string;
  content?: string;
  content_en?: string;
  image_url?: string;
  // CSS object-position for the thumbnail, e.g. '50% 30%' — see
  // migration 0073.
  image_position?: string;
  video_url?: string;
  link_url?: string;
  is_published: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// image_urls is stored as a JSON string column — parse it back to an array
// (or [] if unset/malformed) for every row leaving the repository.
function withParsedImageUrls(row: any): any {
  if (!row) return row;
  let imageUrls: string[] = [];
  if (row.image_urls) {
    try { imageUrls = JSON.parse(row.image_urls); } catch { imageUrls = []; }
  }
  return { ...row, image_urls: imageUrls };
}

export class NewsFeedRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async getAll(): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM News_Feed ORDER BY display_order ASC, created_at DESC'
    ).all();
    return results.map(withParsedImageUrls);
  }

  // userId is optional — guests still see counts, just no is_liked flag.
  async getPublished(type?: 'news' | 'media', userId?: number): Promise<any[]> {
    const countsSql = `,
      (SELECT COUNT(*) FROM News_Feed_Likes l WHERE l.news_feed_id = News_Feed.id) as like_count,
      (SELECT COUNT(*) FROM News_Feed_Comments c WHERE c.news_feed_id = News_Feed.id) as comment_count,
      (SELECT COUNT(*) FROM News_Feed_Likes l2 WHERE l2.news_feed_id = News_Feed.id AND l2.user_id = ?) as is_liked
    `;
    const query = type
      ? this.db.prepare(`SELECT News_Feed.*${countsSql} FROM News_Feed WHERE is_published = 1 AND type = ? ORDER BY display_order ASC, created_at DESC`).bind(userId ?? 0, type)
      : this.db.prepare(`SELECT News_Feed.*${countsSql} FROM News_Feed WHERE is_published = 1 ORDER BY display_order ASC, created_at DESC`).bind(userId ?? 0);
    const { results } = await query.all();
    return results.map((r: any) => withParsedImageUrls({ ...r, is_liked: !!r.is_liked }));
  }

  async getById(id: number, userId?: number): Promise<any> {
    const row = await this.db.prepare(`
      SELECT News_Feed.*,
        (SELECT COUNT(*) FROM News_Feed_Likes l WHERE l.news_feed_id = News_Feed.id) as like_count,
        (SELECT COUNT(*) FROM News_Feed_Comments c WHERE c.news_feed_id = News_Feed.id) as comment_count,
        (SELECT COUNT(*) FROM News_Feed_Likes l2 WHERE l2.news_feed_id = News_Feed.id AND l2.user_id = ?) as is_liked
      FROM News_Feed WHERE id = ?
    `).bind(userId ?? 0, id).first<any>();
    return row ? withParsedImageUrls({ ...row, is_liked: !!row.is_liked }) : row;
  }

  // ================= LIKES =================
  async toggleLike(newsFeedId: number, userId: number): Promise<{ liked: boolean }> {
    const existing = await this.db.prepare(
      'SELECT id FROM News_Feed_Likes WHERE news_feed_id = ? AND user_id = ?'
    ).bind(newsFeedId, userId).first<{ id: number }>();

    if (existing) {
      await this.db.prepare('DELETE FROM News_Feed_Likes WHERE id = ?').bind(existing.id).run();
      return { liked: false };
    }
    await this.db.prepare(
      'INSERT INTO News_Feed_Likes (news_feed_id, user_id) VALUES (?, ?)'
    ).bind(newsFeedId, userId).run();
    return { liked: true };
  }

  // ================= COMMENTS =================
  async getComments(newsFeedId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT c.id, c.comment_text, c.created_at,
        COALESCE(u.display_name, u.first_name, 'สมาชิก') as display_name,
        u.profile_image_url as avatar_url
      FROM News_Feed_Comments c
      JOIN Users u ON c.user_id = u.id
      WHERE c.news_feed_id = ?
      ORDER BY c.created_at DESC
    `).bind(newsFeedId).all();
    return results;
  }

  async addComment(newsFeedId: number, userId: number, commentText: string): Promise<number> {
    const result = await this.db.prepare(
      'INSERT INTO News_Feed_Comments (news_feed_id, user_id, comment_text) VALUES (?, ?, ?)'
    ).bind(newsFeedId, userId, commentText).run();
    return result.meta.last_row_id;
  }

  async create(data: {
    type: string;
    title: string;
    titleEn?: string;
    content?: string;
    contentEn?: string;
    imageUrl?: string;
    imageUrls?: string[];
    videoUrl?: string;
    linkUrl?: string;
    imagePosition?: string;
    isPublished?: boolean;
    displayOrder?: number;
  }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO News_Feed
        (type, title, title_en, content, content_en, image_url, image_urls, video_url, link_url, image_position, is_published, display_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      data.type, data.title, data.titleEn ?? null, data.content ?? null, data.contentEn ?? null,
      data.imageUrl ?? null, data.imageUrls?.length ? JSON.stringify(data.imageUrls) : null,
      data.videoUrl ?? null, data.linkUrl ?? null,
      // Centre is both the column default and what the CRM sends for an
      // unadjusted image, so an older client that doesn't send the field at
      // all still gets the same rendering as before.
      data.imagePosition ?? '50% 50%',
      data.isPublished === false ? 0 : 1, data.displayOrder ?? 0
    ).run();
    return result.meta.last_row_id;
  }

  async update(id: number, data: {
    type: string;
    title: string;
    titleEn?: string;
    content?: string;
    contentEn?: string;
    imageUrl?: string;
    imageUrls?: string[];
    videoUrl?: string;
    linkUrl?: string;
    imagePosition?: string;
    isPublished?: boolean;
    displayOrder?: number;
  }): Promise<void> {
    await this.db.prepare(`
      UPDATE News_Feed SET
        type = ?, title = ?, title_en = ?, content = ?, content_en = ?,
        image_url = ?, image_urls = ?, video_url = ?, link_url = ?, image_position = ?,
        is_published = ?, display_order = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      data.type, data.title, data.titleEn ?? null, data.content ?? null, data.contentEn ?? null,
      data.imageUrl ?? null, data.imageUrls?.length ? JSON.stringify(data.imageUrls) : null,
      data.videoUrl ?? null, data.linkUrl ?? null,
      data.imagePosition ?? '50% 50%',
      data.isPublished === false ? 0 : 1, data.displayOrder ?? 0,
      id
    ).run();
  }

  async delete(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM News_Feed WHERE id = ?').bind(id).run();
  }
}

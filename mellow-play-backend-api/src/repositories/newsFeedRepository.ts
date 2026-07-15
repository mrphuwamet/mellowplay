export interface NewsFeedItem {
  id: number;
  type: 'news' | 'media';
  title: string;
  title_en?: string;
  content?: string;
  content_en?: string;
  image_url?: string;
  video_url?: string;
  link_url?: string;
  is_published: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
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
    return results;
  }

  async getPublished(type?: 'news' | 'media'): Promise<any[]> {
    const query = type
      ? this.db.prepare('SELECT * FROM News_Feed WHERE is_published = 1 AND type = ? ORDER BY display_order ASC, created_at DESC').bind(type)
      : this.db.prepare('SELECT * FROM News_Feed WHERE is_published = 1 ORDER BY display_order ASC, created_at DESC');
    const { results } = await query.all();
    return results;
  }

  async getById(id: number): Promise<any> {
    return this.db.prepare('SELECT * FROM News_Feed WHERE id = ?').bind(id).first();
  }

  async create(data: {
    type: string;
    title: string;
    titleEn?: string;
    content?: string;
    contentEn?: string;
    imageUrl?: string;
    videoUrl?: string;
    linkUrl?: string;
    isPublished?: boolean;
    displayOrder?: number;
  }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO News_Feed
        (type, title, title_en, content, content_en, image_url, video_url, link_url, is_published, display_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      data.type, data.title, data.titleEn ?? null, data.content ?? null, data.contentEn ?? null,
      data.imageUrl ?? null, data.videoUrl ?? null, data.linkUrl ?? null,
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
    videoUrl?: string;
    linkUrl?: string;
    isPublished?: boolean;
    displayOrder?: number;
  }): Promise<void> {
    await this.db.prepare(`
      UPDATE News_Feed SET
        type = ?, title = ?, title_en = ?, content = ?, content_en = ?,
        image_url = ?, video_url = ?, link_url = ?, is_published = ?, display_order = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      data.type, data.title, data.titleEn ?? null, data.content ?? null, data.contentEn ?? null,
      data.imageUrl ?? null, data.videoUrl ?? null, data.linkUrl ?? null,
      data.isPublished === false ? 0 : 1, data.displayOrder ?? 0,
      id
    ).run();
  }

  async delete(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM News_Feed WHERE id = ?').bind(id).run();
  }
}

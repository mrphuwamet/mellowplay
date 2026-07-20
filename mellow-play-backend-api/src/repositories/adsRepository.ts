export class AdsRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // Resolves each ad's display title/image from its target (Courses or
  // News_Feed) unless a custom override was set on the ad itself — so an ad
  // automatically stays in sync with the target's current thumbnail/title
  // unless staff deliberately wants different ad creative.
  private async resolveTargets(rows: any[]): Promise<any[]> {
    const courseIds = rows.filter(r => r.target_type === 'course').map(r => r.target_id);
    const newsIds = rows.filter(r => r.target_type === 'news').map(r => r.target_id);

    const courseMap = new Map<number, any>();
    if (courseIds.length > 0) {
      const { results } = await this.db.prepare(
        `SELECT id, name, thumbnail_url FROM Courses WHERE id IN (${courseIds.map(() => '?').join(',')})`
      ).bind(...courseIds).all();
      for (const c of results as any[]) courseMap.set(c.id, c);
    }
    const newsMap = new Map<number, any>();
    if (newsIds.length > 0) {
      const { results } = await this.db.prepare(
        `SELECT id, title, image_url FROM News_Feed WHERE id IN (${newsIds.map(() => '?').join(',')})`
      ).bind(...newsIds).all();
      for (const n of results as any[]) newsMap.set(n.id, n);
    }

    return rows.map(r => {
      const target = r.target_type === 'course' ? courseMap.get(r.target_id) : newsMap.get(r.target_id);
      return {
        id: r.id,
        title: r.title,
        targetType: r.target_type,
        targetId: r.target_id,
        targetTitle: target?.name ?? target?.title ?? null,
        targetExists: !!target,
        imageUrl: r.custom_image_url || target?.thumbnail_url || target?.image_url || null,
        caption: r.custom_caption || null,
        isActive: !!r.is_active,
        clickCount: r.click_count,
        createdAt: r.created_at,
      };
    });
  }

  async getActive(): Promise<any[]> {
    const { results } = await this.db.prepare(
      `SELECT * FROM Ads WHERE is_active = 1 ORDER BY created_at DESC`
    ).all();
    return this.resolveTargets(results as any[]);
  }

  async getAllForAdmin(): Promise<any[]> {
    const { results } = await this.db.prepare(`SELECT * FROM Ads ORDER BY created_at DESC`).all();
    return this.resolveTargets(results as any[]);
  }

  async create(data: { title: string; targetType: string; targetId: number; customImageUrl?: string; customCaption?: string }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Ads (title, target_type, target_id, custom_image_url, custom_caption)
      VALUES (?, ?, ?, ?, ?)
    `).bind(data.title, data.targetType, data.targetId, data.customImageUrl ?? null, data.customCaption ?? null).run();
    return result.meta.last_row_id;
  }

  async update(id: number, data: { title?: string; targetType?: string; targetId?: number; customImageUrl?: string; customCaption?: string; isActive?: boolean }): Promise<void> {
    const sets: string[] = [];
    const binds: any[] = [];
    if (data.title !== undefined) { sets.push('title = ?'); binds.push(data.title); }
    if (data.targetType !== undefined) { sets.push('target_type = ?'); binds.push(data.targetType); }
    if (data.targetId !== undefined) { sets.push('target_id = ?'); binds.push(data.targetId); }
    if (data.customImageUrl !== undefined) { sets.push('custom_image_url = ?'); binds.push(data.customImageUrl || null); }
    if (data.customCaption !== undefined) { sets.push('custom_caption = ?'); binds.push(data.customCaption || null); }
    if (data.isActive !== undefined) { sets.push('is_active = ?'); binds.push(data.isActive ? 1 : 0); }
    if (sets.length === 0) return;
    binds.push(id);
    await this.db.prepare(`UPDATE Ads SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  }

  async delete(id: number): Promise<void> {
    await this.db.prepare(`DELETE FROM Ads WHERE id = ?`).bind(id).run();
  }

  async recordClick(id: number): Promise<void> {
    await this.db.prepare(`UPDATE Ads SET click_count = click_count + 1 WHERE id = ?`).bind(id).run();
  }
}

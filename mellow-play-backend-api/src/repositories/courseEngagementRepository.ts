export interface CourseEngagement {
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
}

export class CourseEngagementRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // Bulk, keyed by course id — the feed shows up to several recommended
  // courses at once, so this avoids a separate round trip per card.
  async getEngagementMap(courseIds: number[], userId?: number): Promise<Record<number, CourseEngagement>> {
    if (courseIds.length === 0) return {};
    const placeholders = courseIds.map(() => '?').join(',');
    const { results } = await this.db.prepare(`
      SELECT co.id as course_id,
        (SELECT COUNT(*) FROM Course_Likes l WHERE l.course_id = co.id) as like_count,
        (SELECT COUNT(*) FROM Course_Comments cm WHERE cm.course_id = co.id) as comment_count,
        (SELECT COUNT(*) FROM Course_Likes l2 WHERE l2.course_id = co.id AND l2.user_id = ?) as is_liked
      FROM Courses co
      WHERE co.id IN (${placeholders})
    `).bind(userId ?? 0, ...courseIds).all<any>();

    const map: Record<number, CourseEngagement> = {};
    for (const r of results) {
      map[r.course_id] = { likeCount: r.like_count, commentCount: r.comment_count, isLiked: !!r.is_liked };
    }
    return map;
  }

  async toggleLike(courseId: number, userId: number): Promise<{ liked: boolean }> {
    const existing = await this.db.prepare(
      'SELECT id FROM Course_Likes WHERE course_id = ? AND user_id = ?'
    ).bind(courseId, userId).first<{ id: number }>();

    if (existing) {
      await this.db.prepare('DELETE FROM Course_Likes WHERE id = ?').bind(existing.id).run();
      return { liked: false };
    }
    await this.db.prepare(
      'INSERT INTO Course_Likes (course_id, user_id) VALUES (?, ?)'
    ).bind(courseId, userId).run();
    return { liked: true };
  }

  async getComments(courseId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT c.id, c.comment_text, c.created_at,
        COALESCE(u.display_name, u.first_name, 'สมาชิก') as display_name,
        u.profile_image_url as avatar_url
      FROM Course_Comments c
      JOIN Users u ON c.user_id = u.id
      WHERE c.course_id = ?
      ORDER BY c.created_at DESC
    `).bind(courseId).all();
    return results;
  }

  async addComment(courseId: number, userId: number, commentText: string): Promise<number> {
    const result = await this.db.prepare(
      'INSERT INTO Course_Comments (course_id, user_id, comment_text) VALUES (?, ?, ?)'
    ).bind(courseId, userId, commentText).run();
    return result.meta.last_row_id;
  }
}

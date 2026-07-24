export interface CommunityPost {
  id: number;
  user_id: number;
  content: string;
  image_url: string | null;
  post_type: 'text' | 'poll';
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  google_place_id: string | null;
  created_at: string;
  updated_at: string;
}

export class CommunityRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // Poll options + each option's vote count and whether userId voted for it —
  // attached onto the post object as `poll_options`, same correlated-subquery
  // style as like_count/is_liked below. A no-op (empty array) for text posts.
  private async attachPollOptions<T extends { id: number; post_type: string }>(posts: T[], userId?: number): Promise<(T & { poll_options: any[] })[]> {
    const pollPosts = posts.filter(p => p.post_type === 'poll');
    if (pollPosts.length === 0) return posts.map(p => ({ ...p, poll_options: [] }));

    const ids = pollPosts.map(p => p.id);
    const placeholders = ids.map(() => '?').join(',');
    const { results } = await this.db.prepare(`
      SELECT o.id, o.post_id, o.option_text, o.sort_order,
        (SELECT COUNT(*) FROM Community_Poll_Votes v WHERE v.option_id = o.id) as vote_count,
        (SELECT COUNT(*) FROM Community_Poll_Votes v2 WHERE v2.option_id = o.id AND v2.user_id = ?) as voted_by_me
      FROM Community_Poll_Options o
      WHERE o.post_id IN (${placeholders})
      ORDER BY o.post_id, o.sort_order ASC
    `).bind(userId ?? 0, ...ids).all<any>();

    const optionsByPost = new Map<number, any[]>();
    for (const row of results) {
      const list = optionsByPost.get(row.post_id) || [];
      list.push({ ...row, voted_by_me: !!row.voted_by_me });
      optionsByPost.set(row.post_id, list);
    }
    return posts.map(p => ({ ...p, poll_options: optionsByPost.get(p.id) || [] }));
  }

  // userId is optional — guests still see the public feed, just no is_liked flag.
  // Excludes posts a CRM moderator has hidden (see is_hidden) — reported but
  // not-yet-actioned posts still show normally.
  async getFeed(userId?: number, limit = 20, offset = 0): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT Community_Posts.*,
        COALESCE(u.display_name, u.first_name, 'สมาชิก') as author_name,
        u.profile_image_url as author_avatar_url,
        (SELECT COUNT(*) FROM Community_Post_Likes l WHERE l.post_id = Community_Posts.id) as like_count,
        (SELECT COUNT(*) FROM Community_Post_Comments c WHERE c.post_id = Community_Posts.id) as comment_count,
        (SELECT COUNT(*) FROM Community_Post_Likes l2 WHERE l2.post_id = Community_Posts.id AND l2.user_id = ?) as is_liked
      FROM Community_Posts
      JOIN Users u ON Community_Posts.user_id = u.id
      WHERE Community_Posts.is_hidden = 0
      ORDER BY Community_Posts.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(userId ?? 0, limit, offset).all();
    const posts = results.map((r: any) => ({ ...r, is_liked: !!r.is_liked }));
    return this.attachPollOptions(posts, userId);
  }

  async getById(id: number, userId?: number): Promise<any> {
    const row = await this.db.prepare(`
      SELECT Community_Posts.*,
        COALESCE(u.display_name, u.first_name, 'สมาชิก') as author_name,
        u.profile_image_url as author_avatar_url,
        (SELECT COUNT(*) FROM Community_Post_Likes l WHERE l.post_id = Community_Posts.id) as like_count,
        (SELECT COUNT(*) FROM Community_Post_Comments c WHERE c.post_id = Community_Posts.id) as comment_count,
        (SELECT COUNT(*) FROM Community_Post_Likes l2 WHERE l2.post_id = Community_Posts.id AND l2.user_id = ?) as is_liked
      FROM Community_Posts
      JOIN Users u ON Community_Posts.user_id = u.id
      WHERE Community_Posts.id = ?
    `).bind(userId ?? 0, id).first<any>();
    if (!row) return row;
    const [withPoll] = await this.attachPollOptions([{ ...row, is_liked: !!row.is_liked }], userId);
    return withPoll;
  }

  async createPost(userId: number, content: string, options: {
    imageUrl?: string;
    postType?: 'text' | 'poll';
    pollOptions?: string[];
    locationName?: string;
    locationLat?: number;
    locationLng?: number;
    googlePlaceId?: string;
  } = {}): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Community_Posts (user_id, content, image_url, post_type, location_name, location_lat, location_lng, google_place_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId, content, options.imageUrl ?? null, options.postType ?? 'text',
      options.locationName ?? null, options.locationLat ?? null, options.locationLng ?? null, options.googlePlaceId ?? null
    ).run();
    const postId = result.meta.last_row_id;

    if (options.postType === 'poll' && options.pollOptions?.length) {
      for (let i = 0; i < options.pollOptions.length; i++) {
        await this.db.prepare(
          'INSERT INTO Community_Poll_Options (post_id, option_text, sort_order) VALUES (?, ?, ?)'
        ).bind(postId, options.pollOptions[i], i).run();
      }
    }
    return postId;
  }

  // Author-only — callers must check the post belongs to userId before
  // calling, but the WHERE clause here is a second, authoritative guard
  // against a race where the post was deleted/reassigned in between.
  // Likes/comments/poll data aren't ON DELETE CASCADE in the schema, so
  // they're cleared explicitly first or the post delete trips a FK constraint.
  async deletePost(id: number, userId: number): Promise<boolean> {
    await this.db.prepare('DELETE FROM Community_Post_Likes WHERE post_id = ?').bind(id).run();
    await this.db.prepare('DELETE FROM Community_Post_Comments WHERE post_id = ?').bind(id).run();
    await this.db.prepare(`
      DELETE FROM Community_Poll_Votes WHERE option_id IN (SELECT id FROM Community_Poll_Options WHERE post_id = ?)
    `).bind(id).run();
    await this.db.prepare('DELETE FROM Community_Poll_Options WHERE post_id = ?').bind(id).run();
    const result = await this.db.prepare(
      'DELETE FROM Community_Posts WHERE id = ? AND user_id = ?'
    ).bind(id, userId).run();
    return result.meta.changes > 0;
  }

  // ================= LIKES =================
  async toggleLike(postId: number, userId: number): Promise<{ liked: boolean }> {
    const existing = await this.db.prepare(
      'SELECT id FROM Community_Post_Likes WHERE post_id = ? AND user_id = ?'
    ).bind(postId, userId).first<{ id: number }>();

    if (existing) {
      await this.db.prepare('DELETE FROM Community_Post_Likes WHERE id = ?').bind(existing.id).run();
      return { liked: false };
    }
    await this.db.prepare(
      'INSERT INTO Community_Post_Likes (post_id, user_id) VALUES (?, ?)'
    ).bind(postId, userId).run();
    return { liked: true };
  }

  // ================= COMMENTS =================
  async getComments(postId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT c.id, c.comment_text, c.created_at,
        COALESCE(u.display_name, u.first_name, 'สมาชิก') as display_name,
        u.profile_image_url as avatar_url
      FROM Community_Post_Comments c
      JOIN Users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `).bind(postId).all();
    return results;
  }

  async addComment(postId: number, userId: number, commentText: string): Promise<number> {
    const result = await this.db.prepare(
      'INSERT INTO Community_Post_Comments (post_id, user_id, comment_text) VALUES (?, ?, ?)'
    ).bind(postId, userId, commentText).run();
    return result.meta.last_row_id;
  }

  // ================= POLLS =================
  // Single-select: voting for a new option silently replaces any existing
  // vote by this user on a sibling option of the same post.
  async voteOnPoll(optionId: number, userId: number): Promise<void> {
    const option = await this.db.prepare('SELECT post_id FROM Community_Poll_Options WHERE id = ?').bind(optionId).first<{ post_id: number }>();
    if (!option) throw new Error('Poll option not found');

    await this.db.prepare(`
      DELETE FROM Community_Poll_Votes
      WHERE user_id = ? AND option_id IN (SELECT id FROM Community_Poll_Options WHERE post_id = ?)
    `).bind(userId, option.post_id).run();

    await this.db.prepare(
      'INSERT INTO Community_Poll_Votes (option_id, user_id) VALUES (?, ?)'
    ).bind(optionId, userId).run();
  }

  // ================= MODERATION (report/flag, reviewed by CRM staff) =====

  // ON CONFLICT DO NOTHING relies on the UNIQUE(post_id, reporter_user_id)
  // constraint — a member can only report a given post once.
  async reportPost(postId: number, reporterUserId: number, reason?: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO Community_Post_Reports (post_id, reporter_user_id, reason)
      VALUES (?, ?, ?)
      ON CONFLICT (post_id, reporter_user_id) DO NOTHING
    `).bind(postId, reporterUserId, reason ?? null).run();
  }

  // One row per reported post (not per report) — reports_json bundles every
  // still-pending report for that post so staff can see all the reasons at
  // once without a second request per post.
  async getReportedPosts(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT
        Community_Posts.id, Community_Posts.content, Community_Posts.image_url,
        Community_Posts.is_hidden, Community_Posts.created_at,
        Community_Posts.user_id as author_user_id,
        COALESCE(u.display_name, u.first_name, 'สมาชิก') as author_name,
        (SELECT COUNT(*) FROM Community_Post_Reports r WHERE r.post_id = Community_Posts.id AND r.status = 'pending') as report_count,
        (
          SELECT json_group_array(json_object(
            'id', r2.id, 'reason', r2.reason, 'created_at', r2.created_at,
            'reporter_name', COALESCE(ru.display_name, ru.first_name, 'สมาชิก')
          ))
          FROM Community_Post_Reports r2 JOIN Users ru ON r2.reporter_user_id = ru.id
          WHERE r2.post_id = Community_Posts.id AND r2.status = 'pending'
        ) as reports_json
      FROM Community_Posts
      JOIN Users u ON Community_Posts.user_id = u.id
      WHERE EXISTS (SELECT 1 FROM Community_Post_Reports r3 WHERE r3.post_id = Community_Posts.id AND r3.status = 'pending')
      ORDER BY report_count DESC, Community_Posts.created_at DESC
    `).all<any>();
    return results.map(r => ({ ...r, is_hidden: !!r.is_hidden, reports: r.reports_json ? JSON.parse(r.reports_json) : [] }));
  }

  // Hiding is the "acted on it" outcome — clears the post's pending reports
  // to 'actioned' so it drops out of the moderation queue.
  async hidePost(postId: number): Promise<void> {
    await this.db.prepare('UPDATE Community_Posts SET is_hidden = 1 WHERE id = ?').bind(postId).run();
    await this.db.prepare(`UPDATE Community_Post_Reports SET status = 'actioned' WHERE post_id = ? AND status = 'pending'`).bind(postId).run();
  }

  // Unhiding implies staff reviewed and decided the content is fine after
  // all — dismisses any pending reports the same way dismissReports does.
  async unhidePost(postId: number): Promise<void> {
    await this.db.prepare('UPDATE Community_Posts SET is_hidden = 0 WHERE id = ?').bind(postId).run();
    await this.db.prepare(`UPDATE Community_Post_Reports SET status = 'dismissed' WHERE post_id = ? AND status = 'pending'`).bind(postId).run();
  }

  // Staff decided the reports don't warrant hiding/deleting — clears the
  // queue without changing the post itself.
  async dismissReports(postId: number): Promise<void> {
    await this.db.prepare(`UPDATE Community_Post_Reports SET status = 'dismissed' WHERE post_id = ? AND status = 'pending'`).bind(postId).run();
  }

  // Admin override delete — unlike the author-only deletePost() above, this
  // has no user_id check (a CRM staff action, not a consumer one) and also
  // clears the post's own report rows along with the rest of its data.
  async adminDeletePost(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Community_Post_Likes WHERE post_id = ?').bind(id).run();
    await this.db.prepare('DELETE FROM Community_Post_Comments WHERE post_id = ?').bind(id).run();
    await this.db.prepare(`
      DELETE FROM Community_Poll_Votes WHERE option_id IN (SELECT id FROM Community_Poll_Options WHERE post_id = ?)
    `).bind(id).run();
    await this.db.prepare('DELETE FROM Community_Poll_Options WHERE post_id = ?').bind(id).run();
    await this.db.prepare('DELETE FROM Community_Post_Reports WHERE post_id = ?').bind(id).run();
    await this.db.prepare('DELETE FROM Community_Posts WHERE id = ?').bind(id).run();
  }
}

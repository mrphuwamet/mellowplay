import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { CommunityRepository } from '../repositories/communityRepository';
import { UserRepository } from '../repositories/userRepository';
import { ConfigService } from '../services/configService';
import { AuthService } from '../services/authService';

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

const MAX_POST_LENGTH = 5000;
const MAX_POLL_OPTIONS = 4;
const MIN_POLL_OPTIONS = 2;

export class CommunityController {
  // Reads are public (guests see the feed), but is_liked needs to know who's
  // asking; writes require a real user — same split as newsFeedController.
  private async getOptionalUserId(c: Ctx, config: ConfigService): Promise<number | undefined> {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return undefined;
    const payload = await AuthService.verifyToken(token, config.jwtSecret);
    return payload?.userId ?? undefined;
  }

  async getFeed(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new CommunityRepository(config.db);
      const userId = await this.getOptionalUserId(c, config);
      const limit = Math.min(50, parseInt(c.req.query('limit') || '20', 10));
      const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10));
      const posts = await repo.getFeed(userId, limit, offset);
      return c.json({ success: true, posts });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async createPost(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getOptionalUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const body = await c.req.formData();
      const content = ((body.get('content') as string) || '').trim();
      if (!content) return c.json({ success: false, message: 'Post content is required' }, 400);
      if (content.length > MAX_POST_LENGTH) return c.json({ success: false, message: `Post is too long (max ${MAX_POST_LENGTH} characters)` }, 400);

      // Images are an admin-only privilege (set by CRM staff) — regular
      // members can only post plain text (plus polls/location, handled below).
      let imageUrl: string | undefined;
      const file = body.get('file') as unknown as File | null;
      if (file) {
        const userRepo = new UserRepository(config.db);
        const user = await userRepo.findById(userId);
        if (!user?.is_community_admin) {
          return c.json({ success: false, message: 'Only community admins can attach an image' }, 403);
        }
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const key = `community/post-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const buffer = await file.arrayBuffer();
        await c.env.BUCKET.put(key, buffer, { httpMetadata: { contentType: file.type || 'image/jpeg' } });
        imageUrl = `/api/v1/files/${key}`;
      }

      const postTypeRaw = (body.get('postType') as string) || 'text';
      const postType = postTypeRaw === 'poll' ? 'poll' : 'text';

      let pollOptions: string[] | undefined;
      if (postType === 'poll') {
        const rawOptions = (body.get('pollOptions') as string) || '[]';
        try {
          const parsed = JSON.parse(rawOptions);
          pollOptions = Array.isArray(parsed) ? parsed.map((o: any) => String(o).trim()).filter(Boolean) : [];
        } catch {
          pollOptions = [];
        }
        if (pollOptions.length < MIN_POLL_OPTIONS || pollOptions.length > MAX_POLL_OPTIONS) {
          return c.json({ success: false, message: `A poll needs ${MIN_POLL_OPTIONS}-${MAX_POLL_OPTIONS} options` }, 400);
        }
      }

      const locationName = (body.get('locationName') as string) || undefined;
      const locationLatRaw = body.get('locationLat') as string | null;
      const locationLngRaw = body.get('locationLng') as string | null;
      const googlePlaceId = (body.get('googlePlaceId') as string) || undefined;

      const repo = new CommunityRepository(config.db);
      const id = await repo.createPost(userId, content, {
        imageUrl,
        postType,
        pollOptions,
        locationName,
        locationLat: locationLatRaw ? parseFloat(locationLatRaw) : undefined,
        locationLng: locationLngRaw ? parseFloat(locationLngRaw) : undefined,
        googlePlaceId,
      });
      const post = await repo.getById(id, userId);
      return c.json({ success: true, post });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deletePost(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getOptionalUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const repo = new CommunityRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const post = await repo.getById(id);
      if (!post) return c.json({ success: false, message: 'Not found' }, 404);
      if (post.user_id !== userId) return c.json({ success: false, message: 'Forbidden' }, 403);

      await repo.deletePost(id, userId);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ── Likes (member-only) ──────────────────────────────────────────────────
  async toggleLike(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getOptionalUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const repo = new CommunityRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const post = await repo.getById(id);
      if (!post) return c.json({ success: false, message: 'Not found' }, 404);

      const result = await repo.toggleLike(id, userId);
      return c.json({ success: true, ...result });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  async getComments(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new CommunityRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const comments = await repo.getComments(id);
      return c.json({ success: true, comments });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async addComment(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getOptionalUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const repo = new CommunityRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const post = await repo.getById(id);
      if (!post) return c.json({ success: false, message: 'Not found' }, 404);

      const { comment } = await c.req.json();
      const text = (comment || '').trim();
      if (!text) return c.json({ success: false, message: 'Comment text is required' }, 400);
      if (text.length > 500) return c.json({ success: false, message: 'Comment is too long (max 500 characters)' }, 400);

      const commentId = await repo.addComment(id, userId, text);
      return c.json({ success: true, id: commentId });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ── Reporting (member-facing) ─────────────────────────────────────────────
  async reportPost(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getOptionalUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const repo = new CommunityRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const post = await repo.getById(id);
      if (!post) return c.json({ success: false, message: 'Not found' }, 404);

      const { reason } = await c.req.json().catch(() => ({ reason: undefined }));
      await repo.reportPost(id, userId, reason);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ── Moderation (CRM staff — routes gated by requireCrmAuth in index.ts) ──
  async getReportedPosts(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new CommunityRepository(config.db);
      const posts = await repo.getReportedPosts();
      return c.json({ success: true, posts });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async hidePost(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new CommunityRepository(config.db);
      await repo.hidePost(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async unhidePost(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new CommunityRepository(config.db);
      await repo.unhidePost(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async dismissReports(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new CommunityRepository(config.db);
      await repo.dismissReports(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async adminDeletePost(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const repo = new CommunityRepository(config.db);
      await repo.adminDeletePost(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ── Polls ─────────────────────────────────────────────────────────────────
  async voteOnPoll(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getOptionalUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const id = parseInt(c.req.param('id'));
      const repo = new CommunityRepository(config.db);
      const post = await repo.getById(id);
      if (!post) return c.json({ success: false, message: 'Not found' }, 404);
      if (post.post_type !== 'poll') return c.json({ success: false, message: 'This post is not a poll' }, 400);

      const { optionId } = await c.req.json();
      const validOption = (post.poll_options || []).some((o: any) => o.id === optionId);
      if (!validOption) return c.json({ success: false, message: 'Invalid poll option' }, 400);

      await repo.voteOnPoll(optionId, userId);
      const updated = await repo.getById(id, userId);
      return c.json({ success: true, post: updated });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }
}

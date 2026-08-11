import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { HDService } from '../services/hdService';
import { ConfigService } from '../services/configService';
import { HDProfileRepository } from '../repositories/hdProfileRepository';
import { UserRepository } from '../repositories/userRepository';
import { RegistrationFormRepository } from '../repositories/registrationFormRepository';

export class ProfileController {
  async calculate(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const config = new ConfigService(c.env);
    const { userId, name, relation, birthInfo } = await c.req.json();
    const hdService = new HDService(config.hdApiKey, config.hdGeocodeKey);
    const hdProfileRepository = new HDProfileRepository(config.db);

    try {
      const apiResponse = await hdService.calculateChart({
        birthdate: birthInfo.date,
        birthtime: birthInfo.time,
        lat: birthInfo.lat,
        lng: birthInfo.lng
      });

      const profileData = hdService.mapResponseToProfile(
        userId, name, relation, birthInfo, apiResponse
      );

      const profileId = await hdProfileRepository.create(profileData);

      return c.json({ success: true, profileId });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async listProfiles(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const userId = c.req.query('userId');
      if (!userId) return c.json({ success: false, message: 'User ID required' }, 400);

      const hdProfileRepository = new HDProfileRepository(config.db);
      const profiles = await hdProfileRepository.findByUserId(parseInt(userId));

      return c.json({ success: true, profiles });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Roster for picking "who's attending" on a booking form (see
  // DynamicRegistrationForm's family_member_picker). Unlike listProfiles,
  // this also includes CRM-added family members (User_CRM_Children) — e.g. a
  // father a staff member added in the CRM has no HD_Profiles/Children row
  // of his own, so he'd otherwise never be selectable as an "adult" on a
  // booking. Negative ids keep these from colliding with a real
  // HD_Profiles/Children id in the same list; they can never be booked as an
  // actual class attendee (no chart, no Children row), only picked for
  // "adult" registration-form fields.
  async getBookingRoster(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const payload = c.get('jwtPayload');
      if (!payload?.userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const config = new ConfigService(c.env);
      const hdProfileRepository = new HDProfileRepository(config.db);
      const profiles = await hdProfileRepository.findByUserId(payload.userId);
      const hdRoster = (profiles as any[]).map(p => ({
        id: p.child_id || p.id,
        name: p.name,
        nickname: p.nickname,
        relation: p.relation,
        avatar: p.avatar,
      }));

      const { results: crmChildren } = await config.db.prepare(
        'SELECT id, full_name, nickname, relation FROM User_CRM_Children WHERE user_id = ?'
      ).bind(payload.userId).all();
      const crmRoster = (crmChildren as any[]).map(cc => ({
        id: -cc.id,
        name: cc.full_name,
        nickname: cc.nickname,
        relation: cc.relation,
      }));

      return c.json({ success: true, roster: [...hdRoster, ...crmRoster] });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async addChild(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      // user is populated by jwt middleware
      const payload = c.get('jwtPayload');
      if (!payload || !payload.userId) {
        return c.json({ success: false, message: 'Unauthorized' }, 401);
      }
      const userId = payload.userId;
      const childData = await c.req.json();

      if (!childData.nickname || !childData.gender) {
        return c.json({ success: false, message: 'Nickname and gender are required' }, 400);
      }

      const userRepository = new UserRepository(config.db);
      const duplicateMatches = childData.name ? await userRepository.checkDuplicateFullName(childData.name) : [];
      const duplicateWarning = duplicateMatches.length > 0
        ? `พบชื่อ-นามสกุลนี้ในระบบแล้ว: ${[...new Set(duplicateMatches.map(m => m.name))].join(', ')}`
        : undefined;
      const childId = await userRepository.addSingleChild(userId, childData);

      return c.json({ success: true, childId, duplicateWarning });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateAvatar(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const childId = parseInt(c.req.param('childId'));
      const { avatar } = await c.req.json();

      if (!avatar) {
        return c.json({ success: false, message: 'Avatar is required' }, 400);
      }

      const hdProfileRepository = new HDProfileRepository(config.db);
      const updated = await hdProfileRepository.updateAvatar(childId, avatar);

      if (updated) {
        return c.json({ success: true });
      } else {
        return c.json({ success: false, message: 'Failed to update avatar' }, 400);
      }
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async uploadAvatar(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const childId = parseInt(c.req.param('childId'));
      const body = await c.req.formData();
      const file = body.get('file') as unknown as File | null;
      if (!file) return c.json({ success: false, message: 'No file provided' }, 400);

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const key = `profiles/${childId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const buffer = await file.arrayBuffer();
      await c.env.BUCKET.put(key, buffer, {
        httpMetadata: { contentType: file.type || 'image/jpeg' },
      });

      const avatarUrl = `/api/v1/files/${key}`;

      const config = new ConfigService(c.env);
      const hdProfileRepository = new HDProfileRepository(config.db);
      // Set as the active avatar AND persist it separately so it isn't lost
      // if the user later switches to a character avatar.
      await hdProfileRepository.updateAvatar(childId, avatarUrl);
      await hdProfileRepository.updateCustomPhoto(childId, avatarUrl);

      return c.json({ success: true, url: avatarUrl });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Parent's own avatar (distinct from a child's HD_Profiles avatar) —
  // stored on Users.profile_image_url, shown small next to the Home menu
  // button, Facebook-style, and used as prep for the future Community feature.
  async uploadParentAvatar(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const payload = c.get('jwtPayload');
      if (!payload?.userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const body = await c.req.formData();
      const file = body.get('file') as unknown as File | null;
      if (!file) return c.json({ success: false, message: 'No file provided' }, 400);

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const key = `profiles/parent-${payload.userId}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const buffer = await file.arrayBuffer();
      await c.env.BUCKET.put(key, buffer, {
        httpMetadata: { contentType: file.type || 'image/jpeg' },
      });

      const avatarUrl = `/api/v1/files/${key}`;

      const config = new ConfigService(c.env);
      const userRepository = new UserRepository(config.db);
      await userRepository.updateAvatar(payload.userId, avatarUrl);

      return c.json({ success: true, url: avatarUrl });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async transferCoupon(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const payload = c.get('jwtPayload');
      if (!payload?.userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const { fromChildId, toChildId, couponTypeId, quantity } = await c.req.json();
      if (!fromChildId || !toChildId || !couponTypeId || !quantity) {
        return c.json({ success: false, message: 'fromChildId, toChildId, couponTypeId, quantity are required' }, 400);
      }

      const config = new ConfigService(c.env);
      const userRepository = new UserRepository(config.db);
      const result = await userRepository.transferChildCoupon(
        parseInt(fromChildId), parseInt(toChildId), parseInt(couponTypeId), parseInt(quantity), payload.userId
      );

      if (!result.success) return c.json(result, 400);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deletePhoto(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const childId = parseInt(c.req.param('childId'));
      const hdProfileRepository = new HDProfileRepository(config.db);
      const updated = await hdProfileRepository.deleteCustomPhoto(childId);
      return c.json({ success: updated });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateChild(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const childId = parseInt(c.req.param('childId'));
      const { name, nameEn, nickname, birth_date, dob, relation, gender } = await c.req.json();

      const hdProfileRepository = new HDProfileRepository(config.db);
      const updated = await hdProfileRepository.updateChildProfile(
        childId,
        name || '',
        nickname || '',
        birth_date || dob || null,
        relation || '',
        gender || '',
        nameEn || null
      );

      if (updated) {
        return c.json({ success: true });
      } else {
        return c.json({ success: false, message: 'Failed to update child profile' }, 400);
      }
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Soft-deletes one of the caller's own family members (child or adult) —
  // see hdProfileRepository.softDeleteFamilyMember. `id` accepts either a
  // Children.id or an HD_Profiles.id, same ambiguity useChildStore's own
  // roster mapping already has (child_id || hd_profile_id).
  async deleteFamilyMember(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const payload = c.get('jwtPayload');
      if (!payload?.userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const hdProfileRepository = new HDProfileRepository(config.db);
      const deleted = await hdProfileRepository.softDeleteFamilyMember(id, payload.userId);
      if (!deleted) return c.json({ success: false, message: 'Family member not found' }, 404);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getPendingBookings(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const userId = c.req.query('userId');
      if (!userId) return c.json({ success: false, message: 'User ID required' }, 400);

      const db = config.db;
      
      const { results } = await db.prepare(`
        SELECT 
          b.*,
          c.name as course_name,
          c.thumbnail_url as course_thumbnail,
          c.short_description as course_short_description,
          hp.nickname as child_nickname,
          hp.name as child_name,
          ch.avatar as child_avatar,
          br.name as branch_name
        FROM Bookings b
        JOIN Children ch ON b.child_id = ch.id
        JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
        JOIN Courses c ON b.course_id = c.id
        JOIN Branches br ON b.branch_id = br.id
        WHERE ch.parent_id = ? 
          AND b.payment_status = 'pending' 
          AND b.status != 'cancelled'
        ORDER BY b.created_at DESC
      `).bind(parseInt(userId)).all();

      return c.json({ success: true, bookings: results });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getUpcomingBookings(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const userId = c.req.query('userId');
      if (!userId) return c.json({ success: false, message: 'User ID required' }, 400);

      const db = config.db;
      
      const { results } = await db.prepare(`
        SELECT 
          b.*,
          c.name as course_name,
          c.thumbnail_url as course_thumbnail,
          c.short_description as course_short_description,
          hp.nickname as child_nickname,
          hp.name as child_name,
          ch.avatar as child_avatar,
          br.name as branch_name
        FROM Bookings b
        JOIN Children ch ON b.child_id = ch.id
        JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
        JOIN Courses c ON b.course_id = c.id
        JOIN Branches br ON b.branch_id = br.id
        WHERE ch.parent_id = ?
          AND b.status IN ('confirmed', 'confirmed_paid')
          AND b.scheduled_at >= datetime('now')
        ORDER BY b.scheduled_at ASC
      `).bind(parseInt(userId)).all();

      return c.json({ success: true, bookings: results });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getHistoryBookings(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const userId = c.req.query('userId');
      if (!userId) return c.json({ success: false, message: 'User ID required' }, 400);

      const db = config.db;
      
      const { results } = await db.prepare(`
        SELECT 
          b.*,
          c.name as course_name,
          c.thumbnail_url as course_thumbnail,
          c.short_description as course_short_description,
          hp.nickname as child_nickname,
          hp.name as child_name,
          ch.avatar as child_avatar,
          br.name as branch_name
        FROM Bookings b
        JOIN Children ch ON b.child_id = ch.id
        JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
        JOIN Courses c ON b.course_id = c.id
        JOIN Branches br ON b.branch_id = br.id
        WHERE ch.parent_id = ?
          AND (
            b.status IN ('completed', 'awaiting_report')
            OR (b.status IN ('confirmed', 'confirmed_paid') AND b.scheduled_at < datetime('now'))
          )
        ORDER BY b.scheduled_at DESC
      `).bind(parseInt(userId)).all();

      return c.json({ success: true, bookings: results });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // What the family filled in on the registration form for this booking —
  // shown in the consumer app's booking detail view. answers_json is keyed
  // by field_key, so pair each with its field's label for display; skip
  // 'heading' fields (no answer) and anything left blank.
  async getBookingFormAnswers(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const bookingId = c.req.param('id');
      const userId = c.req.query('userId');
      if (!userId) return c.json({ success: false, message: 'User ID required' }, 400);

      const db = config.db;
      const booking = await db.prepare(`
        SELECT b.form_submission_id
        FROM Bookings b
        JOIN Children ch ON b.child_id = ch.id
        WHERE b.id = ? AND ch.parent_id = ?
      `).bind(bookingId, userId).first() as any;

      if (!booking) return c.json({ success: false, message: 'Booking not found or access denied' }, 404);
      if (!booking.form_submission_id) return c.json({ success: true, fields: [] });

      const registrationFormRepo = new RegistrationFormRepository(db);
      const submission = await registrationFormRepo.getSubmissionWithFields(booking.form_submission_id);
      if (!submission) return c.json({ success: true, fields: [] });

      const fields = submission.fields
        .filter((f: any) => f.type !== 'heading')
        .map((f: any) => ({ label: f.label, type: f.type, value: submission.answers[f.field_key] }))
        .filter((f: any) => f.value !== undefined && f.value !== null && f.value !== '' &&
          !(Array.isArray(f.value) && f.value.length === 0));

      return c.json({ success: true, fields });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async cancelMyBooking(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const bookingId = c.req.param('id');
      const { userId } = await c.req.json(); // verify ownership

      if (!bookingId || !userId) return c.json({ success: false, message: 'Booking ID and User ID required' }, 400);

      const db = config.db;

      // Verify the booking belongs to a child of this user
      const { results } = await db.prepare(`
        SELECT b.id, b.status 
        FROM Bookings b
        JOIN Children ch ON b.child_id = ch.id
        WHERE b.id = ? AND ch.parent_id = ?
      `).bind(bookingId, userId).all();

      if (results.length === 0) {
        return c.json({ success: false, message: 'Booking not found or access denied' }, 404);
      }

      await db.prepare(`
        UPDATE Bookings 
        SET status = 'cancelled', payment_status = 'cancelled'
        WHERE id = ?
      `).bind(bookingId).run();

      return c.json({ success: true, message: 'Booking cancelled successfully' });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }
}


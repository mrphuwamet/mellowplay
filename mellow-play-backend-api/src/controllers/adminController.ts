import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { AdminRepository } from '../repositories/adminRepository';
import { UserRepository } from '../repositories/userRepository';
import { ConfigService } from '../services/configService';
import { SystemLogger } from '../utils/logger';
import { CourseMaterialRepository } from '../repositories/courseMaterialRepository';
import { SettingsRepository } from '../repositories/settingsRepository';
import { IMAGE_VIEWS, DEFAULT_FOCAL, POSTER_VIEW, clampZoom } from '../constants/imageViews';
import { AuthService } from '../services/authService';
import { sendAlert, sendNotification } from '../services/alertService';
import { SmsService } from '../services/smsService';
import { CalendarRepository } from '../repositories/calendarRepository';
import { RegistrationFormRepository } from '../repositories/registrationFormRepository';

export class AdminController {
  async getStats(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const stats = await adminRepo.getDashboardStats();
      return c.json({ success: true, stats });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // CRM-only manual customer creation — a staff-driven alternative to the
  // consumer app's OTP self-registration flow (useful when SMS delivery is
  // unreliable, or for walk-in/phone signups). Reuses the exact same
  // UserRepository.createWithChildren() the consumer app's /auth/register
  // uses; children are added afterward via the existing per-user "add
  // child" action already in UserManagement, so this only needs the parent
  // account fields.
  async createUser(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      if (!c.get('crmUser')) {
        return c.json({ success: false, message: 'Forbidden' }, 403);
      }
      const { phone, password, prefix, firstName, lastName, firstNameEn, lastNameEn, dob, email, lineId, address } = await c.req.json();

      if (!phone || !password || !firstName || !lastName) {
        return c.json({ success: false, message: 'phone, password, firstName, lastName required' }, 400);
      }

      const config = new ConfigService(c.env);
      const userRepository = new UserRepository(config.db);
      const passwordHash = await AuthService.hashPassword(password);

      const userId = await userRepository.createWithChildren(
        phone, passwordHash, firstName, lastName, [],
        email || undefined, lineId || undefined,
        true, false, address || undefined, prefix || undefined, dob || undefined,
        firstNameEn || undefined, lastNameEn || undefined
      );
      return c.json({ success: true, userId });
    } catch (error: any) {
      let message = error.message;
      if (message.includes('UNIQUE constraint failed: Users.email')) {
        message = 'อีเมลนี้ถูกใช้งานแล้ว (Email is already registered)';
      } else if (message.includes('UNIQUE constraint failed: Users.phone')) {
        message = 'เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว (Phone number is already registered)';
      }
      return c.json({ success: false, message }, 500);
    }
  }

  async getUsers(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const users = await adminRepo.getAllUsers();
      return c.json({ success: true, users });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getChildrenDirectory(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const children = await adminRepo.getChildrenDirectory();
      return c.json({ success: true, children });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getUserById(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const user = await adminRepo.getUserById(id);
      if (!user) return c.json({ success: false, message: 'User not found' }, 404);
      return c.json({ success: true, user });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateUser(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const data = await c.req.json();

      // The UPDATE statement always rewrites every column, so any field a
      // caller doesn't send must fall back to whatever is already on file —
      // otherwise a partial save (e.g. the consumer app's Settings page,
      // which only sends name/phone/email) would silently null out
      // everything else (pdpa consent, membership expiry, profile photo...).
      const current = await adminRepo.getUserById(id);
      if (!current) return c.json({ success: false, message: 'User not found' }, 404);

      // A consumer editing their own profile (no CRM token) can't change
      // phone here — that must go through the OTP-verified phone-change
      // flow (POST /auth/phone-change/*).
      const phone = !c.get('crmUser') ? current.phone : (data.phone !== undefined ? data.phone : current.phone);

      await adminRepo.updateUser(id, {
        firstName:          data.first_name !== undefined ? data.first_name : current.first_name,
        lastName:           data.last_name !== undefined ? data.last_name : current.last_name,
        firstNameEn:        data.first_name_en !== undefined ? data.first_name_en : current.first_name_en,
        lastNameEn:         data.last_name_en !== undefined ? data.last_name_en : current.last_name_en,
        prefix:             data.prefix !== undefined ? data.prefix : current.prefix,
        dob:                data.dob !== undefined ? data.dob : current.dob,
        address:            data.address !== undefined ? data.address : current.address,
        phone,
        email:              data.email !== undefined ? data.email : current.email,
        relationship:       data.relationship !== undefined ? data.relationship : current.relationship,
        lineId:             data.line_id !== undefined ? data.line_id : current.line_id,
        pdpaConsent:        data.pdpa_consent !== undefined ? data.pdpa_consent : !!current.pdpa_consent,
        marketingConsent:   data.marketing_consent !== undefined ? data.marketing_consent : (current.marketing_consent != null ? !!current.marketing_consent : null),
        applicationDate:    data.application_date !== undefined ? data.application_date : current.application_date,
        profileImageUrl:    data.profile_image_url !== undefined ? data.profile_image_url : current.profile_image_url,
        displayName:        data.display_name !== undefined ? data.display_name : current.display_name,
        isCommunityAdmin:   data.is_community_admin !== undefined ? data.is_community_admin : !!current.is_community_admin,
        children:           data.children,
      });
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Edits a child that came from the consumer app's own HD registration
  // (Children/HD_Profiles) — the CRM previously locked these rows
  // completely read-only (only CRM-created walk-in children were editable),
  // so staff had no way to fix a wrong nickname/gender/relation for a real
  // customer's kid. full_name/date_of_birth stay locked here since they
  // feed the Human Design chart calculation.
  async updateChildProfile(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const childId = parseInt(c.req.param('id'));
      const { nickname, gender, relation, name_en, membership_type, membership_expires_at } = await c.req.json();
      await adminRepo.updateHdChild(childId, {
        nickname, gender, relation, nameEn: name_en,
        membershipType: membership_type,
        membershipExpiresAt: membership_expires_at,
      });
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // CRM-driven avatar upload for a user's own profile photo (distinct from
  // profileController.uploadAvatar, which is for a CHILD's HD profile photo
  // and relies on the consumer's own JWT). The CRM frontend already POSTs
  // here with an 'avatar' file field; this endpoint never existed, so every
  // CRM-side profile photo upload silently 404'd.
  async uploadUserAvatar(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const id = parseInt(c.req.param('id'));
      const body = await c.req.formData();
      const file = body.get('avatar') as File | null;
      if (!file) return c.json({ success: false, message: 'No file provided' }, 400);

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const key = `profiles/user-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const buffer = await file.arrayBuffer();
      await c.env.BUCKET.put(key, buffer, { httpMetadata: { contentType: file.type || 'image/jpeg' } });

      const avatarUrl = `/api/v1/files/${key}`;
      const config = new ConfigService(c.env);
      await config.db.prepare('UPDATE Users SET profile_image_url = ? WHERE id = ?').bind(avatarUrl, id).run();

      return c.json({ success: true, url: avatarUrl });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async resetUserPassword(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const user = await adminRepo.getUserById(id);
      if (!user) return c.json({ success: false, message: 'User not found' }, 404);
      // TODO: integrate with email service to send reset link
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      return c.json({ success: true, message: 'Reset link sent', expires_at: expiresAt });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getUserCoupons(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const userId = parseInt(c.req.param('id'));
      const coupons = await adminRepo.getUserCoupons(userId);
      return c.json({ success: true, coupons });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async addUserCoupon(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const userId = parseInt(c.req.param('id'));
      const { type_id, label, count, expires_at, note } = await c.req.json();
      if (!type_id || !label || !expires_at) {
        return c.json({ success: false, message: 'type_id, label, and expires_at are required' }, 400);
      }
      const id = await adminRepo.addUserCoupon(userId, type_id, label, count ?? 1, expires_at, note);
      return c.json({ success: true, id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateUserCoupon(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const couponId = parseInt(c.req.param('couponId'));
      const { count, expires_at, note } = await c.req.json();
      await adminRepo.updateUserCoupon(couponId, count ?? 1, expires_at, note);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deleteUserCoupon(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const couponId = parseInt(c.req.param('couponId'));
      await adminRepo.deleteUserCoupon(couponId);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getBookings(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const branchId = c.req.query('branchId');
      const startDate = c.req.query('startDate');
      const endDate = c.req.query('endDate');
      const pendingPayment = c.req.query('pendingPayment') === '1';
      const bookings = await adminRepo.getAllBookings({ branchId, startDate, endDate, pendingPayment });
      return c.json({ success: true, bookings });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async createBooking(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const { childId, childIds, courseId, branchId, scheduledAt, isGuest, status,
              calendarId, slotDate, slotStartTime, paymentStatus, paymentMethod, notes, ageGroup, couponTypeId, promoCode, sponsorTag,
              formId, formAnswers } = await c.req.json();
      
      if (!courseId || !scheduledAt)
        return c.json({ success: false, message: 'courseId, scheduledAt required' }, 400);

      const db = config.db;

      // Extra classes and Events both have a one-off `location` field instead
      // of a branch, so branchId is legitimately absent for them — only
      // regular courses must have one.
      const courseForBranchCheck = await db.prepare('SELECT is_extraclass, is_event, registration_close_at FROM Courses WHERE id = ?').bind(parseInt(courseId)).first() as any;
      if (!courseForBranchCheck?.is_extraclass && !courseForBranchCheck?.is_event && !branchId)
        return c.json({ success: false, message: 'branchId required' }, 400);

      // Server-side mirror of the consumer app hiding the booking button
      // past this date — the button being hidden is UI-only, a direct API
      // call could still slip through without this.
      if (courseForBranchCheck?.registration_close_at && new Date(courseForBranchCheck.registration_close_at) < new Date()) {
        return c.json({
          success: false,
          error_code: 'REGISTRATION_CLOSED',
          message: 'ปิดรับลงทะเบียนสำหรับคลาส/กิจกรรมนี้แล้ว',
        }, 400);
      }

      let ids = childIds ? childIds : (childId ? [childId] : []);
      if (isGuest) ids = [0];
      const parsedChildIds = ids.map((id: any) => parseInt(id) || 0);

      if (parsedChildIds.length === 0) {
        return c.json({ success: false, message: 'No children selected' }, 400);
      }

      // Batch-fetch membership for every child in this request up front —
      // the price calculation further down needs to know which children are
      // Premium.
      const realChildIds = parsedChildIds.filter((id: number) => id > 0);
      const childPremiumMap = new Map<number, boolean>();
      // Also used below (parentUserId) to attribute a Form_Submissions row —
      // all children in one checkout share the same account, so any one of
      // them gives the right parent.
      let parentUserId: number | null = null;
      if (realChildIds.length > 0) {
        const { results: childRows } = await db.prepare(
          `SELECT id, membership_type, membership_expires_at, parent_id FROM Children WHERE id IN (${realChildIds.join(',')})`
        ).all();
        const now = new Date();
        for (const row of childRows as any[]) {
          childPremiumMap.set(row.id, row.membership_type === 'premium' && (!row.membership_expires_at || new Date(row.membership_expires_at) > now));
          if (parentUserId === null && row.parent_id) parentUserId = row.parent_id;
        }
      }

      // Registration-form duplicate check — only meaningful for a real
      // family (guests have no parent identity to dedupe against, mirroring
      // the guard already used by Check 1/Check 3 below). Scoped per field:
      // only fields the CRM builder marked with duplicate_check_scope are
      // compared, as plain normalized text against prior submissions for
      // this same form+course (and same scheduledAt for 'round' scope).
      if (formId && formAnswers && realChildIds.length > 0) {
        const registrationFormRepo = new RegistrationFormRepository(db);
        const form = await registrationFormRepo.getFormWithFields(parseInt(formId));
        if (form) {
          for (const field of (form.fields || [])) {
            if (!field.duplicate_check_scope) continue;
            const value = formAnswers[field.field_key];
            if (value == null || String(value).trim() === '') continue;
            const isDuplicate = await registrationFormRepo.findDuplicateSubmission({
              formId: parseInt(formId),
              courseId: parseInt(courseId),
              fieldKey: field.field_key,
              scope: field.duplicate_check_scope,
              normalizedValue: String(value).trim().toLowerCase(),
              scheduledAt: field.duplicate_check_scope === 'round' ? scheduledAt : undefined,
            });
            if (isDuplicate) {
              return c.json({
                success: false,
                error_code: 'DUPLICATE_FORM_SUBMISSION',
                message: 'ข้อมูลนี้เคยลงทะเบียนไว้แล้ว กรุณาตรวจสอบอีกครั้ง',
              }, 400);
            }
          }
        }
      }
      // Check for duplicates
      for (const parsedChildId of parsedChildIds) {
        if (parsedChildId > 0) {

          // Check 1: Duplicate course registration — only blocked when this
          // course is marked non-repeatable (allow_repeat = 0). This is
          // independent of is_extraclass so an admin can control it directly.
          const { results: courseDetails } = await db.prepare(`
            SELECT is_extraclass, allow_repeat FROM Courses WHERE id = ?
          `).bind(parseInt(courseId)).all();

          const isExtraClass = courseDetails[0]?.is_extraclass;
          const allowRepeat = courseDetails[0]?.allow_repeat;

          if (!allowRepeat) {
            const { results: existingBookings } = await db.prepare(`
              SELECT id, status FROM Bookings
              WHERE child_id = ? AND course_id = ?
                AND status IN ('confirmed', 'confirmed_paid', 'completed')
            `).bind(parsedChildId, parseInt(courseId)).all();

            if (existingBookings.length > 0) {
              return c.json({
                success: false,
                error_code: 'DUPLICATE_BOOKING',
                message: 'One of the selected children has already registered for this class.',
                bookingId: existingBookings[0].id
              }, 400);
            }
          }

          // Check 3: Extra Class same day restriction
          if (isExtraClass) {
            const targetDate = scheduledAt.split('T')[0];
            const { results: sameDayExtraBookings } = await db.prepare(`
              SELECT b.id FROM Bookings b
              JOIN Courses c ON b.course_id = c.id
              WHERE b.child_id = ? 
                AND c.is_extraclass = 1
                AND b.scheduled_at LIKE ?
                AND b.status IN ('confirmed', 'confirmed_paid', 'completed')
            `).bind(parsedChildId, `${targetDate}%`).all();

            if (sameDayExtraBookings.length > 0) {
              return c.json({ 
                success: false, 
                error_code: 'EXTRA_CLASS_LIMIT',
                message: 'One of the children cannot book multiple extra classes on the same day.',
                bookingId: sameDayExtraBookings[0].id
              }, 400);
            }
          }
        }
      }

      // Server-side capacity check — the frontend already grays out full
      // slots, but that's UI-only. A stale page, two parents racing for the
      // last seat, or a direct API call could all still overbook a slot
      // past its max_capacity with nothing server-side to stop it.
      if (calendarId && slotDate && slotStartTime) {
        const calendarRepo = new CalendarRepository(db);
        const availability = await calendarRepo.getSlotAvailability(
          parseInt(calendarId), slotDate, slotStartTime, branchId ? parseInt(branchId) : undefined
        );
        if (availability && availability.available < parsedChildIds.length) {
          return c.json({
            success: false,
            error_code: 'SLOT_FULL',
            message: 'ขออภัย รอบเวลานี้เต็มแล้ว กรุณาเลือกรอบเวลาอื่น'
          }, 400);
        }
      }

      // Calculate price and discount. Premium children (childPremiumMap,
      // batched above from Children.membership_type) use Courses.premium_price
      // when the course has one actually configured; everyone else (regular
      // children and guests) pays original_price — a mixed-status group (e.g.
      // one Premium and one Regular sibling in the same request) is priced
      // per child, not as one lump price times headcount.
      // premium_price's DB default is 0 (never NULL — see 0001_init.sql), so
      // every course that's never had a real premium price set would
      // otherwise silently price Premium children at 0 instead of falling
      // back to original_price. Require a positive value to count as "set".
      const courseRow = await db.prepare('SELECT id, name, original_price, premium_price FROM Courses WHERE id = ?').bind(parseInt(courseId)).first() as any;
      const basePriceFor = (childId: number): number =>
        (childId > 0 && childPremiumMap.get(childId) && courseRow?.premium_price > 0)
          ? courseRow.premium_price
          : (courseRow?.original_price ?? 0);

      // Compute active campaign discount (matching getCourses logic). The
      // winning campaign is picked the same way as before (evaluated against
      // original_price, so the choice among multiple active campaigns doesn't
      // change), but its rule (percent or flat) is then re-applied to each
      // child's own base price below — a percent-off campaign should still
      // take the same percentage off a Premium child's lower base price.
      const { results: activeCampaigns } = await db.prepare(
        "SELECT * FROM Sale_Campaigns WHERE is_active = 1"
      ).all();

      const now = new Date();
      let campaignDiscountAmt = 0;
      let campaignDiscountPct = 0;
      let bestCampaignDiscountForOriginal = 0;

      for (const camp of (activeCampaigns as any[])) {
        if (camp.valid_from && new Date(camp.valid_from) > now) continue;
        if (camp.valid_until && new Date(camp.valid_until) < now) continue;

        let itemDiscountAmt = camp.discount_amount || 0;
        let itemDiscountPct = camp.discount_percent || 0;

        try {
          const applicableIds = JSON.parse(camp.applicable_course_ids || '[]');
          const specificItem = applicableIds.find((i: any) => i.id === courseRow.id);
          if (specificItem) {
             itemDiscountAmt = specificItem.discount_amount ?? itemDiscountAmt;
             itemDiscountPct = specificItem.discount_percent ?? itemDiscountPct;
          }
        } catch(e) {}

        const discountForOriginal = itemDiscountPct > 0
          ? ((courseRow?.original_price ?? 0) * itemDiscountPct) / 100
          : itemDiscountAmt;

        if (discountForOriginal > bestCampaignDiscountForOriginal) {
          bestCampaignDiscountForOriginal = discountForOriginal;
          campaignDiscountPct = itemDiscountPct > 0 ? itemDiscountPct : 0;
          campaignDiscountAmt = itemDiscountPct > 0 ? 0 : itemDiscountAmt;
        }
      }

      const priceAfterCampaignFor = (basePrice: number): number =>
        Math.max(0, basePrice - (campaignDiscountPct > 0 ? (basePrice * campaignDiscountPct) / 100 : campaignDiscountAmt));

      // Apply promo discount if provided — same "compute the rule once,
      // apply per child" approach as the campaign discount above.
      let promoDiscountPct = 0;
      let promoDiscountAmt = 0;
      if (promoCode) {
        const promo = await db.prepare(`
          SELECT discount_amount, discount_percent FROM Promotions
          WHERE code = ? AND is_active = 1
          AND (valid_until IS NULL OR valid_until > datetime('now'))
          AND (max_uses = 0 OR current_uses < max_uses)
        `).bind(promoCode).first() as any;
        if (promo) {
          if (promo.discount_percent > 0) {
            promoDiscountPct = promo.discount_percent;
          } else {
            promoDiscountAmt = promo.discount_amount;
          }
        }
      }

      const finalPriceFor = (childId: number): number => {
        const priceAfterCampaign = priceAfterCampaignFor(basePriceFor(childId));
        const promoDiscount = promoDiscountPct > 0 ? Math.floor(priceAfterCampaign * promoDiscountPct / 100) : promoDiscountAmt;
        return Math.max(0, priceAfterCampaign - promoDiscount);
      };

      const childPrices = parsedChildIds.map((id: number) => finalPriceFor(id));
      const totalPrice = childPrices.reduce((sum: number, p: number) => sum + p, 0);
      const settingsRepo = new SettingsRepository(config.db);
      const paymentEnabled = await settingsRepo.getSetting('payment_enabled') !== '0';

      const isFree = totalPrice === 0 && paymentMethod !== 'coupon';
      const shouldBypassPayment = isFree || !paymentEnabled;
      const targetStatus = shouldBypassPayment ? 'confirmed_paid' : (status || 'pending');
      const targetPaymentStatus = shouldBypassPayment ? 'paid' : (paymentStatus || 'pending');

      // Coupon-based payment: server-side balance validation + deduction.
      // The client (Booking.tsx) already checks balance for UX, but nothing
      // previously enforced this server-side, so a booking could be created
      // with paymentMethod='coupon' without ever spending a coupon.
      if (paymentMethod === 'coupon' && couponTypeId) {
        const courseCoupon = await db.prepare(
          `SELECT quantity_required FROM CourseCoupons WHERE course_id = ? AND coupon_type_id = ?`
        ).bind(parseInt(courseId), couponTypeId).first() as any;
        const quantityRequired = courseCoupon?.quantity_required ?? 1;

        for (const parsedChildId of parsedChildIds) {
          if (parsedChildId <= 0) continue; // guest booking, no coupon to deduct
          const childCoupon = await db.prepare(
            `SELECT balance FROM ChildCoupons WHERE child_id = ? AND coupon_type_id = ?`
          ).bind(parsedChildId, couponTypeId).first() as any;
          const balance = childCoupon?.balance ?? 0;
          if (balance < quantityRequired) {
            return c.json({
              success: false,
              error_code: 'INSUFFICIENT_COUPON_BALANCE',
              message: 'One of the selected children does not have enough coupon balance for this class.'
            }, 400);
          }
        }

        for (const parsedChildId of parsedChildIds) {
          if (parsedChildId <= 0) continue;
          await db.prepare(
            `UPDATE ChildCoupons SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE child_id = ? AND coupon_type_id = ?`
          ).bind(quantityRequired, parsedChildId, couponTypeId).run();
        }
      }

      const bookingIds = [];
      for (const parsedChildId of parsedChildIds) {
        const id = await adminRepo.createBooking({
          childId: parsedChildId,
          courseId: parseInt(courseId),
          branchId: branchId ? parseInt(branchId) : null,
          scheduledAt,
          ageGroup: ageGroup || 'junior',
          status: targetStatus,
          calendarId: calendarId ? parseInt(calendarId) : undefined,
          slotDate: slotDate ?? undefined,
          slotStartTime: slotStartTime ?? undefined,
          paymentStatus: targetPaymentStatus,
          paymentMethod: paymentMethod ?? undefined,
          notes: notes ?? undefined,
          price: finalPriceFor(parsedChildId),
          sponsorTag: sponsorTag || undefined,
        });
        bookingIds.push(id);
      }

      // One Form_Submissions row per checkout (not per child) — a checkout
      // answers the form once even though it just created several sibling
      // Bookings rows above (one per child); each of those rows points back
      // at this single shared submission.
      if (formId && formAnswers && realChildIds.length > 0) {
        const registrationFormRepo = new RegistrationFormRepository(db);
        const submissionId = await registrationFormRepo.createSubmission({
          formId: parseInt(formId),
          courseId: parseInt(courseId),
          parentUserId,
          answersJson: JSON.stringify(formAnswers),
          scheduledAt,
        });
        for (const id of bookingIds) {
          await db.prepare('UPDATE Bookings SET form_submission_id = ? WHERE id = ?').bind(submissionId, id).run();
        }
      }

      const firstId = bookingIds[0];
      let beamPaymentUrl = '';
      let beamSessionId = '';

      if (!shouldBypassPayment && (!status || status === 'pending' || status === 'pending_payment')) {
        try {
          const BEAM_API_KEY = await settingsRepo.getOverridable('beam_api_key', c.env.BEAM_API_KEY);
          const BEAM_MERCHANT_ID = await settingsRepo.getOverridable('beam_merchant_id', c.env.BEAM_MERCHANT_ID);
          if (!BEAM_API_KEY || !BEAM_MERCHANT_ID) {
            throw new Error('Beam credentials not found');
          }

          const authString = btoa(`${BEAM_MERCHANT_ID}:${BEAM_API_KEY}`);
          const baseUrl = c.req.header('origin') || 'http://localhost:5173';
          const redirectUrl = `${baseUrl}/booking-success?bookingId=${firstId}`;

          const isAll = !['credit_card', 'promptpay', 'wallet', 'mobile_banking'].includes(paymentMethod);
          const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

          const netAmount = Math.round(totalPrice * 100); // Beam uses satang

          const payload = {
            linkSettings: {
              card: { isEnabled: isAll || paymentMethod === 'credit_card' },
              qrPromptPay: { isEnabled: isAll || paymentMethod === 'promptpay' },
              eWallets: { isEnabled: isAll || paymentMethod === 'wallet' },
              mobileBanking: { isEnabled: isAll || paymentMethod === 'mobile_banking' }
            },
            order: {
              currency: "THB",
              netAmount: netAmount,
              description: `Booking IDs: ${bookingIds.join(', ')}`,
              referenceId: `BK-${firstId}-${Date.now()}`
            },
            expiresAt: expiresAt,
            redirectUrl: redirectUrl
          };

          const res = await fetch('https://api.beamcheckout.com/api/v1/payment-links', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Basic ${authString}`
            },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(errText);
          }

          const data: any = await res.json();
          beamPaymentUrl = data.url;
          beamSessionId = data.id;
        } catch (e: any) {
          const logger = new SystemLogger(config.db);
          await logger.error('beam-payment', e);
          await sendAlert(config.db, 'Payment Error (Beam Checkout)', {
            bookingIds: bookingIds.join(', '), error: e.message,
          });

          // The Booking rows above were inserted optimistically so their IDs
          // could be embedded in the Beam payment-link request. If that
          // request itself fails, the user never even reached a checkout
          // page — there's no real "pending payment" to speak of, so don't
          // leave a ghost row behind for the CRM's booking list or slot
          // capacity to see as a real one.
          for (const id of bookingIds) {
            await config.db.prepare('DELETE FROM Bookings WHERE id = ?').bind(id).run();
          }

          return c.json({
            success: false,
            message: 'ระบบชำระเงินขัดข้อง กรุณาลองใหม่อีกครั้ง หรือติดต่อพนักงาน'
          }, 500);
        }

        for (const id of bookingIds) {
          await config.db.prepare('UPDATE Bookings SET beam_session_id=? WHERE id=?').bind(beamSessionId, id).run();
        }
      }

      // Only notify once payment is actually settled — free/coupon bookings
      // settle immediately (shouldBypassPayment), but a real cash booking is
      // still just "pending_payment" at this point and only becomes paid
      // asynchronously via the Beam webhook (see webhookController.ts,
      // which sends its own notification once that actually happens).
      if (shouldBypassPayment) {
        try {
          const realChildIds = parsedChildIds.filter((id: number) => id > 0);
          let childNames = 'ผู้เยี่ยมชม (Guest)';
          if (realChildIds.length > 0) {
            const { results } = await db.prepare(`
              SELECT p.nickname FROM Children c JOIN HD_Profiles p ON c.hd_profile_id = p.id
              WHERE c.id IN (${realChildIds.join(',')})
            `).all();
            childNames = (results as any[]).map(r => r.nickname).filter(Boolean).join(', ') || childNames;
          }
          const methodLabel = paymentMethod === 'coupon' ? 'คูปอง (Coupon)' : (isFree ? 'ฟรี (Free)' : (paymentMethod || 'อื่นๆ'));
          await sendNotification(config.db, 'การจองสำเร็จ (ชำระเงินแล้ว)', {
            'คลาส': courseRow?.name ?? `#${courseId}`,
            'เด็ก': childNames,
            'วันเวลา': scheduledAt,
            'ยอดชำระ': `${totalPrice.toLocaleString('th-TH')} บาท`,
            'ช่องทางชำระ': methodLabel,
            'เวลาชำระ': new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
            'รหัสจอง': bookingIds.join(', '),
          });
        } catch { /* notification must never block a successful booking */ }
      }

      return c.json({ success: true, id: firstId, bookingIds, paymentUrl: beamPaymentUrl });
    } catch (error: any) {
      const db = c.env.DB ? c.env.DB : (new ConfigService(c.env)).db;
      const logger = new SystemLogger(db);
      await logger.error('create-booking', error);
      await sendAlert(db, 'Booking Creation Failed', { error: error.message });
      return c.json({ success: false, message: 'ระบบชัดข้อง' }, 500);
    }
  }

  async getCrmUsers(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const rows = await adminRepo.getAllCrmUsers();
      const users = rows.map((u: any) => {
        let workDays: string[] = [];
        try { workDays = JSON.parse(u.work_days || '[]'); } catch { /* ignore malformed */ }
        // SQLite has no real boolean — coerce here so `{user.has_pending_reset && <Chip/>}`
        // in the CRM renders nothing (not the literal text "0") when false.
        return { ...u, work_days: workDays, has_pending_reset: !!u.has_pending_reset };
      });
      return c.json({ success: true, users });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async createCrmUser(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const data = await c.req.json();
      if (!data.password || !data.password.trim()) {
        return c.json({ success: false, message: 'password required' }, 400);
      }
      const passwordHash = await AuthService.hashPassword(data.password.trim());
      const id = await adminRepo.createCrmUser({ ...data, passwordHash });
      return c.json({ success: true, id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateCrmUser(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const data = await c.req.json();
      // Password field is optional on edit — leaving it blank keeps the
      // existing password. When provided, hash it server-side (never trust
      // a client-supplied hash).
      if (data.password && data.password.trim()) {
        data.passwordHash = await AuthService.hashPassword(data.password.trim());
      }
      await adminRepo.updateCrmUser(id, data);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deleteCrmUser(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      await adminRepo.deleteCrmUser(id);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Manual-share password reset — internal org, no email service. Generates
  // a link the admin copies and sends however's convenient (LINE, in
  // person, etc.); the staff member opens it to set their own new password.
  async resetCrmUserPassword(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      await adminRepo.setCrmUserResetToken(id, token, expiresAt);
      const origin = c.req.header('origin') || '';
      const resetLink = `${origin}/reset-password?token=${token}`;
      return c.json({ success: true, resetLink, expires_at: expiresAt });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async revokeCrmUserResetToken(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      await adminRepo.clearCrmUserResetToken(id);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getImageViews(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    return c.json({ success: true, views: IMAGE_VIEWS, poster: POSTER_VIEW });
  }

  async getCourseImageViews(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const courseId = parseInt(c.req.param('id'));
      const rows = await adminRepo.getCourseImageViews(courseId);
      return c.json({ success: true, views: rows });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateCourseImageViews(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const courseId = parseInt(c.req.param('id'));
      const { views } = await c.req.json();

      if (!Array.isArray(views)) {
        return c.json({ success: false, message: 'views must be an array' }, 400);
      }
      const validKeys = new Set(IMAGE_VIEWS.map(v => v.key));
      for (const v of views) {
        if (!validKeys.has(v.viewKey) || !v.imageUrl) {
          return c.json({ success: false, message: `invalid view entry: ${JSON.stringify(v)}` }, 400);
        }
      }
      const normalizedViews = views.map((v: any) => ({ ...v, zoom: clampZoom(v.zoom) }));

      await adminRepo.upsertCourseImageViews(courseId, normalizedViews);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getCourseImageFocals(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const courseId = parseInt(c.req.param('id'));
      const rows = await adminRepo.getCourseImageFocals(courseId);
      return c.json({ success: true, focals: rows });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateCourseImageFocals(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const courseId = parseInt(c.req.param('id'));
      const { focals } = await c.req.json();

      if (!Array.isArray(focals)) {
        return c.json({ success: false, message: 'focals must be an array' }, 400);
      }
      for (const f of focals) {
        if (!f.imageUrl) {
          return c.json({ success: false, message: `invalid focal entry: ${JSON.stringify(f)}` }, 400);
        }
      }
      const normalizedFocals = focals.map((f: any) => ({ ...f, zoom: clampZoom(f.zoom) }));

      await adminRepo.upsertCourseImageFocals(courseId, normalizedFocals);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getCourses(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const courses = await adminRepo.getAllCourses();
      
      const { results: activeCampaigns } = await config.db.prepare(
        "SELECT * FROM Sale_Campaigns WHERE is_active = 1"
      ).all();

      const now = new Date();
      
      // Must be THIS worker's own origin (wherever the upload request actually
      // landed), never the caller's — a frontend on localhost:5173 calling
      // the deployed dev worker previously got back a bogus
      // "http://localhost:8787" URL (nothing listens there), since this used
      // to guess "local frontend ⇒ local backend" from the request's Origin
      // header. x-forwarded-host covers any reverse-proxy in front of the
      // worker; otherwise the request's own URL is authoritative.
      const getOrigin = (ctx: any) => {
        const forwardedHost = ctx.req.header('x-forwarded-host');
        const forwardedProto = ctx.req.header('x-forwarded-proto') || 'https';
        if (forwardedHost) {
          return `${forwardedProto}://${forwardedHost}`;
        }
        return new URL(ctx.req.url).origin;
      };

      const origin = getOrigin(c);
      const formatUrl = (url?: string) => {
        if (!url) return url;
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
          return url;
        }
        return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
      };
      
      const processedCourses = courses.map((course: any) => {
        let bestDiscountAmt = 0;
        let bestDiscountPct = 0;
        let bestLabel = null;
        let bestValidUntil: string | null = null;
        let finalOriginalPrice = course.original_price || 0;

        for (const camp of (activeCampaigns as any[])) {
          if (camp.valid_from && new Date(camp.valid_from) > now) continue;
          if (camp.valid_until && new Date(camp.valid_until) < now) continue;

          let itemDiscountAmt = camp.discount_amount || 0;
          let itemDiscountPct = camp.discount_percent || 0;
          
          try {
            const applicableIds = JSON.parse(camp.applicable_course_ids || '[]');
            const specificItem = applicableIds.find((i: any) => i.id === course.id);
            if (specificItem) {
               itemDiscountAmt = specificItem.discount_amount ?? itemDiscountAmt;
               itemDiscountPct = specificItem.discount_percent ?? itemDiscountPct;
            }
          } catch(e) {}

          let calculatedDiscountAmt = 0;
          if (itemDiscountPct > 0) {
            calculatedDiscountAmt = (finalOriginalPrice * itemDiscountPct) / 100;
          } else {
            calculatedDiscountAmt = itemDiscountAmt;
          }

          if (calculatedDiscountAmt > bestDiscountAmt) {
            bestDiscountAmt = calculatedDiscountAmt;
            bestDiscountPct = itemDiscountPct;
            bestLabel = camp.consumer_label;
            bestValidUntil = camp.valid_until || null;
          }
        }

        // Merge configured per-view image assignments with defaults (thumbnail,
        // centered focal point) for any view the course hasn't set up yet, so
        // every consumer of this response can always render every view.
        let configuredViews: Array<{ view_key: string; image_url: string; focal_x: number; focal_y: number; zoom: number }> = [];
        try {
          configuredViews = course.image_views_json ? JSON.parse(course.image_views_json) : [];
        } catch (e) { /* ignore malformed json */ }
        const imageViews: Record<string, { imageUrl: string; focalX: number; focalY: number; zoom: number }> = {};
        for (const view of IMAGE_VIEWS) {
          const configured = configuredViews.find(v => v.view_key === view.key);
          imageViews[view.key] = configured
            ? { imageUrl: formatUrl(configured.image_url) || '', focalX: configured.focal_x, focalY: configured.focal_y, zoom: configured.zoom ?? DEFAULT_FOCAL.zoom }
            : { imageUrl: formatUrl(course.thumbnail_url) || '', focalX: DEFAULT_FOCAL.focalX, focalY: DEFAULT_FOCAL.focalY, zoom: DEFAULT_FOCAL.zoom };
        }

        // Poster gallery (Consumer course-detail page): every uploaded image
        // (thumbnail + gallery), each with its own focal point — see
        // Course_Image_Focals / POSTER_VIEW in constants/imageViews.ts.
        let configuredFocals: Array<{ image_url: string; focal_x: number; focal_y: number; zoom: number }> = [];
        try {
          configuredFocals = course.image_focals_json ? JSON.parse(course.image_focals_json) : [];
        } catch (e) { /* ignore malformed json */ }
        let galleryImages: string[] = [];
        try {
          galleryImages = course.images_json ? JSON.parse(course.images_json) : [];
        } catch (e) { /* ignore malformed json */ }
        const posterImages = [course.thumbnail_url, ...galleryImages]
          .filter(Boolean)
          .map((url: string) => {
            const configured = configuredFocals.find(f => f.image_url === url);
            return {
              imageUrl: formatUrl(url) || '',
              focalX: configured ? configured.focal_x : DEFAULT_FOCAL.focalX,
              focalY: configured ? configured.focal_y : DEFAULT_FOCAL.focalY,
              zoom: configured ? (configured.zoom ?? DEFAULT_FOCAL.zoom) : DEFAULT_FOCAL.zoom,
            };
          });

        const { image_views_json, image_focals_json, ...courseFields } = course;

        return {
          ...courseFields,
          thumbnail_url: formatUrl(course.thumbnail_url),
          detail_poster_url: formatUrl(course.detail_poster_url),
          video_url: formatUrl(course.video_url),
          teacher_guide_url: formatUrl(course.teacher_guide_url),
          image_views: imageViews,
          poster_images: posterImages,
          active_campaign_discount_amount: bestDiscountAmt,
          active_campaign_discount_percent: bestDiscountPct,
          active_campaign_label: bestLabel,
          active_campaign_valid_until: bestValidUntil
        };
      });

      return c.json({ success: true, courses: processedCourses });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getCategories(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const categories = await adminRepo.getAllCategories();
      
      // Must be THIS worker's own origin (wherever the upload request actually
      // landed), never the caller's — a frontend on localhost:5173 calling
      // the deployed dev worker previously got back a bogus
      // "http://localhost:8787" URL (nothing listens there), since this used
      // to guess "local frontend ⇒ local backend" from the request's Origin
      // header. x-forwarded-host covers any reverse-proxy in front of the
      // worker; otherwise the request's own URL is authoritative.
      const getOrigin = (ctx: any) => {
        const forwardedHost = ctx.req.header('x-forwarded-host');
        const forwardedProto = ctx.req.header('x-forwarded-proto') || 'https';
        if (forwardedHost) {
          return `${forwardedProto}://${forwardedHost}`;
        }
        return new URL(ctx.req.url).origin;
      };

      const origin = getOrigin(c);
      const formattedCategories = categories.map((cat: any) => {
        if (!cat.image_url) return cat;
        if (cat.image_url.startsWith('http://') || cat.image_url.startsWith('https://') || cat.image_url.startsWith('blob:')) {
          return cat;
        }
        return {
          ...cat,
          image_url: `${origin}${cat.image_url.startsWith('/') ? '' : '/'}${cat.image_url}`
        };
      });
      return c.json({ success: true, categories: formattedCategories });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getBranches(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const branches = await adminRepo.getAllBranches();
      return c.json({ success: true, branches });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async createBranch(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const d = await c.req.json();
      if (!d.name) return c.json({ success: false, message: 'name required' }, 400);
      const id = await new AdminRepository(config.db).createBranch(d);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async updateBranch(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const d  = await c.req.json();
      await new AdminRepository(config.db).updateBranch(id, d);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async deleteBranch(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      await new AdminRepository(config.db).deleteBranch(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // This route is intentionally public (see ADMIN_PUBLIC_ROUTES in index.ts)
  // so a guest/consumer can cancel a booking they just created mid-checkout
  // (Booking.tsx's "Cancel / Edit Order" — there's no account/token to check
  // for a guest booking at all). It previously had NO checks whatsoever
  // beyond that — anyone who knew or guessed a booking id could hard-delete
  // ANY booking, confirmed and paid or not. Now: no token needed to delete a
  // still-pending_payment booking (the actual self-cancel use case), but
  // anything else requires a real super_admin CRM token, verified here
  // manually since this route bypasses the global requireCrmAuth middleware.
  async deleteBooking(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const booking = await config.db.prepare('SELECT status FROM Bookings WHERE id = ?').bind(id).first<{ status: string }>();
      if (!booking) return c.json({ success: false, message: 'Booking not found' }, 404);

      if (booking.status !== 'pending_payment' && booking.status !== 'pending') {
        const authHeader = c.req.header('Authorization');
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const payload = token ? await AuthService.verifyToken(token, config.jwtSecret) : null;
        if (!payload || payload.type !== 'admin' || payload.role !== 'super_admin') {
          return c.json({ success: false, message: 'Forbidden — only a super admin can delete a non-pending booking' }, 403);
        }
      }

      await new AdminRepository(config.db).deleteBooking(id);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async createCourse(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const data = await c.req.json();
      const id = await adminRepo.createCourse(data);
      return c.json({ success: true, id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateCourse(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const data = await c.req.json();
      await adminRepo.updateCourse(id, data);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deleteCourse(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      await adminRepo.deleteCourse(id);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async createCategory(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const { name, description, color, imageUrl, imagePosition, type } = await c.req.json();
      if (!name?.trim()) return c.json({ success: false, message: 'กรุณาระบุชื่อหมวดหมู่' }, 400);
      const id = await adminRepo.createCategory(name.trim(), description || '', color, imageUrl, imagePosition, type);
      return c.json({ success: true, id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateCategory(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const { name, description, color, imageUrl, imagePosition, type } = await c.req.json();
      if (!name?.trim()) return c.json({ success: false, message: 'กรุณาระบุชื่อหมวดหมู่' }, 400);
      await adminRepo.updateCategory(id, name.trim(), description || '', color, imageUrl, imagePosition, type);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deleteCategory(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      await adminRepo.deleteCategory(id);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async uploadFile(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const body = await c.req.formData();
      const file = body.get('file') as File | null;
      if (!file) return c.json({ success: false, message: 'No file provided' }, 400);

      const folder = (body.get('folder') as string) || 'uploads';
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const buffer = await file.arrayBuffer();
      await c.env.BUCKET.put(key, buffer, {
        httpMetadata: { contentType: file.type || 'image/jpeg' },
      });

      // Must be THIS worker's own origin (wherever the upload request actually
      // landed), never the caller's — a frontend on localhost:5173 calling
      // the deployed dev worker previously got back a bogus
      // "http://localhost:8787" URL (nothing listens there), since this used
      // to guess "local frontend ⇒ local backend" from the request's Origin
      // header. x-forwarded-host covers any reverse-proxy in front of the
      // worker; otherwise the request's own URL is authoritative.
      const getOrigin = (ctx: any) => {
        const forwardedHost = ctx.req.header('x-forwarded-host');
        const forwardedProto = ctx.req.header('x-forwarded-proto') || 'https';
        if (forwardedHost) {
          return `${forwardedProto}://${forwardedHost}`;
        }
        return new URL(ctx.req.url).origin;
      };

      const origin = getOrigin(c);
      return c.json({ success: true, url: `${origin}/api/v1/files/${key}` });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async serveFile(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const fullKey = c.req.path.replace('/api/v1/files/', '');
      console.log('serveFile requesting fullKey:', fullKey);
      if (!c.env.BUCKET) {
        console.error('serveFile BUCKET binding is missing!');
        return c.json({ success: false, message: 'Bucket binding missing' }, 500);
      }
      // R2 accepts the incoming Range header directly and returns just that
      // byte range — required for <video> seeking/scrubbing to work at all,
      // and for iOS Safari to play video from this endpoint in the first place.
      const object = await c.env.BUCKET.get(fullKey, { range: c.req.raw.headers });
      if (!object) {
        console.warn('serveFile object not found in BUCKET for key:', fullKey);
        return c.json({ success: false, message: 'Not found' }, 404);
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('cache-control', 'public, max-age=31536000');
      headers.set('accept-ranges', 'bytes');

      if (object.range) {
        const start = 'offset' in object.range ? (object.range.offset ?? 0) : 0;
        const length = 'length' in object.range && object.range.length != null ? object.range.length : object.size - start;
        headers.set('content-range', `bytes ${start}-${start + length - 1}/${object.size}`);
        headers.set('content-length', String(length));
        return new Response(object.body as any, { status: 206, headers });
      }

      headers.set('content-length', String(object.size));
      return new Response(object.body as any, { headers });
    } catch (error: any) {
      console.error('serveFile error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getMySchedule(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const email = c.req.query('email') || '';
      const bookings = await adminRepo.getFacilitatorBookings(email);
      return c.json({ success: true, bookings });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getSkillsLibrary(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const skills = await adminRepo.getSkillsLibrary();
      return c.json({ success: true, skills });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async createSkill(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const { name, type, icon, color, nameEn } = await c.req.json();
      const id = await adminRepo.createSkill(name, type, icon, color, nameEn);
      return c.json({ success: true, id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateSkill(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const { name, type, icon, color, nameEn } = await c.req.json();
      await adminRepo.updateSkill(id, name, type, icon, color, nameEn);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deleteSkill(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      await adminRepo.deleteSkill(id);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getSystemSettings(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const settings = await adminRepo.getSystemSettings();
      return c.json({ success: true, settings });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateSystemSetting(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const { key, value } = await c.req.json();
      await adminRepo.updateSystemSetting(key, value);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Beam/SMS credentials — deliberately kept OUT of getSystemSettings()/the
  // generic settings blob (which any staff with 'settings' access can read)
  // since these are secrets. Only super_admin may view or change them, and
  // GET only ever returns a masked preview — the real value never round-trips
  // back to the browser, so re-saving an untouched masked field can't
  // overwrite the real secret with "••••1234".
  private static INTEGRATION_KEYS = [
    'beam_api_key', 'beam_merchant_id', 'sms_api_key', 'sms_api_secret', 'sms_sender_name', 'discord_webhook_url',
    'discord_notify_webhook_url', 'anthropic_api_key', 'google_ai_api_key', 'translation_provider', 'line_liff_id',
  ] as const;
  // sms_sender_name is the registered ThaiBulkSMS sender ID shown to
  // recipients — a display label, not a credential, so it isn't masked.
  // translation_provider is a plain choice ('claude' | 'gemini'), not a secret either.
  // line_liff_id is meant to be embedded in the consumer app's client-side JS
  // (liff.init({ liffId })), so it's public by design — not a secret either.
  private static NON_SENSITIVE_KEYS = new Set(['sms_sender_name', 'translation_provider', 'line_liff_id']);

  private mask(key: string, value: string): string {
    if (!value) return '';
    if (AdminController.NON_SENSITIVE_KEYS.has(key)) return value;
    return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
  }

  async getIntegrationKeys(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      if (c.get('crmUser')?.role !== 'super_admin') {
        return c.json({ success: false, message: 'Forbidden' }, 403);
      }
      const config = new ConfigService(c.env);
      const settingsRepo = new SettingsRepository(config.db);
      const envFallback: Record<string, string> = {
        beam_api_key: c.env.BEAM_API_KEY, beam_merchant_id: c.env.BEAM_MERCHANT_ID,
        sms_api_key: c.env.SMS_API_KEY, sms_api_secret: c.env.SMS_API_SECRET,
        sms_sender_name: 'Demo', discord_webhook_url: '', discord_notify_webhook_url: '',
        anthropic_api_key: '', google_ai_api_key: '', translation_provider: 'claude',
        line_liff_id: '',
      };
      const keys: Record<string, { masked: string; isSet: boolean }> = {};
      for (const key of AdminController.INTEGRATION_KEYS) {
        const value = await settingsRepo.getOverridable(key, envFallback[key] || '');
        keys[key] = { masked: this.mask(key, value), isSet: !!value };
      }
      return c.json({ success: true, keys });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateIntegrationKeys(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      if (c.get('crmUser')?.role !== 'super_admin') {
        return c.json({ success: false, message: 'Forbidden' }, 403);
      }
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const body = await c.req.json();
      for (const key of AdminController.INTEGRATION_KEYS) {
        // Empty/omitted = leave untouched (this is how the masked-value
        // re-save case is handled — the frontend never sends a field back
        // unless the user actually typed a new value into it).
        if (typeof body[key] === 'string' && body[key].trim()) {
          await adminRepo.updateSystemSetting(key, body[key].trim());
        }
      }
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Public (no auth) — the consumer app needs the LIFF ID client-side to call
  // liff.init(). Deliberately its own tiny endpoint rather than reusing
  // getIntegrationKeys, since that one is super_admin-only and also returns
  // masked previews of actual secrets (Beam/SMS/Discord/AI keys).
  async getPublicLiffConfig(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const settingsRepo = new SettingsRepository(config.db);
      const liffId = await settingsRepo.getOverridable('line_liff_id', c.env.LINE_LIFF_ID || '');
      return c.json({ success: true, liffId: liffId || null });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Lets a super_admin verify a just-pasted key actually works, without
  // waiting for a real booking/OTP/alert to exercise it. Always tests
  // whatever is CURRENTLY configured (DB override, falling back to the
  // Cloudflare secret) — never the unsaved text in the CRM's input field.
  async testIntegration(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      if (c.get('crmUser')?.role !== 'super_admin') {
        return c.json({ success: false, message: 'Forbidden' }, 403);
      }
      const { service, phone } = await c.req.json();
      const config = new ConfigService(c.env);
      const settingsRepo = new SettingsRepository(config.db);

      if (service === 'discord') {
        // Two independent channels (errors vs. signup/booking activity) — test
        // whichever of the two are configured and report each separately.
        const channels: { key: string; label: string }[] = [
          { key: 'discord_webhook_url', label: 'แจ้งเตือน Error' },
          { key: 'discord_notify_webhook_url', label: 'แจ้งเตือนสมาชิกใหม่/การจอง' },
        ];
        const results: string[] = [];
        let anyConfigured = false;
        let allOk = true;

        for (const { key, label } of channels) {
          const webhookUrl = await settingsRepo.getOverridable(key, '');
          if (!webhookUrl) continue;
          anyConfigured = true;
          try {
            const res = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                embeds: [{
                  title: '✅ ทดสอบการเชื่อมต่อจาก Mellow Play CRM',
                  description: `ช่อง: ${label} — ถ้าเห็นข้อความนี้ แปลว่า Discord Webhook เชื่อมต่อสำเร็จ`,
                  color: 0x22c55e,
                  timestamp: new Date().toISOString(),
                }],
              }),
            });
            if (!res.ok) {
              const text = await res.text();
              allOk = false;
              results.push(`${label}: ผิดพลาด ${res.status}: ${text.slice(0, 200)}`);
            } else {
              results.push(`${label}: สำเร็จ`);
            }
          } catch (e: any) {
            allOk = false;
            results.push(`${label}: ผิดพลาด ${e.message}`);
          }
        }

        if (!anyConfigured) return c.json({ success: false, message: 'ยังไม่ได้ตั้งค่า Discord Webhook URL' }, 400);
        return c.json({ success: allOk, message: results.join(' | ') }, allOk ? 200 : 400);
      }

      if (service === 'sms') {
        if (!phone) return c.json({ success: false, message: 'กรุณาระบุเบอร์โทรศัพท์สำหรับทดสอบ' }, 400);
        const apiKey = await settingsRepo.getOverridable('sms_api_key', c.env.SMS_API_KEY);
        const apiSecret = await settingsRepo.getOverridable('sms_api_secret', c.env.SMS_API_SECRET);
        const senderName = await settingsRepo.getOverridable('sms_sender_name', 'Demo');
        if (!apiKey || !apiSecret) return c.json({ success: false, message: 'ยังไม่ได้ตั้งค่า SMS API Key/Secret' }, 400);

        const sms = new SmsService(apiKey, apiSecret, senderName);
        const result = await sms.sendTest(phone);
        if (!result.ok) return c.json({ success: false, message: `ส่ง SMS ทดสอบไม่สำเร็จ: ${result.detail || 'unknown error'}` }, 400);
        return c.json({ success: true, message: `ส่ง SMS ทดสอบไปที่ ${phone} แล้ว` });
      }

      if (service === 'beam') {
        const apiKey = await settingsRepo.getOverridable('beam_api_key', c.env.BEAM_API_KEY);
        const merchantId = await settingsRepo.getOverridable('beam_merchant_id', c.env.BEAM_MERCHANT_ID);
        if (!apiKey || !merchantId) return c.json({ success: false, message: 'ยังไม่ได้ตั้งค่า Beam API Key/Merchant ID' }, 400);

        const authString = btoa(`${merchantId}:${apiKey}`);
        // Mirrors createBooking()'s real payload shape exactly (including
        // redirectUrl) — Beam's gateway can return an opaque 502 instead of
        // a clean validation error when a required field like this is missing.
        const baseUrl = c.req.header('origin') || 'https://mellowplay.co';
        const res = await fetch('https://api.beamcheckout.com/api/v1/payment-links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${authString}` },
          body: JSON.stringify({
            linkSettings: { card: { isEnabled: true }, qrPromptPay: { isEnabled: true }, eWallets: { isEnabled: true }, mobileBanking: { isEnabled: true } },
            order: { currency: 'THB', netAmount: 100, description: 'CRM Test Connection (ทดสอบการเชื่อมต่อ)', referenceId: `TEST-${Date.now()}` },
            expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            redirectUrl: `${baseUrl}/`,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          return c.json({ success: false, message: `Beam ตอบกลับ ${res.status}: ${text.slice(0, 300)}` }, 400);
        }
        const data: any = await res.json();
        return c.json({ success: true, message: 'สร้างลิงก์จ่ายเงินทดสอบสำเร็จ (คีย์เชื่อมต่อได้จริง) — ไม่ต้องกดจ่าย ลิงก์นี้จะหมดอายุใน 5 นาที', testUrl: data.url });
      }

      if (service === 'claude' || service === 'gemini') {
        try {
          const testPrompt = 'Translate the following text from Thai to English. Output ONLY the translated text.\n\nสวัสดี';
          const translatedText = service === 'gemini'
            ? await this.translateWithGemini(settingsRepo, c.env, testPrompt)
            : await this.translateWithClaude(settingsRepo, c.env, testPrompt);
          return c.json({ success: true, message: `เชื่อมต่อสำเร็จ — ทดสอบแปล "สวัสดี" ได้ผลลัพธ์: "${translatedText}"` });
        } catch (e: any) {
          return c.json({ success: false, message: e.message }, 400);
        }
      }

      return c.json({ success: false, message: 'Unknown service' }, 400);
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getBranchSettings(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const branch = await adminRepo.getBranchById(id);
      return c.json({ success: true, settings: { defaultCapacity: branch?.default_capacity || 4 } });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateBranchSettings(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const { defaultCapacity } = await c.req.json();
      await config.db.prepare('UPDATE Branches SET default_capacity = ? WHERE id = ?').bind(defaultCapacity, id).run();
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getTimeSlots(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const branchId = c.req.query('branchId');
      const date = c.req.query('date');
      const slots = await adminRepo.getAllTimeSlots(branchId, date);
      return c.json({ success: true, slots });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async createTimeSlot(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const data = await c.req.json();
      const id = await adminRepo.createTimeSlot(data);
      return c.json({ success: true, id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateTimeSlot(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      const data = await c.req.json();
      await adminRepo.updateTimeSlot(id, data);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deleteTimeSlot(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      await adminRepo.deleteTimeSlot(id);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // --- Branch Default Slots Endpoints ---
  async getBranchDefaultSlots(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const branchId = c.req.query('branchId');
      if (!branchId) return c.json({ success: false, message: 'branchId is required' }, 400);
      const slots = await adminRepo.getBranchDefaultSlots(parseInt(branchId));
      return c.json({ success: true, slots });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async createBranchDefaultSlot(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const data = await c.req.json();
      const id = await adminRepo.createBranchDefaultSlot(data);
      return c.json({ success: true, id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async deleteBranchDefaultSlot(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const id = parseInt(c.req.param('id'));
      await adminRepo.deleteBranchDefaultSlot(id);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async clearDayTimeSlots(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const branchId = c.req.query('branchId');
      const date = c.req.query('date');
      if (!branchId || !date) return c.json({ success: false, message: 'branchId and date are required' }, 400);
      await adminRepo.clearDayTimeSlots(parseInt(branchId), date);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getSlotOccupancy(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const branchId = c.req.query('branchId');
      const date = c.req.query('date');
      if (!branchId || !date) return c.json({ success: false, message: 'branchId and date are required' }, 400);
      const occupancy = await adminRepo.getSlotOccupancy(parseInt(branchId), date);
      return c.json({ success: true, occupancy });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // --- POS Endpoints ---
  async posLookupMember(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { phone } = await c.req.json();
      const user = await config.db.prepare('SELECT id, phone, first_name, last_name FROM Users WHERE phone = ?').bind(phone).first();
      if (!user) return c.json({ success: false, message: 'Member not found' }, 404);
      
      // Fetch children and their coupons
      const { results: children } = await config.db.prepare(`
        SELECT 
          c.id, h.name, h.birth_date,
          COALESCE(mc.little_junior_balance, 0) as little_junior_balance,
          COALESCE(mc.junior_balance, 0) as junior_balance
        FROM Children c
        JOIN HD_Profiles h ON c.hd_profile_id = h.id
        LEFT JOIN Member_Coupons mc ON c.id = mc.child_id
        WHERE c.parent_id = ?
      `).bind(user.id).all();
      
      return c.json({ 
        success: true, 
        member: { ...user, children } 
      });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async posProcessTopup(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { branchId, userId, childId, itemType, quantity, amount, paymentMethod } = await c.req.json();
      
      const couponColumn = itemType === 'little_junior' ? 'little_junior_balance' : 'junior_balance';

      await config.db.batch([
        // 1. Record Transaction
        config.db.prepare(`
          INSERT INTO Transactions (branch_id, user_id, child_id, type, amount, payment_method, item_type, quantity)
          VALUES (?, ?, ?, 'topup', ?, ?, ?, ?)
        `).bind(branchId, userId, childId, amount, paymentMethod, itemType, quantity),
        
        // 2. Update Coupon Balance
        config.db.prepare(`
          INSERT INTO Member_Coupons (child_id, ${couponColumn})
          VALUES (?, ?)
          ON CONFLICT(child_id) DO UPDATE SET ${couponColumn} = ${couponColumn} + excluded.${couponColumn}, updated_at = CURRENT_TIMESTAMP
        `).bind(childId, quantity)
      ]);

      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async posProcessSale(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { userId, childId, branchId, date, startTime, courseId, ageGroup, isGuest, paymentMethod, salesStaffId, teachingStaffId, calendarId, notes } = await c.req.json();

      const scheduledAt = `${date} ${startTime || '00:00'}`;
      const course = await config.db.prepare('SELECT original_price FROM Courses WHERE id=?').bind(courseId).first() as any;
      const coursePrice = course?.original_price ?? 0;

      const materialRepo = new CourseMaterialRepository(config.db);

      if (isGuest) {
        await config.db.prepare(`
          INSERT INTO Bookings (child_id, course_id, branch_id, scheduled_at, status, age_group, calendar_id, slot_date, slot_start_time, payment_status, notes, teaching_staff_id)
          VALUES (0, ?, ?, ?, 'confirmed_paid', ?, ?, ?, ?, 'prepaid', ?, ?)
        `).bind(courseId, branchId, scheduledAt, ageGroup, calendarId ?? null, date ?? null, startTime ?? null, notes ?? null, teachingStaffId ?? null).run();
        const booking = await config.db.prepare(
          'SELECT id FROM Bookings WHERE course_id=? AND branch_id=? AND scheduled_at=? ORDER BY id DESC LIMIT 1'
        ).bind(courseId, branchId, scheduledAt).first() as any;
        await config.db.prepare(`
          INSERT INTO Transactions (branch_id, type, amount, payment_method, item_type, course_id, sales_staff_id, teaching_staff_id, booking_id)
          VALUES (?, 'guest_sale', ?, ?, ?, ?, ?, ?, ?)
        `).bind(branchId, coursePrice, paymentMethod || 'cash', ageGroup, courseId, salesStaffId ?? null, teachingStaffId ?? null, booking?.id ?? null).run();
        if (booking) await materialRepo.reserveStock(booking.id, courseId);
        return c.json({ success: true });
      }

      const couponColumn = ageGroup === 'little_junior' ? 'little_junior_balance' : 'junior_balance';
      const balance = await config.db.prepare(`SELECT ${couponColumn} FROM Member_Coupons WHERE child_id = ?`).bind(childId).first();

      if (!balance || (balance[couponColumn] as number) <= 0) {
        return c.json({ success: false, message: 'Insufficient coupons for this child' }, 400);
      }

      await config.db.prepare(`UPDATE Member_Coupons SET ${couponColumn} = ${couponColumn} - 1, updated_at = CURRENT_TIMESTAMP WHERE child_id = ?`).bind(childId).run();
      await config.db.prepare(`
        INSERT INTO Bookings (child_id, course_id, branch_id, scheduled_at, status, age_group, calendar_id, slot_date, slot_start_time, payment_status, notes, teaching_staff_id)
        VALUES (?, ?, ?, ?, 'confirmed_paid', ?, ?, ?, ?, 'prepaid', ?, ?)
      `).bind(childId, courseId, branchId, scheduledAt, ageGroup, calendarId ?? null, date ?? null, startTime ?? null, notes ?? null, teachingStaffId ?? null).run();
      const booking = await config.db.prepare(
        'SELECT id FROM Bookings WHERE course_id=? AND branch_id=? AND scheduled_at=? ORDER BY id DESC LIMIT 1'
      ).bind(courseId, branchId, scheduledAt).first() as any;
      await config.db.prepare(`
        INSERT INTO Transactions (branch_id, user_id, child_id, type, amount, payment_method, item_type, course_id, sales_staff_id, teaching_staff_id, booking_id)
        VALUES (?, ?, ?, 'class_booking', ?, 'coupon', ?, ?, ?, ?, ?)
      `).bind(branchId, userId ?? null, childId, coursePrice, ageGroup, courseId, salesStaffId ?? null, teachingStaffId ?? null, booking?.id ?? null).run();
      if (booking) await materialRepo.reserveStock(booking.id, courseId);

      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async updateBookingStatus(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const { status, scheduledAt, paidAt, calendarId, slotDate, slotStartTime } = await c.req.json();
      // Every status value actually used anywhere in the system (both the
      // 'pending'/'pending_payment' naming variants included — the two are
      // used inconsistently across the codebase for the same conceptual
      // state) — a Super Admin correcting a booking needs to be able to set
      // any of them, not a limited subset.
      const allowed = ['pending_payment', 'pending', 'confirmed', 'confirmed_paid', 'awaiting_report', 'completed', 'cancelled'];
      if (!allowed.includes(status)) return c.json({ success: false, message: 'invalid status' }, 400);

      // scheduledAt/paidAt are optional overrides for Super Admin error-correction
      // (e.g. backdating a payment or fixing a wrong class date) — normal status
      // changes (complete/cancel) omit them and only the status column updates.
      //
      // payment_status is kept in sync with status here — this endpoint used to
      // touch status alone, so forcing a booking to confirmed_paid (e.g. to
      // correct one the Beam webhook missed — see webhookController.ts) left
      // payment_status stuck at its old value. The class-capacity count reads
      // payment_status, not status, so that mismatch made a genuinely paid,
      // confirmed booking invisible to seat availability — the class looked
      // like it still had room when it didn't.
      const sets = ['status = ?'];
      const binds: any[] = [status];
      if (status === 'confirmed_paid' || status === 'confirmed' || status === 'completed' || status === 'awaiting_report') {
        sets.push("payment_status = 'paid'");
      } else if (status === 'pending' || status === 'pending_payment') {
        sets.push("payment_status = 'pending'");
      }
      if (scheduledAt) {
        sets.push('scheduled_at = ?'); binds.push(scheduledAt);
        // slot_date/slot_start_time are separate columns from scheduled_at
        // (set at booking creation from the round the customer picked) that
        // the Bookings list's "group by round" view reads preferentially —
        // this endpoint used to touch scheduled_at alone, so rescheduling a
        // booking to a new round left it grouped under its old, now-stale
        // round forever. The picker on the frontend sends the exact
        // slotDate/slotStartTime of the round it just booked; anything
        // typed as a raw date+time (calendar-less courses) has no real slot
        // to reference, so fall back to deriving it from scheduledAt itself
        // ("YYYY-MM-DD HH:MM:SS") so the two can never drift apart again.
        const [derivedDate, derivedTime] = String(scheduledAt).split(' ');
        sets.push('slot_date = ?'); binds.push(slotDate ?? derivedDate ?? null);
        sets.push('slot_start_time = ?'); binds.push(slotStartTime ?? derivedTime ?? null);
      }
      if (calendarId) { sets.push('calendar_id = ?'); binds.push(parseInt(calendarId)); }
      if (paidAt) { sets.push('paid_at = ?'); binds.push(paidAt); }
      binds.push(id);

      await config.db.prepare(`UPDATE Bookings SET ${sets.join(', ')} WHERE id=?`).bind(...binds).run();

      // getAllBookings/CSV export/booking-detail all show COALESCE(t.created_at,
      // b.paid_at) — a Transaction row exists for virtually every paid booking,
      // so without this the b.paid_at override above is silently invisible
      // everywhere it's actually displayed. Keep the transaction's own
      // timestamp in sync so the correction is actually visible.
      if (paidAt) {
        await config.db.prepare(
          `UPDATE Transactions SET created_at = ? WHERE booking_id = ? AND is_voided = 0`
        ).bind(paidAt, id).run();
      }

      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async getBookingTransactions(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const { results } = await config.db.prepare(`
        SELECT t.*, b.name AS branch_name, cu.full_name AS staff_name, co.name AS course_name
        FROM Transactions t
        LEFT JOIN Branches b   ON t.branch_id = b.id
        LEFT JOIN CRM_Users cu ON t.sales_staff_id = cu.id
        LEFT JOIN Courses co   ON t.course_id = co.id
        WHERE t.booking_id = ?
        ORDER BY t.created_at DESC
      `).bind(id).all();
      return c.json({ success: true, transactions: results });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async payBooking(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const { paymentMethod, salesStaffId } = await c.req.json();
      if (!paymentMethod) return c.json({ success: false, message: 'paymentMethod required' }, 400);

      const booking = await config.db.prepare(`
        SELECT b.*, co.original_price, co.name AS course_name
        FROM Bookings b
        JOIN Courses co ON b.course_id = co.id
        WHERE b.id = ?
      `).bind(id).first() as any;
      if (!booking) return c.json({ success: false, message: 'Booking not found' }, 404);

      const existing = await config.db.prepare(
        'SELECT id FROM Transactions WHERE booking_id=? AND is_voided=0 LIMIT 1'
      ).bind(id).first();
      if (existing) return c.json({ success: false, message: 'Booking already has an active transaction' }, 409);

      await config.db.prepare(`
        INSERT INTO Transactions (branch_id, type, amount, payment_method, item_type, course_id, sales_staff_id, booking_id)
        VALUES (?, 'guest_sale', ?, ?, ?, ?, ?, ?)
      `).bind(booking.branch_id, booking.original_price ?? 0, paymentMethod, booking.age_group ?? 'junior',
              booking.course_id, salesStaffId ?? null, id).run();

      await config.db.prepare(
        `UPDATE Bookings SET payment_status='prepaid', status=CASE WHEN status='pending' THEN 'confirmed_paid' ELSE status END WHERE id=?`
      ).bind(id).run();

      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async voidTransaction(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const { reason } = await c.req.json();
      if (!reason?.trim()) return c.json({ success: false, message: 'reason required' }, 400);
      await config.db.prepare(
        'UPDATE Transactions SET is_voided=1, void_reason=?, voided_at=CURRENT_TIMESTAMP WHERE id=?'
      ).bind(reason.trim(), id).run();
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async posProcessPackageSale(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { packageId, userId, branchId, isGuest, paymentMethod, salesStaffId } = await c.req.json();

      const pkg = await config.db.prepare('SELECT * FROM Packages WHERE id=?').bind(packageId).first() as any;
      if (!pkg) return c.json({ success: false, message: 'Package not found' }, 404);

      const coupons: { typeId: string; quantity: number }[] = JSON.parse(pkg.coupons_json || '[]');
      const expiresAt = new Date(Date.now() + (pkg.premium_days || 30) * 86400000).toISOString().slice(0, 10);

      const stmts: any[] = [
        config.db.prepare(`
          INSERT INTO Transactions (branch_id, user_id, type, amount, payment_method, package_id, sales_staff_id)
          VALUES (?, ?, 'package_sale', ?, ?, ?, ?)
        `).bind(branchId, userId ?? null, pkg.price, paymentMethod || 'cash', packageId, salesStaffId ?? null),
      ];

      if (!isGuest && userId) {
        for (const coupon of coupons) {
          stmts.push(
            config.db.prepare(`
              INSERT INTO User_Coupons (user_id, type_id, label, count, expires_at)
              VALUES (?, ?, ?, ?, ?)
            `).bind(userId, coupon.typeId, pkg.name, coupon.quantity, expiresAt)
          );
        }
      }

      await config.db.batch(stmts);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getSystemLogs(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { results } = await config.db.prepare('SELECT * FROM System_Logs ORDER BY created_at DESC LIMIT 100').all();
      return c.json({ success: true, logs: results });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  // Was previously registered as a route (index.ts) with no method body at
  // all — DELETE /system/logs 500'd every time, even though the CRM's own
  // confirm dialog already promised "delete logs older than 30 days". This
  // is that promise, finally implemented, on the same cutoff the scheduled()
  // cron in index.ts uses so manual and automatic cleanup never disagree.
  async clearSystemLogs(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = await config.db.prepare('DELETE FROM System_Logs WHERE created_at < ?').bind(cutoff).run();
      return c.json({ success: true, deleted: result.meta.changes });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  // Api_Call_Logs can grow large (every request, with bodies) — unlike
  // getSystemLogs' flat LIMIT 100, this supports real pagination plus
  // server-side filtering so the CRM viewer doesn't have to pull everything
  // to filter client-side.
  async getApiCallLogs(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') || '50', 10) || 50));
      const offset = Math.max(0, parseInt(c.req.query('offset') || '0', 10) || 0);
      const method = c.req.query('method');
      const status = c.req.query('status');
      const callerType = c.req.query('callerType');
      const pathSearch = c.req.query('path');

      const conditions: string[] = [];
      const params: any[] = [];
      if (method) { conditions.push('method = ?'); params.push(method); }
      if (status && !isNaN(parseInt(status, 10))) { conditions.push('status_code = ?'); params.push(parseInt(status, 10)); }
      if (callerType) { conditions.push('caller_type = ?'); params.push(callerType); }
      if (pathSearch) { conditions.push('path LIKE ?'); params.push(`%${pathSearch}%`); }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const { results } = await config.db.prepare(
        `SELECT * FROM Api_Call_Logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      ).bind(...params, limit, offset).all();

      const totalRow = await config.db.prepare(
        `SELECT COUNT(*) as total FROM Api_Call_Logs ${where}`
      ).bind(...params).first<any>();

      return c.json({ success: true, logs: results, total: totalRow?.total || 0 });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async clearApiCallLogs(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const result = await config.db.prepare('DELETE FROM Api_Call_Logs WHERE created_at < ?').bind(cutoff).run();
      return c.json({ success: true, deleted: result.meta.changes });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  // AI machine translation (Claude or Gemini, whichever the CRM's Settings
  // page has selected) for the news writer's "Auto Translate" button — a
  // draft translation the admin can then hand-edit. No silent fallback
  // between providers: if the selected one fails, the admin sees why
  // (wrong/missing key, etc.) rather than getting a worse translation
  // from a provider they didn't choose.
  async translateText(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const { text, from, to } = await c.req.json();
      if (!text || !from || !to) {
        return c.json({ success: false, message: 'text, from, to are required' }, 400);
      }

      const config = new ConfigService(c.env);
      const settingsRepo = new SettingsRepository(config.db);
      const provider = (await settingsRepo.getOverridable('translation_provider', 'claude')) || 'claude';
      const langName = (code: string) => (code === 'th' ? 'Thai' : code === 'en' ? 'English' : code);
      const prompt = `Translate the following text from ${langName(from)} to ${langName(to)}. Output ONLY the translated text with no explanation, no quotes, and no preamble. Preserve line breaks.\n\n${text}`;

      const translatedText = provider === 'gemini'
        ? await this.translateWithGemini(settingsRepo, c.env, prompt)
        : await this.translateWithClaude(settingsRepo, c.env, prompt);

      return c.json({ success: true, translatedText });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  private async translateWithClaude(settingsRepo: SettingsRepository, env: Bindings, prompt: string): Promise<string> {
    const apiKey = await settingsRepo.getOverridable('anthropic_api_key', env.ANTHROPIC_API_KEY || '');
    if (!apiKey) throw new Error('ยังไม่ได้ตั้งค่า Anthropic API Key');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Claude API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data: any = await res.json();
    return data?.content?.[0]?.text?.trim() || '';
  }

  private async translateWithGemini(settingsRepo: SettingsRepository, env: Bindings, prompt: string): Promise<string> {
    const apiKey = await settingsRepo.getOverridable('google_ai_api_key', env.GOOGLE_AI_API_KEY || '');
    if (!apiKey) throw new Error('ยังไม่ได้ตั้งค่า Google AI (Gemini) API Key');

    // "-latest" is Google's rolling alias, always pointing at the current
    // recommended Flash model — avoids hardcoding a dated version name that
    // Google later retires out from under this endpoint.
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 300)}`);
    }
    const data: any = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  // Mirrors the same WHERE clause createBooking() uses when actually
  // applying a promo code at booking time — kept identical so "Apply"
  // preview here never disagrees with what the booking ends up discounting.
  async validatePromoCode(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const code = c.req.query('code');
      const price = parseFloat(c.req.query('price') || '0');
      if (!code) return c.json({ success: false, message: 'กรุณากรอกโค้ดส่วนลด' }, 400);

      const promo = await config.db.prepare(`
        SELECT discount_amount, discount_percent FROM Promotions
        WHERE code = ? AND is_active = 1
        AND (valid_until IS NULL OR valid_until > datetime('now'))
        AND (max_uses = 0 OR current_uses < max_uses)
      `).bind(code).first() as any;

      if (!promo) {
        return c.json({ success: false, message: 'ไม่พบโค้ด หรือ โค้ดหมดอายุ' }, 404);
      }

      let discountAmount = promo.discount_percent > 0
        ? Math.floor(price * promo.discount_percent / 100)
        : promo.discount_amount;
      discountAmount = Math.max(0, Math.min(discountAmount, price));

      return c.json({ success: true, discountAmount });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getPromotions(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { results } = await config.db.prepare(`
        SELECT * FROM Promotions ORDER BY created_at DESC
      `).all();
      return c.json({ success: true, promotions: results });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async createPromotion(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { code, description, discount_amount, discount_percent, max_uses, valid_from, valid_until, applicable_course_ids, applicable_service_ids, consumer_label, is_active } = await c.req.json();
      if (!code) return c.json({ success: false, message: 'Code is required' }, 400);
      await config.db.prepare(`
        INSERT INTO Promotions (code, description, discount_amount, discount_percent, max_uses, valid_from, valid_until, applicable_course_ids, applicable_service_ids, consumer_label, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        code.toUpperCase().trim(),
        description || null,
        discount_amount || 0,
        discount_percent || 0,
        max_uses || 0,
        valid_from || null,
        valid_until || null,
        JSON.stringify(applicable_course_ids || []),
        JSON.stringify(applicable_service_ids || []),
        consumer_label || null,
        is_active === false ? 0 : 1
      ).run();
      return c.json({ success: true });
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) return c.json({ success: false, message: 'Promo code already exists' }, 400);
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async updatePromotion(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const { code, description, discount_amount, discount_percent, max_uses, valid_from, valid_until, applicable_course_ids, applicable_service_ids, consumer_label, is_active } = await c.req.json();
      await config.db.prepare(`
        UPDATE Promotions SET 
          code=?, description=?, discount_amount=?, discount_percent=?, max_uses=?,
          valid_from=?, valid_until=?, applicable_course_ids=?, applicable_service_ids=?, consumer_label=?, is_active=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(
        code.toUpperCase().trim(),
        description || null,
        discount_amount || 0,
        discount_percent || 0,
        max_uses || 0,
        valid_from || null,
        valid_until || null,
        JSON.stringify(applicable_course_ids || []),
        JSON.stringify(applicable_service_ids || []),
        consumer_label || null,
        is_active === false ? 0 : 1,
        id
      ).run();
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async deletePromotion(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      await config.db.prepare('DELETE FROM Promotions WHERE id=?').bind(id).run();
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  // --- Campaigns (Auto-applied Sales) ---
  async getCampaigns(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { results } = await config.db.prepare(`
        SELECT * FROM Sale_Campaigns ORDER BY created_at DESC
      `).all();
      return c.json({ success: true, campaigns: results });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async createCampaign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { name, description, discount_amount, discount_percent, valid_from, valid_until, applicable_course_ids, applicable_service_ids, consumer_label, is_active } = await c.req.json();
      if (!name) return c.json({ success: false, message: 'Name is required' }, 400);
      
      await config.db.prepare(`
        INSERT INTO Sale_Campaigns (name, description, discount_amount, discount_percent, valid_from, valid_until, applicable_course_ids, applicable_service_ids, consumer_label, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        name.trim(),
        description || null,
        discount_amount || 0,
        discount_percent || 0,
        valid_from || null,
        valid_until || null,
        JSON.stringify(applicable_course_ids || []),
        JSON.stringify(applicable_service_ids || []),
        consumer_label || null,
        is_active === false ? 0 : 1
      ).run();
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async updateCampaign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const { name, description, discount_amount, discount_percent, valid_from, valid_until, applicable_course_ids, applicable_service_ids, consumer_label, is_active } = await c.req.json();
      if (!name) return c.json({ success: false, message: 'Name is required' }, 400);

      await config.db.prepare(`
        UPDATE Sale_Campaigns SET 
          name=?, description=?, discount_amount=?, discount_percent=?,
          valid_from=?, valid_until=?, applicable_course_ids=?, applicable_service_ids=?, consumer_label=?, is_active=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).bind(
        name.trim(),
        description || null,
        discount_amount || 0,
        discount_percent || 0,
        valid_from || null,
        valid_until || null,
        JSON.stringify(applicable_course_ids || []),
        JSON.stringify(applicable_service_ids || []),
        consumer_label || null,
        is_active === false ? 0 : 1,
        id
      ).run();
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async deleteCampaign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      await config.db.prepare('DELETE FROM Sale_Campaigns WHERE id=?').bind(id).run();
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

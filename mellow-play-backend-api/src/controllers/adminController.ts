import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { AdminRepository } from '../repositories/adminRepository';
import { ConfigService } from '../services/configService';
import { SystemLogger } from '../utils/logger';
import { CourseMaterialRepository } from '../repositories/courseMaterialRepository';
import { SettingsRepository } from '../repositories/settingsRepository';
import { IMAGE_VIEWS, DEFAULT_FOCAL, POSTER_VIEW, clampZoom } from '../constants/imageViews';

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
      await adminRepo.updateUser(id, {
        firstName:          data.first_name,
        lastName:           data.last_name,
        phone:              data.phone,
        email:              data.email,
        relationship:       data.relationship,
        lineId:             data.line_id,
        pdpaConsent:        data.pdpa_consent,
        marketingConsent:   data.marketing_consent,
        applicationDate:    data.application_date,
        membershipType:     data.membership_type,
        membershipExpiresAt: data.membership_expires_at ?? null,
        profileImageUrl:    data.profile_image_url,
        children:           data.children,
      });
      return c.json({ success: true });
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
              calendarId, slotDate, slotStartTime, paymentStatus, paymentMethod, notes, ageGroup, couponTypeId, promoCode } = await c.req.json();
      
      if (!courseId || !branchId || !scheduledAt)
        return c.json({ success: false, message: 'courseId, branchId, scheduledAt required' }, 400);

      let ids = childIds ? childIds : (childId ? [childId] : []);
      if (isGuest) ids = [0];
      const parsedChildIds = ids.map((id: any) => parseInt(id) || 0);

      if (parsedChildIds.length === 0) {
        return c.json({ success: false, message: 'No children selected' }, 400);
      }

      const db = config.db;

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

          // Check 2: Extra Class same day restriction
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

      // Calculate price and discount
      const courseRow = await db.prepare('SELECT id, original_price FROM Courses WHERE id = ?').bind(parseInt(courseId)).first() as any;
      const unitPrice: number = courseRow?.original_price ?? 0;

      // Compute active campaign discount (matching getCourses logic)
      const { results: activeCampaigns } = await db.prepare(
        "SELECT * FROM Sale_Campaigns WHERE is_active = 1"
      ).all();

      const now = new Date();
      let campaignDiscountAmt = 0;

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

        let calculatedDiscountAmt = 0;
        if (itemDiscountPct > 0) {
          calculatedDiscountAmt = (unitPrice * itemDiscountPct) / 100;
        } else {
          calculatedDiscountAmt = itemDiscountAmt;
        }

        if (calculatedDiscountAmt > campaignDiscountAmt) {
          campaignDiscountAmt = calculatedDiscountAmt;
        }
      }

      const priceAfterCampaign = Math.max(0, unitPrice - campaignDiscountAmt);

      // Apply promo discount if provided
      let promoDiscountAmount = 0;
      if (promoCode) {
        const promo = await db.prepare(`
          SELECT discount_amount, discount_percent FROM Promotions 
          WHERE code = ? AND is_active = 1 
          AND (valid_until IS NULL OR valid_until > datetime('now'))
          AND (max_uses = 0 OR current_uses < max_uses)
        `).bind(promoCode).first() as any;
        if (promo) {
          if (promo.discount_percent > 0) {
            promoDiscountAmount = Math.floor(priceAfterCampaign * promo.discount_percent / 100);
          } else {
            promoDiscountAmount = promo.discount_amount;
          }
        }
      }

      const pricePerChild = Math.max(0, priceAfterCampaign - promoDiscountAmount);
      const settingsRepo = new SettingsRepository(config.db);
      const paymentEnabled = await settingsRepo.getSetting('payment_enabled') !== '0';

      const isFree = pricePerChild === 0 && paymentMethod !== 'coupon';
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
          branchId: parseInt(branchId),
          scheduledAt,
          ageGroup: ageGroup || 'junior',
          status: targetStatus,
          calendarId: calendarId ? parseInt(calendarId) : undefined,
          slotDate: slotDate ?? undefined,
          slotStartTime: slotStartTime ?? undefined,
          paymentStatus: targetPaymentStatus,
          paymentMethod: paymentMethod ?? undefined,
          notes: notes ?? undefined,
        });
        bookingIds.push(id);
      }

      const firstId = bookingIds[0];
      let beamPaymentUrl = '';
      let beamSessionId = '';

      if (!shouldBypassPayment && (!status || status === 'pending')) {
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

          const netAmount = Math.round(pricePerChild * parsedChildIds.length * 100); // Beam uses satang

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
          
          return c.json({ 
            success: false, 
            message: 'ระบบชำระเงินขัดข้อง กรุณาลองใหม่อีกครั้ง หรือติดต่อพนักงาน'
          }, 500);
        }

        for (const id of bookingIds) {
          await config.db.prepare('UPDATE Bookings SET beam_session_id=? WHERE id=?').bind(beamSessionId, id).run();
        }
      }

      return c.json({ success: true, id: firstId, bookingIds, paymentUrl: beamPaymentUrl });
    } catch (error: any) {
      const logger = new SystemLogger(c.env.DB ? c.env.DB : (new ConfigService(c.env)).db);
      await logger.error('create-booking', error);
      return c.json({ success: false, message: 'ระบบชัดข้อง' }, 500);
    }
  }

  async getCrmUsers(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const users = await adminRepo.getAllCrmUsers();
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
      const passwordHash = data.password || 'hashed_password'; 
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
      
      const getOrigin = (ctx: any) => {
        const originHeader = ctx.req.header('origin') || '';
        if (originHeader.includes('localhost') || originHeader.includes('127.0.0.1')) {
          return 'http://localhost:8787';
        }
        const forwardedHost = ctx.req.header('x-forwarded-host');
        const forwardedProto = ctx.req.header('x-forwarded-proto') || 'http';
        if (forwardedHost) {
          return `${forwardedProto}://${forwardedHost}`;
        }
        const host = ctx.req.header('host');
        if (host && (host.includes('localhost') || host.includes('127.0.0.1'))) {
          return `http://${host}`;
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
      
      const getOrigin = (ctx: any) => {
        const originHeader = ctx.req.header('origin') || '';
        if (originHeader.includes('localhost') || originHeader.includes('127.0.0.1')) {
          return 'http://localhost:8787';
        }
        const forwardedHost = ctx.req.header('x-forwarded-host');
        const forwardedProto = ctx.req.header('x-forwarded-proto') || 'http';
        if (forwardedHost) {
          return `${forwardedProto}://${forwardedHost}`;
        }
        const host = ctx.req.header('host');
        if (host && (host.includes('localhost') || host.includes('127.0.0.1'))) {
          return `http://${host}`;
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

  async deleteBooking(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      await new AdminRepository(config.db).deleteBooking(parseInt(c.req.param('id')));
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
      const { name, description, color, imageUrl, imagePosition } = await c.req.json();
      if (!name?.trim()) return c.json({ success: false, message: 'กรุณาระบุชื่อหมวดหมู่' }, 400);
      const id = await adminRepo.createCategory(name.trim(), description || '', color, imageUrl, imagePosition);
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
      const { name, description, color, imageUrl, imagePosition } = await c.req.json();
      if (!name?.trim()) return c.json({ success: false, message: 'กรุณาระบุชื่อหมวดหมู่' }, 400);
      await adminRepo.updateCategory(id, name.trim(), description || '', color, imageUrl, imagePosition);
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

      const getOrigin = (ctx: any) => {
        const originHeader = ctx.req.header('origin') || '';
        if (originHeader.includes('localhost') || originHeader.includes('127.0.0.1')) {
          return 'http://localhost:8787';
        }
        const forwardedHost = ctx.req.header('x-forwarded-host');
        const forwardedProto = ctx.req.header('x-forwarded-proto') || 'http';
        if (forwardedHost) {
          return `${forwardedProto}://${forwardedHost}`;
        }
        const host = ctx.req.header('host');
        if (host && (host.includes('localhost') || host.includes('127.0.0.1'))) {
          return `http://${host}`;
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
      const object = await c.env.BUCKET.get(fullKey);
      if (!object) {
        console.warn('serveFile object not found in BUCKET for key:', fullKey);
        return c.json({ success: false, message: 'Not found' }, 404);
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('cache-control', 'public, max-age=31536000');
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
  private static INTEGRATION_KEYS = ['beam_api_key', 'beam_merchant_id', 'sms_api_key', 'sms_api_secret', 'sms_sender_name'] as const;
  // sms_sender_name is the registered ThaiBulkSMS sender ID shown to
  // recipients — a display label, not a credential, so it isn't masked.
  private static NON_SENSITIVE_KEYS = new Set(['sms_sender_name']);

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
        sms_sender_name: 'Demo',
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
      const { status, scheduledAt, paidAt } = await c.req.json();
      const allowed = ['pending','confirmed_paid','awaiting_report','completed','cancelled'];
      if (!allowed.includes(status)) return c.json({ success: false, message: 'invalid status' }, 400);

      // scheduledAt/paidAt are optional overrides for Super Admin error-correction
      // (e.g. backdating a payment or fixing a wrong class date) — normal status
      // changes (complete/cancel) omit them and only the status column updates.
      const sets = ['status = ?'];
      const binds: any[] = [status];
      if (scheduledAt) { sets.push('scheduled_at = ?'); binds.push(scheduledAt); }
      if (paidAt) { sets.push('paid_at = ?'); binds.push(paidAt); }
      binds.push(id);

      await config.db.prepare(`UPDATE Bookings SET ${sets.join(', ')} WHERE id=?`).bind(...binds).run();
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

  async getSystemLogs(c: Context<{ Bindings: Bindings }>) {
    try {
      const config = new ConfigService(c.env);
      const { results } = await config.db.prepare('SELECT * FROM System_Logs ORDER BY created_at DESC LIMIT 100').all();
      return c.json({ success: true, logs: results });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
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

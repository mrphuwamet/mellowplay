import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { swaggerUI } from '@hono/swagger-ui';
import { Bindings, Variables } from './types/env';
import { AuthController } from './controllers/authController';
import { ProfileController } from './controllers/profileController';
import { JourneyController } from './controllers/journeyController';
import { AdminController } from './controllers/adminController';
import { ShopController } from './controllers/shopController';
import { HRController } from './controllers/hrController';
import { CalendarController } from './controllers/calendarController';
import { CourseMaterialController } from './controllers/courseMaterialController';
import { ReportController } from './controllers/reportController';
import { RedemptionController } from './controllers/redemptionController';
import { QueueController } from './controllers/queueController';
import { OrderController } from './controllers/orderController';
import { CouponController } from './controllers/couponController';
import { WebhookController } from './controllers/webhookController';
import { RewardsController } from './controllers/rewardsController';
import { NewsFeedController } from './controllers/newsFeedController';
import { BirthdayWishController } from './controllers/birthdayWishController';
import { AnalyticsController } from './controllers/analyticsController';
import { ConfigService } from './services/configService';
import { AuthService } from './services/authService';
import { sendAlert } from './services/alertService';

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>();
const authController = new AuthController();
const profileController = new ProfileController();
const journeyController = new JourneyController();
const adminController = new AdminController();
const couponController = new CouponController();
const shopController     = new ShopController();
const hrController       = new HRController();
const calendarController      = new CalendarController();
const queueController         = new QueueController();
const orderController         = new OrderController();
const courseMaterialController = new CourseMaterialController();
const reportController         = new ReportController();
const redemptionController     = new RedemptionController();
const webhookController        = new WebhookController();
const rewardsController        = new RewardsController();
const newsFeedController       = new NewsFeedController();
const birthdayWishController   = new BirthdayWishController();
const analyticsController      = new AnalyticsController();

app.use('*', cors({
  origin: (origin) => {
    // Allow local development ports and standard staging/prod domains
    if (!origin) return '*';
    if (origin.startsWith('http://localhost:') || origin.endsWith('.mellowplay.pages.dev') || origin.endsWith('mellowplay.com')) {
      return origin;
    }
    return origin;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}));

// --- System Routes ---
app.get('/', (c) => c.text('Mellow Play API is running!'));
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Webhooks (No JWT required)
app.post('/api/v1/webhooks/beam', (c) => webhookController.handleBeamWebhook(c));

// Swagger UI - Accessible in development or if ENVIRONMENT is set
app.use('/swagger', async (c, next) => {
  const config = new ConfigService(c.env);
  // Allow access if ENVIRONMENT is development OR if we are running locally (no ENVIRONMENT set yet)
  if (c.env.ENVIRONMENT !== 'development' && c.env.ENVIRONMENT !== undefined && !config.isDev) {
    return c.notFound();
  }
  await next();
});
app.get('/swagger', swaggerUI({ url: '/doc' }));

// OpenAPI Doc
app.get('/doc', (c) => {
  const config = new ConfigService(c.env);
  if (c.env.ENVIRONMENT !== 'development' && c.env.ENVIRONMENT !== undefined && !config.isDev) {
    return c.notFound();
  }
  
  return c.json({
    openapi: '3.0.0',
    info: { title: 'Mellow Play API', version: '1.0.0' },
    servers: [
      { url: 'http://localhost:8787', description: 'Local Development' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    paths: {
      '/api/v1/auth/request-otp': { 
        post: { 
          summary: 'Request Phone OTP',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    phone: { type: 'string', example: '0812345678' }
                  }
                }
              }
            }
          }
        } 
      },
      '/api/v1/auth/register': { 
        post: { 
          summary: 'Verify OTP and Register',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    phone: { type: 'string' },
                    otp: { type: 'string' },
                    password: { type: 'string' },
                    prefix: { type: 'string', example: 'นาย' },
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    dob: { type: 'string', example: '1990-01-31' },
                    email: { type: 'string' },
                    lineId: { type: 'string' },
                    address: { type: 'string' },
                    pdpaConsent: { type: 'boolean' },
                    marketingConsent: { type: 'boolean' },
                    children: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          nickname: { type: 'string' },
                          gender: { type: 'string' },
                          dob: { type: 'string', example: '2015-06-20' },
                          relation: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        } 
      },
      '/api/v1/auth/login': { 
        post: { 
          summary: 'Login with Phone/Email',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    login: { type: 'string', description: 'Phone or Email' },
                    password: { type: 'string' }
                  }
                }
              }
            }
          }
        } 
      },
      '/api/v1/profiles/calculate': { 
        post: { 
          summary: 'Calculate Human Design (Protected)',
          security: [{ bearerAuth: [] }]
        } 
      },
      '/api/v1/profiles': { 
        get: { 
          summary: 'List HD Profiles (Protected)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'userId', in: 'query', required: true, schema: { type: 'string' } }]
        } 
      },
      '/api/v1/journey/nodes': { 
        get: { 
          summary: 'List All Roadmap Nodes (Protected)',
          security: [{ bearerAuth: [] }]
        } 
      },
      '/api/v1/journey/progress/{childId}': { 
        get: { 
          summary: 'Get Child Progress (Protected)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'childId', in: 'path', required: true, schema: { type: 'string' } }]
        } 
      },
      '/api/v1/journey/album/{childId}': { 
        get: { 
          summary: 'Get Child Album (Media) (Protected)',
          security: [{ bearerAuth: [] }],
          parameters: [{ name: 'childId', in: 'path', required: true, schema: { type: 'string' } }]
        } 
      }
    }
  });
});

// --- Auth Routes ---
app.post('/api/v1/auth/request-otp', (c) => authController.requestOtp(c));
app.post('/api/v1/auth/verify-otp', (c) => authController.verifyOtp(c));
app.post('/api/v1/auth/register', (c) => authController.register(c));
app.post('/api/v1/auth/login', (c) => authController.login(c));
app.post('/api/v1/auth/google', (c) => authController.googleLogin(c));
app.post('/api/v1/auth/admin/login', (c) => authController.adminLogin(c));
app.post('/api/v1/auth/forgot-password/request-otp', (c) => authController.forgotPasswordRequestOtp(c));
app.post('/api/v1/auth/forgot-password/verify-otp', (c) => authController.forgotPasswordVerifyOtp(c));
app.post('/api/v1/auth/forgot-password/reset', (c) => authController.forgotPasswordReset(c));
app.post('/api/v1/auth/crm/reset-password', (c) => authController.crmResetPassword(c));
app.get('/api/v1/auth/me', (c) => authController.getMe(c));
app.post('/api/v1/auth/phone-change/request-current-otp', (c) => authController.requestPhoneChangeCurrentOtp(c));
app.post('/api/v1/auth/phone-change/verify-current-otp', (c) => authController.verifyPhoneChangeCurrentOtp(c));
app.post('/api/v1/auth/phone-change/request-new-otp', (c) => authController.requestPhoneChangeNewOtp(c));
app.post('/api/v1/auth/phone-change/confirm', (c) => authController.confirmPhoneChange(c));
app.post('/api/v1/auth/link-google', (c) => authController.linkGoogle(c));
app.post('/api/v1/auth/unlink-google', (c) => authController.unlinkGoogle(c));

// --- Protected Routes (Require JWT) ---
app.use('/api/v1/profiles', async (c, next) => {
  const config = new ConfigService(c.env);
  return jwt({ secret: config.jwtSecret, alg: 'HS256' })(c, next);
});

app.use('/api/v1/profiles/*', async (c, next) => {
  const config = new ConfigService(c.env);
  return jwt({ secret: config.jwtSecret, alg: 'HS256' })(c, next);
});

app.use('/api/v1/journey/*', async (c, next) => {
  // CRM submits milestone reports here (RecordMilestone.tsx) using a plain,
  // unauthenticated axios call — it never has a consumer-app JWT to send, so
  // gating this path the same as the consumer-facing journey routes made
  // every report submission 401 silently, leaving Child_Journey empty.
  if (c.req.path === '/api/v1/journey/record') return next();
  const config = new ConfigService(c.env);
  return jwt({ secret: config.jwtSecret, alg: 'HS256' })(c, next);
});

app.get('/api/v1/journey/nodes', (c) => journeyController.listNodes(c));
app.post('/api/v1/profiles/calculate', (c) => profileController.calculate(c));
app.post('/api/v1/profiles/children', (c) => profileController.addChild(c));
app.get('/api/v1/profiles', (c) => profileController.listProfiles(c));
app.put('/api/v1/profiles/children/:childId', (c) => profileController.updateChild(c));
app.put('/api/v1/profiles/:childId/avatar', (c) => profileController.updateAvatar(c));
app.post('/api/v1/profiles/:childId/upload-avatar', (c) => profileController.uploadAvatar(c));
app.delete('/api/v1/profiles/:childId/photo', (c) => profileController.deletePhoto(c));
app.post('/api/v1/profiles/coupons/transfer', (c) => profileController.transferCoupon(c));
app.post('/api/v1/profiles/avatar', (c) => profileController.uploadParentAvatar(c));
app.get('/api/v1/profiles/bookings/pending', (c) => profileController.getPendingBookings(c));
app.get('/api/v1/profiles/bookings/upcoming', (c) => profileController.getUpcomingBookings(c));
app.get('/api/v1/profiles/bookings/history', (c) => profileController.getHistoryBookings(c));
app.post('/api/v1/profiles/bookings/:id/cancel', (c) => profileController.cancelMyBooking(c));
app.get('/api/v1/journey/progress/:childId', (c) => journeyController.getChildProgress(c));
app.get('/api/v1/journey/progress-by-booking/:bookingId', (c) => journeyController.getProgressByBooking(c));
// Same lookup, exposed under /admin so RecordMilestone.tsx can prefill an
// existing report — the consumer-only JWT gate on /api/v1/journey/* would
// otherwise 401 the CRM. Left in ADMIN_PUBLIC_ROUTES below (unauthenticated)
// since RecordMilestone.tsx has no CRM login token to send.
app.get('/api/v1/admin/journey/progress-by-booking/:bookingId', (c) => journeyController.getProgressByBooking(c));
app.get('/api/v1/journey/album/:childId', (c) => journeyController.getAlbum(c));

// CRM Route (Protected for Facilitators in production, simplified here)
app.post('/api/v1/journey/record', (c) => journeyController.recordMilestone(c));

// --- Admin/CRM Routes ---
// /api/v1/admin/* and /api/v1/system/* now require a CRM staff JWT
// (type: 'admin', issued by POST /auth/admin/login) except for a small
// allowlist of endpoints the consumer app calls directly without a CRM
// login (course/branch catalog reads, booking create/cancel, coupon-type
// list) — see ADMIN_PUBLIC_ROUTES. PUT /admin/users/:id is shared: CRM staff
// can edit any user, and a consumer can edit their own profile with their
// own (non-admin) JWT.
const ADMIN_PUBLIC_ROUTES: { method: string; pattern: RegExp }[] = [
  { method: 'GET', pattern: /^\/api\/v1\/admin\/branches$/ },
  { method: 'GET', pattern: /^\/api\/v1\/admin\/courses$/ },
  { method: 'GET', pattern: /^\/api\/v1\/admin\/courses\/[^/]+\/coupons$/ },
  { method: 'GET', pattern: /^\/api\/v1\/admin\/calendar-slots\/upcoming$/ },
  { method: 'POST', pattern: /^\/api\/v1\/admin\/bookings$/ },
  { method: 'DELETE', pattern: /^\/api\/v1\/admin\/bookings\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/v1\/admin\/coupon-types$/ },
  { method: 'GET', pattern: /^\/api\/v1\/admin\/journey\/progress-by-booking\/[^/]+$/ },
];

async function requireCrmAuth(c: any, next: any) {
  const isPublicRoute = ADMIN_PUBLIC_ROUTES.some(
    (r) => r.method === c.req.method && r.pattern.test(c.req.path)
  );
  if (isPublicRoute) return next();

  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return c.json({ success: false, message: 'Unauthorized' }, 401);

  const config = new ConfigService(c.env);
  const payload = await AuthService.verifyToken(token, config.jwtSecret);
  if (!payload) return c.json({ success: false, message: 'Unauthorized' }, 401);

  if (payload.type === 'admin') {
    c.set('crmUser', payload);
    return next();
  }

  // PUT /admin/users/:id also accepts a consumer's own (non-admin) JWT,
  // but only to edit their own profile.
  const selfEditMatch = c.req.method === 'PUT' && c.req.path.match(/^\/api\/v1\/admin\/users\/(\d+)$/);
  if (selfEditMatch && payload.userId === parseInt(selfEditMatch[1])) {
    return next();
  }

  return c.json({ success: false, message: 'Unauthorized' }, 401);
}

app.use('/api/v1/admin/*', requireCrmAuth);
app.use('/api/v1/system/*', requireCrmAuth);

app.get('/api/v1/admin/stats', (c) => adminController.getStats(c));
app.get('/api/v1/admin/users', (c) => adminController.getUsers(c));
app.get('/api/v1/admin/users/:id', (c) => adminController.getUserById(c));
app.put('/api/v1/admin/users/:id', (c) => adminController.updateUser(c));
app.post('/api/v1/admin/users/:id/reset-password', (c) => adminController.resetUserPassword(c));
app.get('/api/v1/admin/users/:id/coupons', (c) => adminController.getUserCoupons(c));
app.post('/api/v1/admin/users/:id/coupons', (c) => adminController.addUserCoupon(c));
app.put('/api/v1/admin/users/:id/coupons/:couponId', (c) => adminController.updateUserCoupon(c));
app.delete('/api/v1/admin/users/:id/coupons/:couponId', (c) => adminController.deleteUserCoupon(c));
app.get   ('/api/v1/system/logs',        (c) => adminController.getSystemLogs(c));
app.delete('/api/v1/system/logs',        (c) => adminController.clearSystemLogs(c));
app.get   ('/api/v1/admin/system/settings', (c) => adminController.getSystemSettings(c));
app.put   ('/api/v1/admin/system/settings', (c) => adminController.updateSystemSetting(c));

app.get   ('/api/v1/admin/bookings',     (c) => adminController.getBookings(c));
app.post  ('/api/v1/admin/bookings',     (c) => adminController.createBooking(c));
app.delete('/api/v1/admin/bookings/:id', (c) => adminController.deleteBooking(c));
app.get('/api/v1/admin/crm-users', (c) => adminController.getCrmUsers(c));
app.post('/api/v1/admin/crm-users', (c) => adminController.createCrmUser(c));
app.put('/api/v1/admin/crm-users/:id', (c) => adminController.updateCrmUser(c));
app.delete('/api/v1/admin/crm-users/:id', (c) => adminController.deleteCrmUser(c));
app.post('/api/v1/admin/crm-users/:id/reset-password', (c) => adminController.resetCrmUserPassword(c));
app.delete('/api/v1/admin/crm-users/:id/reset-token', (c) => adminController.revokeCrmUserResetToken(c));
app.get('/api/v1/admin/crm-users/:id/attendance-summary', (c) => hrController.getAttendanceSummary(c));

app.get('/api/v1/admin/courses', (c) => adminController.getCourses(c));
app.post('/api/v1/admin/courses', (c) => adminController.createCourse(c));
app.put('/api/v1/admin/courses/:id', (c) => adminController.updateCourse(c));
app.delete('/api/v1/admin/courses/:id', (c) => adminController.deleteCourse(c));

app.get('/api/v1/image-views', (c) => adminController.getImageViews(c));
app.get('/api/v1/admin/courses/:id/image-views', (c) => adminController.getCourseImageViews(c));
app.put('/api/v1/admin/courses/:id/image-views', (c) => adminController.updateCourseImageViews(c));
app.get('/api/v1/admin/courses/:id/image-focals', (c) => adminController.getCourseImageFocals(c));
app.put('/api/v1/admin/courses/:id/image-focals', (c) => adminController.updateCourseImageFocals(c));

app.get('/api/v1/admin/categories', (c) => adminController.getCategories(c));
app.post('/api/v1/admin/categories', (c) => adminController.createCategory(c));
app.put('/api/v1/admin/categories/:id', (c) => adminController.updateCategory(c));
app.delete('/api/v1/admin/categories/:id', (c) => adminController.deleteCategory(c));

// ================= REWARDS & REDEMPTIONS =================
app.get('/api/v1/rewards', (c) => rewardsController.getAvailableRewards(c));
app.post('/api/v1/rewards/redeem', (c) => rewardsController.redeemReward(c));

app.get('/api/v1/admin/rewards', (c) => rewardsController.getAllRewards(c));
app.post('/api/v1/admin/rewards', (c) => rewardsController.createReward(c));
app.put('/api/v1/admin/rewards/:id', (c) => rewardsController.updateReward(c));
app.delete('/api/v1/admin/rewards/:id', (c) => rewardsController.deleteReward(c));

app.get('/api/v1/children/:childId/stamps', (c) => rewardsController.getChildStamps(c));
app.get('/api/v1/stamp-page-backgrounds', (c) => rewardsController.getStampPageBackgrounds(c));

app.get   ('/api/v1/admin/stamp-image-ranges',     (c) => rewardsController.getStampImageRanges(c));
app.post  ('/api/v1/admin/stamp-image-ranges',     (c) => rewardsController.createStampImageRange(c));
app.put   ('/api/v1/admin/stamp-image-ranges/:id', (c) => rewardsController.updateStampImageRange(c));
app.delete('/api/v1/admin/stamp-image-ranges/:id', (c) => rewardsController.deleteStampImageRange(c));

app.get   ('/api/v1/admin/stamp-page-backgrounds',     (c) => rewardsController.getStampPageBackgrounds(c));
app.post  ('/api/v1/admin/stamp-page-backgrounds',     (c) => rewardsController.createStampPageBackground(c));
app.put   ('/api/v1/admin/stamp-page-backgrounds/:id', (c) => rewardsController.updateStampPageBackground(c));
app.delete('/api/v1/admin/stamp-page-backgrounds/:id', (c) => rewardsController.deleteStampPageBackground(c));

// ================= NEWS FEED (ข่าวสาร / สื่อความรู้) =================
app.get('/api/v1/news-feed', (c) => newsFeedController.getPublished(c));
app.get('/api/v1/news-feed/:id', (c) => newsFeedController.getOne(c));
app.post('/api/v1/news-feed/:id/like', (c) => newsFeedController.toggleLike(c));
app.get('/api/v1/news-feed/:id/comments', (c) => newsFeedController.getComments(c));
app.post('/api/v1/news-feed/:id/comments', (c) => newsFeedController.addComment(c));
app.get('/api/v1/birthday-wishes', (c) => birthdayWishController.getActive(c));
app.get('/api/v1/admin/birthday-wishes', (c) => birthdayWishController.getAll(c));
app.post('/api/v1/admin/birthday-wishes', (c) => birthdayWishController.create(c));
app.put('/api/v1/admin/birthday-wishes/:id', (c) => birthdayWishController.update(c));
app.delete('/api/v1/admin/birthday-wishes/:id', (c) => birthdayWishController.delete(c));
app.get('/api/v1/admin/news-feed', (c) => newsFeedController.getAll(c));
app.post('/api/v1/admin/news-feed', (c) => newsFeedController.create(c));
app.put('/api/v1/admin/news-feed/:id', (c) => newsFeedController.update(c));
app.delete('/api/v1/admin/news-feed/:id', (c) => newsFeedController.delete(c));

// ================= ANALYTICS (Dashboard + course views/reviews) =================
app.get ('/api/v1/admin/analytics',                (c) => analyticsController.getDashboardAnalytics(c));
app.get ('/api/v1/admin/analytics/active-users',   (c) => analyticsController.getActiveUsers(c));
app.post('/api/v1/visits/ping',                    (c) => analyticsController.pingVisit(c));
app.post('/api/v1/courses/:courseId/view',         (c) => analyticsController.recordCourseView(c));
app.get ('/api/v1/courses/:courseId/reviews',      (c) => analyticsController.getCourseReviews(c));
app.post('/api/v1/courses/reviews',                (c) => analyticsController.createCourseReview(c));

app.get('/api/v1/admin/coupon-types', (c) => couponController.getCouponTypes(c));
app.post('/api/v1/admin/coupon-types', (c) => couponController.createCouponType(c));
app.put('/api/v1/admin/coupon-types/:id', (c) => couponController.updateCouponType(c));
app.delete('/api/v1/admin/coupon-types/:id', (c) => couponController.deleteCouponType(c));

app.get('/api/v1/admin/courses/:courseId/coupons', (c) => couponController.getCourseCoupons(c));
app.put('/api/v1/admin/courses/:courseId/coupons', (c) => couponController.updateCourseCoupons(c));

app.get('/api/v1/admin/children/:childId/coupons', (c) => couponController.getChildCoupons(c));
app.post('/api/v1/admin/children/:childId/coupons/:couponTypeId/balance', (c) => couponController.updateChildCouponBalance(c));

app.post('/api/v1/admin/upload', (c) => adminController.uploadFile(c));
app.post('/api/v1/admin/translate', (c) => adminController.translateText(c));
app.get('/api/v1/files/*', (c) => adminController.serveFile(c));

app.get('/api/v1/admin/my-schedule', (c) => adminController.getMySchedule(c));

app.get('/api/v1/admin/skills-library', (c) => adminController.getSkillsLibrary(c));
app.post('/api/v1/admin/skills-library', (c) => adminController.createSkill(c));
app.put('/api/v1/admin/skills-library/:id', (c) => adminController.updateSkill(c));
app.delete('/api/v1/admin/skills-library/:id', (c) => adminController.deleteSkill(c));

app.get('/api/v1/admin/settings', (c) => adminController.getSystemSettings(c));
app.post('/api/v1/admin/settings', (c) => adminController.updateSystemSetting(c));
app.get('/api/v1/admin/integration-keys', (c) => adminController.getIntegrationKeys(c));
app.put('/api/v1/admin/integration-keys', (c) => adminController.updateIntegrationKeys(c));
app.post('/api/v1/admin/integration-keys/test', (c) => adminController.testIntegration(c));

app.get   ('/api/v1/admin/branches',              (c) => adminController.getBranches(c));
app.post  ('/api/v1/admin/branches',              (c) => adminController.createBranch(c));
app.get   ('/api/v1/admin/branches/:id',          (c) => adminController.getBranchById(c));
app.patch ('/api/v1/admin/branches/:id',          (c) => adminController.updateBranch(c));
app.delete('/api/v1/admin/branches/:id',          (c) => adminController.deleteBranch(c));
app.get   ('/api/v1/admin/branches/:id/settings', (c) => adminController.getBranchSettings(c));
app.put   ('/api/v1/admin/branches/:id/settings', (c) => adminController.updateBranchSettings(c));

app.get('/api/v1/admin/branch-default-slots', (c) => adminController.getBranchDefaultSlots(c));
app.post('/api/v1/admin/branch-default-slots', (c) => adminController.createBranchDefaultSlot(c));
app.delete('/api/v1/admin/branch-default-slots/:id', (c) => adminController.deleteBranchDefaultSlot(c));

app.get('/api/v1/admin/time-slots', (c) => adminController.getTimeSlots(c));
app.post('/api/v1/admin/time-slots', (c) => adminController.createTimeSlot(c));
app.put('/api/v1/admin/time-slots/:id', (c) => adminController.updateTimeSlot(c));
app.delete('/api/v1/admin/time-slots/clear-day', (c) => adminController.clearDayTimeSlots(c));
app.delete('/api/v1/admin/time-slots/:id', (c) => adminController.deleteTimeSlot(c));

app.get('/api/v1/admin/pos/occupancy', (c) => adminController.getSlotOccupancy(c));
app.post('/api/v1/admin/pos/lookup-member', (c) => adminController.posLookupMember(c));
app.post('/api/v1/admin/pos/topup', (c) => adminController.posProcessTopup(c));
app.post('/api/v1/admin/pos/process-sale',         (c) => adminController.posProcessSale(c));
app.post('/api/v1/admin/pos/process-package-sale', (c) => adminController.posProcessPackageSale(c));

// ── Shop: Service Categories ───────────────────────────────────────────────
app.get   ('/api/v1/admin/service-categories',      (c) => shopController.getServiceCategories(c));
app.post  ('/api/v1/admin/service-categories',      (c) => shopController.createServiceCategory(c));
app.put   ('/api/v1/admin/service-categories/:id',  (c) => shopController.updateServiceCategory(c));
app.delete('/api/v1/admin/service-categories/:id',  (c) => shopController.deleteServiceCategory(c));

// ── Shop: Services ─────────────────────────────────────────────────────────
app.get   ('/api/v1/admin/services',     (c) => shopController.getServices(c));
app.post  ('/api/v1/admin/services',     (c) => shopController.createService(c));
app.put   ('/api/v1/admin/services/:id', (c) => shopController.updateService(c));
app.delete('/api/v1/admin/services/:id', (c) => shopController.deleteService(c));

// ── Shop: Product Categories ───────────────────────────────────────────────
app.get   ('/api/v1/admin/product-categories',      (c) => shopController.getProductCategories(c));
app.post  ('/api/v1/admin/product-categories',      (c) => shopController.createProductCategory(c));
app.put   ('/api/v1/admin/product-categories/:id',  (c) => shopController.updateProductCategory(c));
app.delete('/api/v1/admin/product-categories/:id',  (c) => shopController.deleteProductCategory(c));

// ── Shop: Products ─────────────────────────────────────────────────────────
app.get   ('/api/v1/admin/products',     (c) => shopController.getProducts(c));
app.post  ('/api/v1/admin/products',     (c) => shopController.createProduct(c));
app.put   ('/api/v1/admin/products/:id', (c) => shopController.updateProduct(c));
app.delete('/api/v1/admin/products/:id', (c) => shopController.deleteProduct(c));

// ── Shop: Stock ────────────────────────────────────────────────────────────
app.get ('/api/v1/admin/stock',              (c) => shopController.getStock(c));
app.get ('/api/v1/admin/stock/transactions', (c) => shopController.getStockTransactions(c));
app.post('/api/v1/admin/stock/adjust',       (c) => shopController.adjustStock(c));

// ── HR: Packages ───────────────────────────────────────────────────────────
app.get   ('/api/v1/admin/packages',     (c) => hrController.getPackages(c));
app.post  ('/api/v1/admin/packages',     (c) => hrController.createPackage(c));
app.put   ('/api/v1/admin/packages/:id', (c) => hrController.updatePackage(c));
app.delete('/api/v1/admin/packages/:id', (c) => hrController.deletePackage(c));

// Consumer-facing self-service package storefront (Beam-paid)
app.get ('/api/v1/packages',                    (c) => hrController.getActivePackages(c));
app.post('/api/v1/packages/:id/purchase',       (c) => hrController.purchasePackage(c));
app.get ('/api/v1/packages/purchases/:id',      (c) => hrController.getPackagePurchaseStatus(c));

// ── HR: Campaign Bonuses ───────────────────────────────────────────────────
app.get   ('/api/v1/admin/campaign-bonuses',     (c) => hrController.getCampaigns(c));
app.post  ('/api/v1/admin/campaign-bonuses',     (c) => hrController.createCampaign(c));
app.put   ('/api/v1/admin/campaign-bonuses/:id', (c) => hrController.updateCampaign(c));
app.delete('/api/v1/admin/campaign-bonuses/:id', (c) => hrController.deleteCampaign(c));

// ── HR: Diligence Rules ────────────────────────────────────────────────────
app.get   ('/api/v1/admin/diligence-rules',     (c) => hrController.getDiligenceRules(c));
app.post  ('/api/v1/admin/diligence-rules',     (c) => hrController.createDiligenceRule(c));
app.put   ('/api/v1/admin/diligence-rules/:id', (c) => hrController.updateDiligenceRule(c));
app.delete('/api/v1/admin/diligence-rules/:id', (c) => hrController.deleteDiligenceRule(c));

// ── HR: Attendance ─────────────────────────────────────────────────────────
app.get   ('/api/v1/admin/attendance', (c) => hrController.getAttendance(c));
app.post  ('/api/v1/admin/attendance', (c) => hrController.upsertAttendance(c));
app.delete('/api/v1/admin/attendance', (c) => hrController.deleteAttendance(c));

// ── HR: Leave Requests ─────────────────────────────────────────────────────
app.get ('/api/v1/admin/leave-requests',          (c) => hrController.getLeaveRequests(c));
app.post('/api/v1/admin/leave-requests',           (c) => hrController.createLeaveRequest(c));
app.put ('/api/v1/admin/leave-requests/:id/status',(c) => hrController.updateLeaveStatus(c));

// ── HR: Leave Policies ─────────────────────────────────────────────────────
app.get ('/api/v1/admin/leave-policies', (c) => hrController.getLeavePolicies(c));
app.post('/api/v1/admin/leave-policies', (c) => hrController.upsertLeavePolicy(c));

// ── HR: Expense Advances ────────────────────────────────────────────────────
app.get('/api/v1/admin/expense-advances',            (c) => hrController.getExpenseAdvances(c));
app.post('/api/v1/admin/expense-advances',           (c) => hrController.createExpenseAdvance(c));
app.put('/api/v1/admin/expense-advances/:id/status', (c) => hrController.updateExpenseStatus(c));

// ── HR: Payouts ─────────────────────────────────────────────────────────────
app.get('/api/v1/admin/incentive-summary', (c) => hrController.getMyIncentiveSummary(c));
app.get('/api/v1/admin/payouts',         (c) => hrController.getPayouts(c));
app.post('/api/v1/admin/payouts',        (c) => hrController.createPayout(c));
app.put('/api/v1/admin/payouts/:id/pay',    (c) => hrController.markPayoutPaid(c));
app.post('/api/v1/admin/payouts/generate', (c) => hrController.generatePayout(c));

// ── Calendars ───────────────────────────────────────────────────────────────
app.get   ('/api/v1/admin/calendars',              (c) => calendarController.getCalendars(c));
app.post  ('/api/v1/admin/calendars',              (c) => calendarController.createCalendar(c));
app.put   ('/api/v1/admin/calendars/:id',          (c) => calendarController.updateCalendar(c));
app.delete('/api/v1/admin/calendars/:id',          (c) => calendarController.deleteCalendar(c));
app.get   ('/api/v1/admin/calendar-slot-rules',    (c) => calendarController.getSlotRules(c));
app.post  ('/api/v1/admin/calendar-slot-rules',    (c) => calendarController.createSlotRule(c));
app.put   ('/api/v1/admin/calendar-slot-rules/:id',(c) => calendarController.updateSlotRule(c));
app.delete('/api/v1/admin/calendar-slot-rules/:id',(c) => calendarController.deleteSlotRule(c));
app.get   ('/api/v1/admin/calendar-holidays',      (c) => calendarController.getHolidays(c));
app.post  ('/api/v1/admin/calendar-holidays',      (c) => calendarController.createHoliday(c));
app.delete('/api/v1/admin/calendar-holidays/:id',  (c) => calendarController.deleteHoliday(c));
app.get   ('/api/v1/admin/calendar-slots/upcoming', (c) => calendarController.getUpcomingSlots(c));
app.get   ('/api/v1/admin/calendar-slots/available',(c) => calendarController.getAvailableSlots(c));

// ── Service Queue ───────────────────────────────────────────────────────────
app.get   ('/api/v1/admin/queue',              (c) => queueController.getQueue(c));
app.post  ('/api/v1/admin/queue',              (c) => queueController.createQueueItem(c));
app.put   ('/api/v1/admin/queue/:id/status',   (c) => queueController.updateQueueStatus(c));
app.put   ('/api/v1/admin/queue/:id/staff',    (c) => queueController.assignStaff(c));
app.patch ('/api/v1/admin/queue/:id',          (c) => queueController.updateQueueItem(c));
app.delete('/api/v1/admin/queue/:id',          (c) => queueController.deleteQueueItem(c));

// ── Orders (POS) ────────────────────────────────────────────────────────────
app.get   ('/api/v1/admin/orders',            (c) => orderController.getOrders(c));
app.post  ('/api/v1/admin/orders',            (c) => orderController.createOrder(c));
app.get   ('/api/v1/admin/orders/:id',        (c) => orderController.getOrderById(c));
app.put   ('/api/v1/admin/orders/:id/pay',    (c) => orderController.updatePaymentStatus(c));
app.post  ('/api/v1/admin/orders/:id/cancel', (c) => orderController.cancelOrder(c));
app.delete('/api/v1/admin/orders/:id',        (c) => orderController.deleteOrder(c));

// ── Course Materials ────────────────────────────────────────────────────────
app.get   ('/api/v1/admin/courses/:courseId/materials',   (c) => courseMaterialController.getMaterials(c));
app.post  ('/api/v1/admin/courses/:courseId/materials',   (c) => courseMaterialController.upsertMaterial(c));
app.delete('/api/v1/admin/course-materials/:id',          (c) => courseMaterialController.deleteMaterial(c));
app.post  ('/api/v1/admin/bookings/:bookingId/complete',  (c) => courseMaterialController.completeClass(c));
app.post  ('/api/v1/admin/bookings/:bookingId/cancel',    (c) => courseMaterialController.cancelBooking(c));
app.patch ('/api/v1/admin/bookings/:id/status',           (c) => adminController.updateBookingStatus(c));
app.get   ('/api/v1/admin/bookings/:id/transactions',     (c) => adminController.getBookingTransactions(c));
app.post  ('/api/v1/admin/bookings/:id/pay',              (c) => adminController.payBooking(c));
app.post  ('/api/v1/admin/transactions/:id/void',         (c) => adminController.voidTransaction(c));

// ── Reports ─────────────────────────────────────────────────────────────────
app.get('/api/v1/admin/reports/transactions',   (c) => reportController.getTransactions(c));
app.get('/api/v1/admin/reports/daily-sales',    (c) => reportController.getDailySales(c));
app.get('/api/v1/admin/reports/monthly-sales',  (c) => reportController.getMonthlySales(c));
app.get('/api/v1/admin/reports/best-sellers',   (c) => reportController.getBestSellers(c));
app.get('/api/v1/admin/reports/busiest-days',   (c) => reportController.getBusiestDays(c));
app.get('/api/v1/admin/reports/kpis',           (c) => reportController.getSummaryKPIs(c));

app.get('/api/v1/promotions/validate',             (c) => adminController.validatePromoCode(c));

// ── Promotions CRUD ──────────────────────────────────────────────────────────
app.get   ('/api/v1/admin/promotions',          (c) => adminController.getPromotions(c));
app.post  ('/api/v1/admin/promotions',          (c) => adminController.createPromotion(c));
app.put   ('/api/v1/admin/promotions/:id',      (c) => adminController.updatePromotion(c));
app.delete('/api/v1/admin/promotions/:id',      (c) => adminController.deletePromotion(c));

// ── Campaigns CRUD (Auto-applied Sales) ──────────────────────────────────────
app.get   ('/api/v1/admin/campaigns',           (c) => adminController.getCampaigns(c));
app.post  ('/api/v1/admin/campaigns',           (c) => adminController.createCampaign(c));
app.put   ('/api/v1/admin/campaigns/:id',       (c) => adminController.updateCampaign(c));
app.delete('/api/v1/admin/campaigns/:id',       (c) => adminController.deleteCampaign(c));

// ── Booking Status ───────────────────────────────────────────────────────────
app.get('/api/v1/bookings/:id/status',         (c) => adminController.getBookingStatus(c));

// ── Redemptions ─────────────────────────────────────────────────────────────
app.post('/api/v1/redemptions',                    (c) => redemptionController.create(c));
app.get ('/api/v1/redemptions/child/:childId',     (c) => redemptionController.listByChild(c));
app.get ('/api/v1/admin/redemptions/pending',      (c) => redemptionController.listPending(c));
app.post('/api/v1/admin/redemptions/:id/claim',    (c) => redemptionController.claim(c));

// Backstop for anything that throws instead of being caught inline (most
// controllers here catch their own errors and return a 500 JSON body, which
// never reaches this — see the explicit sendAlert() calls at the known
// Payment/SMS/booking failure points instead for those).
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  const config = new ConfigService(c.env);
  sendAlert(config.db, 'Unhandled API Error', {
    path: `${c.req.method} ${c.req.path}`,
    error: err.message,
  }).catch(() => {});
  return c.json({ success: false, message: 'Internal server error' }, 500);
});

export default app;

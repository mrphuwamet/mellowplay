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
import { QueueController } from './controllers/queueController';
import { OrderController } from './controllers/orderController';
import { CourseMaterialController } from './controllers/courseMaterialController';
import { ReportController } from './controllers/reportController';
import { ConfigService } from './services/configService';

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>();
const authController = new AuthController();
const profileController = new ProfileController();
const journeyController = new JourneyController();
const adminController = new AdminController();
const shopController     = new ShopController();
const hrController       = new HRController();
const calendarController      = new CalendarController();
const queueController         = new QueueController();
const orderController         = new OrderController();
const courseMaterialController = new CourseMaterialController();
const reportController         = new ReportController();

app.use('*', cors());

// --- System Routes ---
app.get('/', (c) => c.text('Mellow Play API is running!'));
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

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
                    firstName: { type: 'string' },
                    lastName: { type: 'string' }
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
app.post('/api/v1/auth/register', (c) => authController.register(c));
app.post('/api/v1/auth/login', (c) => authController.login(c));
app.post('/api/v1/auth/admin/login', (c) => authController.adminLogin(c));

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
  const config = new ConfigService(c.env);
  return jwt({ secret: config.jwtSecret, alg: 'HS256' })(c, next);
});

app.get('/api/v1/journey/nodes', (c) => journeyController.listNodes(c));
app.post('/api/v1/profiles/calculate', (c) => profileController.calculate(c));
app.get('/api/v1/profiles', (c) => profileController.listProfiles(c));
app.get('/api/v1/journey/progress/:childId', (c) => journeyController.getChildProgress(c));
app.get('/api/v1/journey/album/:childId', (c) => journeyController.getAlbum(c));

// CRM Route (Protected for Facilitators in production, simplified here)
app.post('/api/v1/journey/record', (c) => journeyController.recordMilestone(c));

// --- Admin/CRM Routes ---
app.get('/api/v1/admin/stats', (c) => adminController.getStats(c));
app.get('/api/v1/admin/users', (c) => adminController.getUsers(c));
app.get('/api/v1/admin/users/:id', (c) => adminController.getUserById(c));
app.put('/api/v1/admin/users/:id', (c) => adminController.updateUser(c));
app.post('/api/v1/admin/users/:id/reset-password', (c) => adminController.resetUserPassword(c));
app.get('/api/v1/admin/users/:id/coupons', (c) => adminController.getUserCoupons(c));
app.post('/api/v1/admin/users/:id/coupons', (c) => adminController.addUserCoupon(c));
app.put('/api/v1/admin/users/:id/coupons/:couponId', (c) => adminController.updateUserCoupon(c));
app.delete('/api/v1/admin/users/:id/coupons/:couponId', (c) => adminController.deleteUserCoupon(c));
app.get   ('/api/v1/admin/bookings',     (c) => adminController.getBookings(c));
app.post  ('/api/v1/admin/bookings',     (c) => adminController.createBooking(c));
app.delete('/api/v1/admin/bookings/:id', (c) => adminController.deleteBooking(c));
app.get('/api/v1/admin/crm-users', (c) => adminController.getCrmUsers(c));
app.post('/api/v1/admin/crm-users', (c) => adminController.createCrmUser(c));
app.put('/api/v1/admin/crm-users/:id', (c) => adminController.updateCrmUser(c));
app.delete('/api/v1/admin/crm-users/:id', (c) => adminController.deleteCrmUser(c));

app.get('/api/v1/admin/courses', (c) => adminController.getCourses(c));
app.post('/api/v1/admin/courses', (c) => adminController.createCourse(c));
app.put('/api/v1/admin/courses/:id', (c) => adminController.updateCourse(c));
app.delete('/api/v1/admin/courses/:id', (c) => adminController.deleteCourse(c));

app.get('/api/v1/admin/categories', (c) => adminController.getCategories(c));
app.post('/api/v1/admin/categories', (c) => adminController.createCategory(c));
app.put('/api/v1/admin/categories/:id', (c) => adminController.updateCategory(c));
app.delete('/api/v1/admin/categories/:id', (c) => adminController.deleteCategory(c));

app.post('/api/v1/admin/upload', (c) => adminController.uploadFile(c));
app.get('/api/v1/files/*', (c) => adminController.serveFile(c));

app.get('/api/v1/admin/my-schedule', (c) => adminController.getMySchedule(c));

app.get('/api/v1/admin/skills-library', (c) => adminController.getSkillsLibrary(c));
app.post('/api/v1/admin/skills-library', (c) => adminController.createSkill(c));
app.put('/api/v1/admin/skills-library/:id', (c) => adminController.updateSkill(c));
app.delete('/api/v1/admin/skills-library/:id', (c) => adminController.deleteSkill(c));

app.get('/api/v1/admin/settings', (c) => adminController.getSystemSettings(c));
app.post('/api/v1/admin/settings', (c) => adminController.updateSystemSetting(c));

app.get   ('/api/v1/admin/branches',              (c) => adminController.getBranches(c));
app.post  ('/api/v1/admin/branches',              (c) => adminController.createBranch(c));
app.get   ('/api/v1/admin/branches/:id',          (c) => adminController.getBranchById(c));
app.put   ('/api/v1/admin/branches/:id',          (c) => adminController.updateBranch(c));
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

export default app;

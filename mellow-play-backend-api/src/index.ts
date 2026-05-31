import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { swaggerUI } from '@hono/swagger-ui';
import { Bindings, Variables } from './types/env';
import { AuthController } from './controllers/authController';
import { ProfileController } from './controllers/profileController';
import { JourneyController } from './controllers/journeyController';
import { AdminController } from './controllers/adminController';
import { ConfigService } from './services/configService';

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>();
const authController = new AuthController();
const profileController = new ProfileController();
const journeyController = new JourneyController();
const adminController = new AdminController();

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
app.get('/api/v1/admin/bookings', (c) => adminController.getBookings(c));
app.post('/api/v1/admin/bookings', (c) => adminController.createBooking(c));
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

app.get('/api/v1/admin/branches', (c) => adminController.getBranches(c));
app.get('/api/v1/admin/branches/:id', (c) => adminController.getBranchById(c));
app.get('/api/v1/admin/branches/:id/settings', (c) => adminController.getBranchSettings(c));
app.put('/api/v1/admin/branches/:id/settings', (c) => adminController.updateBranchSettings(c));

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
app.post('/api/v1/admin/pos/process-sale', (c) => adminController.posProcessSale(c));

export default app;

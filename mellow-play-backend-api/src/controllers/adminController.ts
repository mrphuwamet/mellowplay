import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { AdminRepository } from '../repositories/adminRepository';
import { ConfigService } from '../services/configService';
import { CourseMaterialRepository } from '../repositories/courseMaterialRepository';

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
      const { childId, courseId, branchId, scheduledAt, isGuest, status,
              calendarId, slotDate, slotStartTime, paymentStatus, notes, ageGroup } = await c.req.json();
      if (!courseId || !branchId || !scheduledAt)
        return c.json({ success: false, message: 'courseId, branchId, scheduledAt required' }, 400);
      const id = await adminRepo.createBooking({
        childId: isGuest ? 0 : (parseInt(childId) || 0),
        courseId: parseInt(courseId),
        branchId: parseInt(branchId),
        scheduledAt,
        ageGroup: ageGroup || 'junior',
        status: status || 'confirmed_paid',
        calendarId: calendarId ? parseInt(calendarId) : undefined,
        slotDate: slotDate ?? undefined,
        slotStartTime: slotStartTime ?? undefined,
        paymentStatus: paymentStatus ?? undefined,
        notes: notes ?? undefined,
      });
      return c.json({ success: true, id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
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

  async getCourses(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const courses = await adminRepo.getAllCourses();
      return c.json({ success: true, courses });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async getCategories(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const adminRepo = new AdminRepository(config.db);
      const categories = await adminRepo.getAllCategories();
      return c.json({ success: true, categories });
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

      return c.json({ success: true, url: `/api/v1/files/${key}` });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async serveFile(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const key = c.req.param('key') + (c.req.path.split(`/api/v1/files/`)[1]?.slice(c.req.param('key').length) || '');
      const fullKey = c.req.path.replace('/api/v1/files/', '');
      const object = await c.env.BUCKET.get(fullKey);
      if (!object) return c.json({ success: false, message: 'Not found' }, 404);

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('cache-control', 'public, max-age=31536000');
      return new Response(object.body as any, { headers });
    } catch (error: any) {
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
      const { name, type, icon, color } = await c.req.json();
      const id = await adminRepo.createSkill(name, type, icon, color);
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
      const { name, type, icon, color } = await c.req.json();
      await adminRepo.updateSkill(id, name, type, icon, color);
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
        VALUES (?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, 'prepaid', ?, ?)
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
      const { status } = await c.req.json();
      const allowed = ['pending','confirmed','confirmed_paid','completed','cancelled'];
      if (!allowed.includes(status)) return c.json({ success: false, message: 'invalid status' }, 400);
      await config.db.prepare('UPDATE Bookings SET status=? WHERE id=?').bind(status, id).run();
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
}

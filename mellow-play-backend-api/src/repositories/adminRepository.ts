export class AdminRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async getDashboardStats(): Promise<any> {
    const stats = await this.db.batch([
      this.db.prepare('SELECT COUNT(*) as total FROM Users WHERE membership_expires_at > datetime("now")').first(),
      this.db.prepare('SELECT COUNT(*) as total FROM Children').first(),
      this.db.prepare('SELECT COUNT(*) as total FROM Bookings WHERE scheduled_at >= date("now")').first(),
      this.db.prepare('SELECT COUNT(*) as total FROM Bookings WHERE status = "pending"').first()
    ]);

    return {
      activeMembers: stats[0].total,
      totalChildren: stats[1].total,
      upcomingBookings: stats[2].total,
      pendingRequests: stats[3].total
    };
  }

  async getAllUsers(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT
        u.id, u.phone, u.email, u.first_name, u.last_name,
        u.membership_expires_at, u.membership_type,
        COUNT(DISTINCT crm.id) as children_count
      FROM Users u
      LEFT JOIN User_CRM_Children crm ON u.id = crm.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();
    return results;
  }

  async getUserById(id: number): Promise<any | null> {
    const user = await this.db.prepare(
      'SELECT * FROM Users WHERE id = ?'
    ).bind(id).first();
    if (!user) return null;

    const { results: children } = await this.db.prepare(
      'SELECT * FROM User_CRM_Children WHERE user_id = ? ORDER BY created_at ASC'
    ).bind(id).all();

    const { results: coupons } = await this.db.prepare(
      'SELECT * FROM User_Coupons WHERE user_id = ? ORDER BY expires_at ASC'
    ).bind(id).all();

    return { ...user, children: children || [], coupons: coupons || [] };
  }

  async updateUser(id: number, data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    relationship?: string;
    lineId?: string;
    pdpaConsent?: boolean;
    marketingConsent?: boolean | null;
    applicationDate?: string;
    membershipType?: string;
    membershipExpiresAt?: string | null;
    profileImageUrl?: string;
    children?: Array<{ id?: number; full_name: string; nickname?: string; gender?: string; date_of_birth?: string }>;
  }): Promise<void> {
    await this.db.prepare(`
      UPDATE Users SET
        first_name = ?, last_name = ?, phone = ?, email = ?,
        membership_type = ?, membership_expires_at = ?
      WHERE id = ?
    `).bind(
      data.firstName ?? null, data.lastName ?? null,
      data.phone ?? null, data.email ?? null,
      data.membershipType ?? null,
      data.membershipExpiresAt ?? null,
      id
    ).run();

    // Replace CRM children
    if (data.children !== undefined) {
      await this.db.prepare('DELETE FROM User_CRM_Children WHERE user_id = ?').bind(id).run();
      for (const child of data.children) {
        await this.db.prepare(`
          INSERT INTO User_CRM_Children (user_id, full_name, nickname, gender, date_of_birth)
          VALUES (?, ?, ?, ?, ?)
        `).bind(id, child.full_name, child.nickname ?? null, child.gender ?? null, child.date_of_birth ?? null).run();
      }
    }
  }

  // ── User Coupon CRUD ──────────────────────────────────────────────────────

  async getUserCoupons(userId: number): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM User_Coupons WHERE user_id = ? ORDER BY expires_at ASC'
    ).bind(userId).all();
    return results;
  }

  async addUserCoupon(userId: number, typeId: string, label: string, count: number, expiresAt: string, note?: string): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO User_Coupons (user_id, type_id, label, count, expires_at, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(userId, typeId, label, count, expiresAt, note ?? null).run();
    return result.meta.last_row_id;
  }

  async updateUserCoupon(id: number, count: number, expiresAt: string, note?: string): Promise<void> {
    await this.db.prepare(
      'UPDATE User_Coupons SET count = ?, expires_at = ?, note = ? WHERE id = ?'
    ).bind(count, expiresAt, note ?? null, id).run();
  }

  async deleteUserCoupon(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM User_Coupons WHERE id = ?').bind(id).run();
  }

  async getAllBookings(params?: { branchId?: string; startDate?: string; endDate?: string }): Promise<any[]> {
    let query = `
      SELECT
        b.id, b.child_id, b.branch_id, b.scheduled_at, b.status, b.age_group,
        COALESCE(hp.name, '(ลูกค้าทั่วไป)') as child_name,
        co.name as course_name,
        br.name as branch_name
      FROM Bookings b
      LEFT JOIN Children ch ON b.child_id = ch.id AND b.child_id != 0
      LEFT JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
      JOIN Courses co ON b.course_id = co.id
      JOIN Branches br ON b.branch_id = br.id
      WHERE 1=1
    `;
    const sqlParams: any[] = [];

    if (params?.branchId && params.branchId !== 'all') {
      query += ` AND b.branch_id = ?`;
      sqlParams.push(parseInt(params.branchId));
    }
    if (params?.startDate) {
      query += ` AND date(b.scheduled_at) >= ?`;
      sqlParams.push(params.startDate);
    }
    if (params?.endDate) {
      query += ` AND date(b.scheduled_at) <= ?`;
      sqlParams.push(params.endDate);
    }

    query += ` ORDER BY b.scheduled_at ASC`;

    const stmt = this.db.prepare(query);
    const { results } = await (sqlParams.length > 0 ? stmt.bind(...sqlParams) : stmt).all();
    return results;
  }

  async createBooking(data: {
    childId: number;
    courseId: number;
    branchId: number;
    scheduledAt: string;
    ageGroup: string;
    status: string;
  }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Bookings (child_id, course_id, branch_id, scheduled_at, status, age_group)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(data.childId, data.courseId, data.branchId, data.scheduledAt, data.status, data.ageGroup).run();
    return result.meta.last_row_id;
  }

  async getAllCrmUsers(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT cu.*, b.name as branch_name
      FROM CRM_Users cu
      LEFT JOIN Branches b ON cu.branch_id = b.id
      ORDER BY cu.created_at DESC
    `).all();
    return results;
  }

  async createCrmUser(data: any): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO CRM_Users (
        email, password_hash, full_name, role, branch_id,
        phone, national_id, address, salary, start_date,
        department, position, employment_type,
        emergency_contact_name, emergency_contact_phone, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.email, data.passwordHash, data.fullName, data.role, data.branchId || null,
      data.phone || null, data.nationalId || null, data.address || null, data.salary || null, data.startDate || null,
      data.department || null, data.position || null, data.employmentType || null,
      data.emergencyContactName || null, data.emergencyContactPhone || null, data.note || null
    ).run();
    return result.meta.last_row_id;
  }

  async updateCrmUser(id: number, data: any): Promise<void> {
    let query = `
      UPDATE CRM_Users SET 
        email = ?, full_name = ?, role = ?, branch_id = ?,
        phone = ?, national_id = ?, address = ?, salary = ?, start_date = ?,
        department = ?, position = ?, employment_type = ?,
        emergency_contact_name = ?, emergency_contact_phone = ?, note = ?
    `;
    const params: any[] = [
      data.email, data.fullName, data.role, data.branchId || null,
      data.phone || null, data.nationalId || null, data.address || null, data.salary || null, data.startDate || null,
      data.department || null, data.position || null, data.employmentType || null,
      data.emergencyContactName || null, data.emergencyContactPhone || null, data.note || null
    ];

    if (data.passwordHash) {
      query += `, password_hash = ?`;
      params.push(data.passwordHash);
    }

    query += ` WHERE id = ?`;
    params.push(id);

    await this.db.prepare(query).bind(...params).run();
  }

  async deleteCrmUser(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM CRM_Users WHERE id = ?').bind(id).run();
  }

  async getAllCourses(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT c.*, cat.name as category_name
      FROM Courses c
      JOIN Course_Categories cat ON c.category_id = cat.id
      ORDER BY cat.name ASC, c.name ASC
    `).all();
    return results;
  }

  async getAllCategories(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Course_Categories ORDER BY name ASC').all();
    return results;
  }

  async getAllBranches(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Branches ORDER BY name ASC').all();
    return results;
  }

  async getBranchById(id: number): Promise<any | null> {
    return await this.db.prepare('SELECT * FROM Branches WHERE id = ?').bind(id).first();
  }

  // --- Branch Default Slots CRUD ---
  async getBranchDefaultSlots(branchId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM Branch_Default_Slots 
      WHERE branch_id = ? 
      ORDER BY start_time ASC
    `).bind(branchId).all();
    return results;
  }

  async createBranchDefaultSlot(data: any): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Branch_Default_Slots (
        branch_id, label, start_time, end_time
      ) VALUES (?, ?, ?, ?)
    `).bind(
      data.branchId, data.label, data.startTime, data.endTime
    ).run();
    return result.meta.last_row_id;
  }

  async deleteBranchDefaultSlot(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Branch_Default_Slots WHERE id = ?').bind(id).run();
  }

  async createCourse(data: {
    categoryId: number;
    code?: string;
    name: string;
    nameEn?: string;
    description?: string;
    descriptionEn?: string;
    ageMin?: number;
    ageMax?: number;
    duration?: string;
    originalPrice?: number;
    premiumPrice?: number;
    couponCount?: number;
    couponRequirementsJson?: string;
    achievementSkillsJson?: string;
    metricsJson?: string;
    thumbnailUrl?: string;
    imagesJson?: string;
    videoUrl?: string;
    teacherGuideUrl?: string;
  }): Promise<number> {
    const p = data.originalPrice ?? 0;
    const v = data.premiumPrice ?? 0;
    const c = data.couponCount ?? 1;
    const dur = data.duration ?? '01:00';
    const skills = data.achievementSkillsJson ?? null;
    const metrics = data.metricsJson ?? null;
    const couponReqs = data.couponRequirementsJson ?? null;

    const result = await this.db.prepare(`
      INSERT INTO Courses (
        category_id, code, name, name_en, description, description_en,
        age_min, age_max, duration, original_price, premium_price, coupon_count,
        achievement_skills_json, metrics_json, coupon_requirements_json,
        is_little_junior_enabled, duration_little_junior, coupon_little_junior,
        original_price_little_junior, premium_price_little_junior,
        is_junior_enabled, duration_junior, coupon_junior,
        original_price_junior, premium_price_junior,
        achievement_skills_little_junior_json, metrics_little_junior_json,
        achievement_skills_junior_json, metrics_junior_json,
        thumbnail_url, images_json, video_url, teacher_guide_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.categoryId, data.code ?? null, data.name, data.nameEn ?? null,
      data.description ?? null, data.descriptionEn ?? null,
      data.ageMin ?? 3, data.ageMax ?? 9,
      dur, p, v, c, skills, metrics, couponReqs,
      dur, c, p, v,
      dur, c, p, v,
      skills, metrics, skills, metrics,
      data.thumbnailUrl ?? null, data.imagesJson ?? null,
      data.videoUrl ?? null, data.teacherGuideUrl ?? null
    ).run();
    return result.meta.last_row_id;
  }

  async updateCourse(id: number, data: {
    categoryId: number;
    code?: string;
    name: string;
    nameEn?: string;
    description?: string;
    descriptionEn?: string;
    ageMin?: number;
    ageMax?: number;
    duration?: string;
    originalPrice?: number;
    premiumPrice?: number;
    couponCount?: number;
    couponRequirementsJson?: string;
    achievementSkillsJson?: string;
    metricsJson?: string;
    thumbnailUrl?: string;
    imagesJson?: string;
    videoUrl?: string;
    teacherGuideUrl?: string;
  }): Promise<void> {
    const p = data.originalPrice ?? 0;
    const v = data.premiumPrice ?? 0;
    const c = data.couponCount ?? 1;
    const dur = data.duration ?? '01:00';
    const skills = data.achievementSkillsJson ?? null;
    const metrics = data.metricsJson ?? null;
    const couponReqs = data.couponRequirementsJson ?? null;

    await this.db.prepare(`
      UPDATE Courses SET
        category_id = ?, code = ?, name = ?, name_en = ?, description = ?, description_en = ?,
        age_min = ?, age_max = ?, duration = ?, original_price = ?, premium_price = ?, coupon_count = ?,
        achievement_skills_json = ?, metrics_json = ?, coupon_requirements_json = ?,
        duration_little_junior = ?, coupon_little_junior = ?,
        original_price_little_junior = ?, premium_price_little_junior = ?,
        duration_junior = ?, coupon_junior = ?,
        original_price_junior = ?, premium_price_junior = ?,
        achievement_skills_little_junior_json = ?, metrics_little_junior_json = ?,
        achievement_skills_junior_json = ?, metrics_junior_json = ?,
        thumbnail_url = ?, images_json = ?, video_url = ?, teacher_guide_url = ?
      WHERE id = ?
    `).bind(
      data.categoryId, data.code ?? null, data.name, data.nameEn ?? null,
      data.description ?? null, data.descriptionEn ?? null,
      data.ageMin ?? 3, data.ageMax ?? 9,
      dur, p, v, c, skills, metrics, couponReqs,
      dur, c, p, v,
      dur, c, p, v,
      skills, metrics, skills, metrics,
      data.thumbnailUrl ?? null, data.imagesJson ?? null,
      data.videoUrl ?? null, data.teacherGuideUrl ?? null,
      id
    ).run();
  }

  async deleteCourse(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Courses WHERE id = ?').bind(id).run();
  }

  // --- Category CRUD ---
  async createCategory(name: string, description: string = '', color?: string, imageUrl?: string, imagePosition?: string): Promise<number> {
    const result = await this.db.prepare(
      'INSERT INTO Course_Categories (name, description, color, image_url, image_position) VALUES (?, ?, ?, ?, ?)'
    ).bind(name, description || '', color || null, imageUrl || null, imagePosition || '50% 50%').run();
    return result.meta.last_row_id;
  }

  async updateCategory(id: number, name: string, description: string = '', color?: string, imageUrl?: string, imagePosition?: string): Promise<void> {
    await this.db.prepare(
      'UPDATE Course_Categories SET name = ?, description = ?, color = ?, image_url = ?, image_position = ? WHERE id = ?'
    ).bind(name, description || '', color || null, imageUrl || null, imagePosition || '50% 50%', id).run();
  }

  async deleteCategory(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Course_Categories WHERE id = ?').bind(id).run();
  }

  // --- Skills Library CRUD ---
  async getSkillsLibrary(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Skills_Library ORDER BY type ASC, name ASC').all();
    return results;
  }

  async createSkill(name: string, type: string, icon: string, color?: string): Promise<number> {
    const result = await this.db.prepare(
      'INSERT INTO Skills_Library (name, type, icon, color) VALUES (?, ?, ?, ?)'
    ).bind(name, type, icon, color || null).run();
    return result.meta.last_row_id;
  }

  async updateSkill(id: number, name: string, type: string, icon: string, color?: string): Promise<void> {
    await this.db.prepare(
      'UPDATE Skills_Library SET name = ?, type = ?, icon = ?, color = ? WHERE id = ?'
    ).bind(name, type, icon, color || null, id).run();
  }

  async deleteSkill(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Skills_Library WHERE id = ?').bind(id).run();
  }

  // --- System Settings ---
  async getSystemSettings(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM System_Settings').all();
    return results;
  }

  async updateSystemSetting(key: string, value: string): Promise<void> {
    await this.db.prepare(
      'INSERT INTO System_Settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP'
    ).bind(key, value).run();
  }

  // --- Time Slots (Daily Opening Hours) CRUD ---
  async getAllTimeSlots(branchId?: number | string, date?: string): Promise<any[]> {
    let query = 'SELECT * FROM Time_Slots WHERE 1=1';
    const params: any[] = [];
    if (branchId && branchId !== 'all') {
      query += ' AND branch_id = ?';
      params.push(branchId);
    }
    if (date) {
      query += ' AND date = ?';
      params.push(date);
    }
    query += ' ORDER BY start_time ASC';
    const { results } = await this.db.prepare(query).bind(...params).all();
    return results;
  }

  async createTimeSlot(data: any): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Time_Slots (
        branch_id, date, label, start_time, end_time
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.branchId, data.date, data.label, data.startTime, data.endTime
    ).run();
    return result.meta.last_row_id;
  }

  async updateTimeSlot(id: number, data: any): Promise<void> {
    await this.db.prepare(`
      UPDATE Time_Slots SET 
        branch_id = ?, date = ?, label = ?, start_time = ?, end_time = ?
      WHERE id = ?
    `).bind(
      data.branchId, data.date, data.label, data.startTime, data.endTime,
      id
    ).run();
  }

  async deleteTimeSlot(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Time_Slots WHERE id = ?').bind(id).run();
  }

  async clearDayTimeSlots(branchId: number, date: string): Promise<void> {
    await this.db.prepare('DELETE FROM Time_Slots WHERE branch_id = ? AND date = ?').bind(branchId, date).run();
  }

  async getSlotOccupancy(branchId: number, date: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT scheduled_at, age_group, COUNT(*) as occupant_count
      FROM Bookings
      WHERE branch_id = ? AND scheduled_at LIKE ? AND status != 'cancelled'
      GROUP BY scheduled_at, age_group
    `).bind(branchId, `${date}%`).all();
    return results;
  }

  async findCrmUserByEmail(email: string): Promise<any | null> {
    return await this.db.prepare('SELECT * FROM CRM_Users WHERE email = ?').bind(email).first();
  }

  async getFacilitatorBookings(email: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT 
        b.id, b.scheduled_at, b.status,
        c.name as child_name,
        co.name as course_name,
        br.name as branch_name
      FROM Bookings b
      JOIN Children ch ON b.child_id = ch.id
      JOIN HD_Profiles c ON ch.hd_profile_id = c.id
      JOIN Courses co ON b.course_id = co.id
      JOIN Branches br ON b.branch_id = br.id
      ORDER BY b.scheduled_at DESC
    `).all();
    return results;
  }
}

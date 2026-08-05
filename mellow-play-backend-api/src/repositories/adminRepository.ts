export class AdminRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async getDashboardStats(): Promise<any> {
    // NOTE: db.batch() takes an array of un-executed prepared statements —
    // calling .first() here executes each query immediately and hands
    // batch() an array of Promises instead, which D1 rejects. Run them
    // concurrently with Promise.all instead.
    const [activeMembers, totalChildren, upcomingBookings] = await Promise.all([
      this.db.prepare('SELECT COUNT(*) as total FROM Users').first<any>(),
      this.db.prepare('SELECT COUNT(*) as total FROM Children').first<any>(),
      this.db.prepare('SELECT COUNT(*) as total FROM Bookings WHERE scheduled_at >= date("now")').first<any>(),
    ]);

    return {
      activeMembers: activeMembers?.total || 0,
      totalChildren: totalChildren?.total || 0,
      upcomingBookings: upcomingBookings?.total || 0,
    };
  }

  // Flat, one-row-per-child directory across BOTH child sources (HD-based
  // app registrations and CRM-created walk-ins) with their parent's contact
  // info attached — getAllUsers nests children under each parent instead,
  // which is the right shape for the parent-edit screen but useless for
  // "find this specific kid by name/nickname/phone" search across the whole
  // customer base.
  async getChildrenDirectory(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT
        c.id as child_id, hp.name as full_name, hp.name_en as full_name_en, hp.nickname,
        hp.gender, hp.birth_date as date_of_birth, 1 as is_hd,
        c.membership_type, c.membership_expires_at,
        u.id as user_id, u.first_name || ' ' || u.last_name as parent_name,
        TRIM(COALESCE(u.first_name_en, '') || ' ' || COALESCE(u.last_name_en, '')) as parent_name_en,
        u.phone as parent_phone, u.email as parent_email
      FROM Children c
      JOIN HD_Profiles hp ON c.hd_profile_id = hp.id
      JOIN Users u ON hp.user_id = u.id
      UNION ALL
      SELECT
        cc.id as child_id, cc.full_name, cc.full_name_en, cc.nickname,
        cc.gender, cc.date_of_birth, 0 as is_hd,
        NULL as membership_type, NULL as membership_expires_at,
        u.id as user_id, u.first_name || ' ' || u.last_name as parent_name,
        TRIM(COALESCE(u.first_name_en, '') || ' ' || COALESCE(u.last_name_en, '')) as parent_name_en,
        u.phone as parent_phone, u.email as parent_email
      FROM User_CRM_Children cc
      JOIN Users u ON cc.user_id = u.id
      ORDER BY full_name ASC
    `).all();
    return results;
  }

  async getAllUsers(): Promise<any[]> {
    // Children can come from either the app's HD-based registration flow
    // (Children, parent_id) or CRM-created walk-in records (User_CRM_Children)
    // — a plain LEFT JOIN against only one of them undercounts (usually to
    // zero) for regular app users. Sum both via correlated subqueries instead
    // of joining both tables directly, which would multiply rows together.
    // Membership is per-child now (see Children.membership_type) — Users.
    // membership_type/membership_expires_at are no longer read here, replaced
    // by has_premium_child so the list view can still flag which parents have
    // an active Premium child without fetching every child individually.
    const { results } = await this.db.prepare(`
      SELECT
        u.id, u.phone, u.email, u.first_name, u.last_name,
        (
          COALESCE((SELECT COUNT(*) FROM Children WHERE parent_id = u.id), 0) +
          COALESCE((SELECT COUNT(*) FROM User_CRM_Children WHERE user_id = u.id), 0)
        ) as children_count,
        EXISTS (
          SELECT 1 FROM Children ch WHERE ch.parent_id = u.id
            AND ch.membership_type = 'premium'
            AND (ch.membership_expires_at IS NULL OR ch.membership_expires_at > datetime('now'))
        ) as has_premium_child
      FROM Users u
      ORDER BY u.created_at DESC
    `).all();
    return results;
  }

  async getUserById(id: number): Promise<any | null> {
    const user = await this.db.prepare(
      'SELECT * FROM Users WHERE id = ?'
    ).bind(id).first();
    if (!user) return null;

    const { results: crmChildren } = await this.db.prepare(
      'SELECT *, 0 as is_hd FROM User_CRM_Children WHERE user_id = ? ORDER BY created_at ASC'
    ).bind(id).all();

    const { results: hdChildren } = await this.db.prepare(`
      SELECT c.id, hp.name as full_name, hp.name_en as full_name_en, hp.nickname, hp.gender, hp.birth_date as date_of_birth,
             hp.relation, COALESCE(c.avatar, c.custom_photo_url) as avatar, 1 as is_hd,
             c.membership_type, c.membership_expires_at
      FROM Children c
      JOIN HD_Profiles hp ON c.hd_profile_id = hp.id
      WHERE hp.user_id = ?
    `).bind(id).all();

    const children = [...(crmChildren || []), ...(hdChildren || [])];

    const { results: coupons } = await this.db.prepare(
      'SELECT * FROM User_Coupons WHERE user_id = ? ORDER BY expires_at ASC'
    ).bind(id).all();

    return { ...user, children: children || [], coupons: coupons || [] };
  }

  // membership_type/membership_expires_at are no longer edited here — they
  // moved to Children (see updateHdChild) since Premium status is per-child.
  async updateUser(id: number, data: {
    firstName?: string;
    lastName?: string;
    firstNameEn?: string;
    lastNameEn?: string;
    phone?: string;
    email?: string;
    relationship?: string;
    lineId?: string;
    pdpaConsent?: boolean;
    marketingConsent?: boolean | null;
    applicationDate?: string;
    profileImageUrl?: string;
    displayName?: string;
    isCommunityAdmin?: boolean;
    children?: Array<{ id?: number; full_name: string; full_name_en?: string; nickname?: string; gender?: string; date_of_birth?: string }>;
  }): Promise<void> {
    await this.db.prepare(`
      UPDATE Users SET
        first_name = ?, last_name = ?, first_name_en = ?, last_name_en = ?, phone = ?, email = ?,
        relationship = ?, line_id = ?,
        pdpa_consent = ?, marketing_consent = ?,
        application_date = ?, profile_image_url = ?, display_name = ?,
        is_community_admin = ?
      WHERE id = ?
    `).bind(
      data.firstName ?? null, data.lastName ?? null,
      data.firstNameEn ?? null, data.lastNameEn ?? null,
      data.phone ?? null, data.email ?? null,
      data.relationship ?? null, data.lineId ?? null,
      data.pdpaConsent ? 1 : 0, data.marketingConsent != null ? (data.marketingConsent ? 1 : 0) : null,
      data.applicationDate ?? null, data.profileImageUrl ?? null, data.displayName ?? null,
      data.isCommunityAdmin ? 1 : 0,
      id
    ).run();

    // Replace CRM children
    if (data.children !== undefined) {
      await this.db.prepare('DELETE FROM User_CRM_Children WHERE user_id = ?').bind(id).run();
      for (const child of data.children) {
        await this.db.prepare(`
          INSERT INTO User_CRM_Children (user_id, full_name, full_name_en, nickname, gender, date_of_birth)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(id, child.full_name, child.full_name_en ?? null, child.nickname ?? null, child.gender ?? null, child.date_of_birth ?? null).run();
      }
    }
  }

  // Editing a child that came from the consumer app's own HD registration
  // (Children/HD_Profiles) is deliberately narrower than a CRM-created
  // child: full_name and date_of_birth feed the Human Design chart
  // calculation (hd_type/hd_strategy/hd_authority etc.), so changing them
  // here without recalculating the whole chart would leave it inconsistent.
  // nickname/gender/relation are just display metadata — safe to edit directly.
  // name_en is likewise just a display label (an English translation of the
  // Thai name already on file), not fed into the HD chart, so it's safe here
  // too even though the Thai `name` itself stays locked.
  // membership_type/membership_expires_at live on Children itself (not
  // HD_Profiles), since premium status is per-child, not part of the HD chart.
  async updateHdChild(childId: number, data: { nickname?: string; gender?: string; relation?: string; nameEn?: string; membershipType?: string; membershipExpiresAt?: string | null }): Promise<void> {
    const child = await this.db.prepare('SELECT hd_profile_id FROM Children WHERE id = ?').bind(childId).first<{ hd_profile_id: number }>();
    if (!child) throw new Error('Child not found');
    await this.db.prepare(`
      UPDATE HD_Profiles SET nickname = ?, gender = ?, relation = ?, name_en = ? WHERE id = ?
    `).bind(data.nickname ?? null, data.gender ?? null, data.relation ?? null, data.nameEn ?? null, child.hd_profile_id).run();

    if (data.membershipType !== undefined) {
      await this.db.prepare(`
        UPDATE Children SET membership_type = ?, membership_expires_at = ? WHERE id = ?
      `).bind(data.membershipType, data.membershipExpiresAt ?? null, childId).run();
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

  async getAllBookings(params?: { branchId?: string; startDate?: string; endDate?: string; pendingPayment?: boolean }): Promise<any[]> {
    let query = `
      SELECT
        b.id, b.child_id, b.course_id, b.branch_id, b.scheduled_at, b.status, b.age_group,
        b.calendar_id, b.slot_date, b.slot_start_time, b.payment_status, b.notes, b.created_at,
        b.sponsor_tag,
        COALESCE(hp.name, '(ลูกค้าทั่วไป)') as child_name,
        hp.name_en as child_name_en,
        hp.nickname as child_nickname,
        hp.birth_date as child_birth_date,
        hp.gender as child_gender,
        (u.first_name || ' ' || u.last_name) as parent_name,
        TRIM(COALESCE(u.first_name_en, '') || ' ' || COALESCE(u.last_name_en, '')) as parent_name_en,
        u.phone as parent_phone,
        u.email as parent_email,
        co.name as course_name, co.original_price,
        br.name as branch_name,
        COALESCE(t.created_at, b.paid_at) as paid_at,
        t.payment_method as payment_method,
        t.amount as paid_amount
      FROM Bookings b
      LEFT JOIN Children ch ON b.child_id = ch.id AND b.child_id != 0
      LEFT JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
      LEFT JOIN Users u ON ch.parent_id = u.id
      JOIN Courses co ON b.course_id = co.id
      JOIN Branches br ON b.branch_id = br.id
      LEFT JOIN Transactions t ON t.booking_id = b.id AND t.is_voided = 0
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
    if (params?.pendingPayment) {
      query += ` AND b.status NOT IN ('cancelled')
        AND (b.payment_status IS NULL OR b.payment_status NOT IN ('prepaid'))
        AND NOT EXISTS (
          SELECT 1 FROM Transactions t
          WHERE t.booking_id = b.id AND t.is_voided = 0 AND t.payment_method != 'later'
        )`;
    }

    query += ` ORDER BY b.scheduled_at ASC`;

    const stmt = this.db.prepare(query);
    const { results } = await (sqlParams.length > 0 ? stmt.bind(...sqlParams) : stmt).all();
    return results;
  }

  async createBooking(data: {
    childId: number;
    courseId: number;
    branchId: number | null;
    scheduledAt: string;
    ageGroup: string;
    status: string;
    calendarId?: number;
    slotDate?: string;
    slotStartTime?: string;
    paymentStatus?: string;
    paymentMethod?: string;
    notes?: string;
    price?: number;
    sponsorTag?: string;
  }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Bookings
        (child_id, course_id, branch_id, scheduled_at, status, age_group,
         calendar_id, slot_date, slot_start_time, payment_status, payment_method, notes, price, sponsor_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.childId, data.courseId, data.branchId, data.scheduledAt, data.status, data.ageGroup,
      data.calendarId ?? null, data.slotDate ?? null, data.slotStartTime ?? null,
      data.paymentStatus ?? 'prepaid', data.paymentMethod ?? 'coupon', data.notes ?? null,
      data.price ?? null, data.sponsorTag ?? null
    ).run();
    return result.meta.last_row_id;
  }

  async getAllCrmUsers(): Promise<any[]> {
    // password_hash deliberately excluded — never send it to the browser.
    const { results } = await this.db.prepare(`
      SELECT cu.id, cu.email, cu.full_name, cu.role, cu.branch_id, cu.phone,
             cu.national_id, cu.address, cu.salary, cu.salary_type, cu.start_date, cu.end_date,
             cu.department, cu.position, cu.employment_type, cu.employment_status,
             cu.bank_name, cu.bank_account_name, cu.bank_account_number, cu.profile_image_url,
             cu.emergency_contact_name, cu.emergency_contact_phone, cu.note,
             cu.work_days, cu.work_start_time, cu.work_end_time, cu.created_at,
             cu.reset_token_expires_at,
             CASE WHEN cu.reset_token IS NOT NULL THEN 1 ELSE 0 END as has_pending_reset,
             b.name as branch_name
      FROM CRM_Users cu
      LEFT JOIN Branches b ON cu.branch_id = b.id
      ORDER BY cu.created_at DESC
    `).all();
    return results;
  }

  // Manual-share password reset (no email service — internal org): generate
  // a token + expiry, hand the link back to the admin to send however they
  // like (LINE, in person, etc.), rather than emailing it automatically.
  async setCrmUserResetToken(id: number, token: string, expiresAt: string): Promise<void> {
    await this.db.prepare(
      'UPDATE CRM_Users SET reset_token = ?, reset_token_expires_at = ? WHERE id = ?'
    ).bind(token, expiresAt, id).run();
  }

  async clearCrmUserResetToken(id: number): Promise<void> {
    await this.db.prepare(
      'UPDATE CRM_Users SET reset_token = NULL, reset_token_expires_at = NULL WHERE id = ?'
    ).bind(id).run();
  }

  async findCrmUserByResetToken(token: string): Promise<any> {
    return await this.db.prepare(
      'SELECT id, reset_token_expires_at FROM CRM_Users WHERE reset_token = ?'
    ).bind(token).first();
  }

  async resetCrmUserPasswordByToken(id: number, passwordHash: string): Promise<void> {
    await this.db.prepare(
      'UPDATE CRM_Users SET password_hash = ?, reset_token = NULL, reset_token_expires_at = NULL WHERE id = ?'
    ).bind(passwordHash, id).run();
  }

  // Field names below match the CRM frontend's payload (snake_case) exactly —
  // CrmUserManagement.tsx's `form` state and this repo previously disagreed
  // (camelCase here vs snake_case there), which made every create/update
  // throw D1_TYPE_ERROR (binding `undefined`) and 500 unconditionally.
  async createCrmUser(data: any): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO CRM_Users (
        email, password_hash, full_name, role, branch_id,
        phone, national_id, address, salary, salary_type, start_date, end_date,
        department, position, employment_type, employment_status,
        bank_name, bank_account_name, bank_account_number, profile_image_url,
        emergency_contact_name, emergency_contact_phone, note,
        work_days, work_start_time, work_end_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.email, data.passwordHash, data.full_name, data.role, data.branch_id || null,
      data.phone || null, data.national_id || null, data.address || null, data.salary || null,
      data.salary_type || 'monthly', data.start_date || null, data.end_date || null,
      data.department || null, data.position || null, data.employment_type || null, data.employment_status || 'active',
      data.bank_name || null, data.bank_account_name || null, data.bank_account_number || null, data.profile_image_url || null,
      data.emergency_contact_name || null, data.emergency_contact_phone || null, data.note || null,
      JSON.stringify(data.work_days || []), data.work_start_time || '09:00', data.work_end_time || '18:00'
    ).run();
    return result.meta.last_row_id;
  }

  async updateCrmUser(id: number, data: any): Promise<void> {
    let query = `
      UPDATE CRM_Users SET
        email = ?, full_name = ?, role = ?, branch_id = ?,
        phone = ?, national_id = ?, address = ?, salary = ?, salary_type = ?, start_date = ?, end_date = ?,
        department = ?, position = ?, employment_type = ?, employment_status = ?,
        bank_name = ?, bank_account_name = ?, bank_account_number = ?, profile_image_url = ?,
        emergency_contact_name = ?, emergency_contact_phone = ?, note = ?,
        work_days = ?, work_start_time = ?, work_end_time = ?
    `;
    const params: any[] = [
      data.email, data.full_name, data.role, data.branch_id || null,
      data.phone || null, data.national_id || null, data.address || null, data.salary || null,
      data.salary_type || 'monthly', data.start_date || null, data.end_date || null,
      data.department || null, data.position || null, data.employment_type || null, data.employment_status || 'active',
      data.bank_name || null, data.bank_account_name || null, data.bank_account_number || null, data.profile_image_url || null,
      data.emergency_contact_name || null, data.emergency_contact_phone || null, data.note || null,
      JSON.stringify(data.work_days || []), data.work_start_time || '09:00', data.work_end_time || '18:00'
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
      SELECT c.*, cat.name as category_name,
        (
          SELECT json_group_array(json_object('day_of_week', day_of_week, 'specific_date', specific_date))
          FROM Calendar_Slot_Rules
          WHERE calendar_id = c.calendar_id AND is_active = 1
        ) as calendar_summary_json,
        (
          SELECT json_group_array(json_object('view_key', view_key, 'image_url', image_url, 'focal_x', focal_x, 'focal_y', focal_y, 'zoom', zoom))
          FROM Course_Image_Views
          WHERE course_id = c.id
        ) as image_views_json,
        (
          SELECT json_group_array(json_object('image_url', image_url, 'focal_x', focal_x, 'focal_y', focal_y, 'zoom', zoom))
          FROM Course_Image_Focals
          WHERE course_id = c.id
        ) as image_focals_json
      FROM Courses c
      JOIN Course_Categories cat ON c.category_id = cat.id
      ORDER BY cat.name ASC, c.name ASC
    `).all();
    return this.enrichCourseSkillIcons(results as any[]);
  }

  // A course only ever stores its skills as {th, en} labels — the actual
  // icon/color live on Skills_Library and can be changed there independently
  // at any time, so the icon is resolved live by name here (the same
  // by-name lookup the CRM's own SkillTagInput does against its in-memory
  // library) rather than freezing a possibly-stale icon into the course
  // record. Without this, every consumer of achievement_skills_json (course
  // detail, booking flow) has no way to know which icon staff configured.
  private async enrichCourseSkillIcons(courses: any[]): Promise<any[]> {
    const { results: library } = await this.db.prepare('SELECT name, icon, color FROM Skills_Library').all();
    const byName = new Map((library as any[]).map(s => [s.name, { icon: s.icon, color: s.color }]));

    const enrich = (json: string | null | undefined) => {
      if (!json) return json;
      try {
        const arr = JSON.parse(json);
        if (!Array.isArray(arr)) return json;
        return JSON.stringify(arr.map((s: any) => ({ ...s, ...(byName.get(s?.th) || {}) })));
      } catch {
        return json;
      }
    };

    return courses.map(c => ({
      ...c,
      achievement_skills_json: enrich(c.achievement_skills_json),
      achievement_skills_little_junior_json: enrich(c.achievement_skills_little_junior_json),
      achievement_skills_junior_json: enrich(c.achievement_skills_junior_json),
    }));
  }

  async getCourseImageViews(courseId: number): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT view_key, image_url, focal_x, focal_y, zoom FROM Course_Image_Views WHERE course_id = ?'
    ).bind(courseId).all();
    return results;
  }

  async upsertCourseImageViews(
    courseId: number,
    views: Array<{ viewKey: string; imageUrl: string; focalX: number; focalY: number; zoom: number }>,
  ): Promise<void> {
    for (const v of views) {
      await this.db.prepare(`
        INSERT INTO Course_Image_Views (course_id, view_key, image_url, focal_x, focal_y, zoom, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(course_id, view_key) DO UPDATE SET
          image_url = excluded.image_url,
          focal_x = excluded.focal_x,
          focal_y = excluded.focal_y,
          zoom = excluded.zoom,
          updated_at = CURRENT_TIMESTAMP
      `).bind(courseId, v.viewKey, v.imageUrl, v.focalX, v.focalY, v.zoom).run();
    }
  }

  async getCourseImageFocals(courseId: number): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT image_url, focal_x, focal_y, zoom FROM Course_Image_Focals WHERE course_id = ?'
    ).bind(courseId).all();
    return results;
  }

  async upsertCourseImageFocals(
    courseId: number,
    focals: Array<{ imageUrl: string; focalX: number; focalY: number; zoom: number }>,
  ): Promise<void> {
    for (const f of focals) {
      await this.db.prepare(`
        INSERT INTO Course_Image_Focals (course_id, image_url, focal_x, focal_y, zoom, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(course_id, image_url) DO UPDATE SET
          focal_x = excluded.focal_x,
          focal_y = excluded.focal_y,
          zoom = excluded.zoom,
          updated_at = CURRENT_TIMESTAMP
      `).bind(courseId, f.imageUrl, f.focalX, f.focalY, f.zoom).run();
    }
  }

  async getAllCategories(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Course_Categories ORDER BY name ASC').all();
    return results;
  }

  async getAllBranches(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Branches WHERE is_active = 1 ORDER BY name ASC').all();
    return results;
  }

  async getBranchById(id: number): Promise<any | null> {
    return await this.db.prepare('SELECT * FROM Branches WHERE id = ?').bind(id).first();
  }

  async createBranch(d: any): Promise<number> {
    const openTime = d.open_time ?? d.openTime ?? null;
    const closeTime = d.close_time ?? d.closeTime ?? null;
    const r = await this.db.prepare(`
      INSERT INTO Branches (name, address, phone, email, open_time, close_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(d.name, d.address ?? null, d.phone ?? null, d.email ?? null, openTime, closeTime).run();
    return r.meta.last_row_id as number;
  }

  async updateBranch(id: number, d: any): Promise<void> {
    const openTime = d.open_time ?? d.openTime ?? null;
    const closeTime = d.close_time ?? d.closeTime ?? null;
    const isActive = d.is_active ?? d.isActive;
    await this.db.prepare(`
      UPDATE Branches SET
        name = COALESCE(?, name),
        address = ?,
        phone = ?,
        email = ?,
        open_time = ?,
        close_time = ?,
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).bind(d.name ?? null, d.address ?? null, d.phone ?? null, d.email ?? null,
            openTime, closeTime,
            isActive != null ? (isActive ? 1 : 0) : null, id).run();
  }

  async deleteBranch(id: number): Promise<void> {
    await this.db.prepare('UPDATE Branches SET is_active = 0 WHERE id=?').bind(id).run();
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
        branch_id, label, start_time, end_time, capacity
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.branchId, data.label, data.startTime, data.endTime, data.capacity ?? 20
    ).run();
    return result.meta.last_row_id;
  }

  async deleteBranchDefaultSlot(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Branch_Default_Slots WHERE id = ?').bind(id).run();
  }

  async createCourse(data: {
    categoryId: number;
    calendarId?: number;
    code?: string;
    name: string;
    nameEn?: string;
    description?: string;
    shortDescription?: string;
    branchIds?: string;
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
    detailPosterUrl?: string;
    imagesJson?: string;
    videoUrl?: string;
    teacherGuideUrl?: string;
    isRecommended?: boolean;
    isExtraclass?: boolean;
    isEvent?: boolean;
    isService?: boolean;
    allowRepeat?: boolean;
    registrationFormId?: number | null;
    shortDescriptionEn?: string;
    location?: string;
    location_link?: string;
    stampsOnCompletion?: number;
    stampExpiryMonths?: number;
    salesCommissionType?: string;
    salesCommissionValue?: number;
    teacherCommissionType?: string;
    teacherCommissionValue?: number;
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
        category_id, calendar_id, code, name, name_en, description, short_description, branch_ids, description_en,
        age_min, age_max, duration, original_price, premium_price, coupon_count,
        achievement_skills_json, metrics_json, coupon_requirements_json,
        is_little_junior_enabled, duration_little_junior, coupon_little_junior,
        original_price_little_junior, premium_price_little_junior,
        is_junior_enabled, duration_junior, coupon_junior,
        original_price_junior, premium_price_junior,
        achievement_skills_little_junior_json, metrics_little_junior_json,
        achievement_skills_junior_json, metrics_junior_json,
        thumbnail_url, detail_poster_url, images_json, video_url, teacher_guide_url, is_recommended, is_extraclass, is_event, is_service, allow_repeat, registration_form_id,
        short_description_en, location, location_link, stamps_on_completion, stamp_expiry_months,
        sales_commission_type, sales_commission_value, teacher_commission_type, teacher_commission_value
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        1, ?, ?, ?, ?,
        1, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `).bind(
      data.categoryId, data.calendarId ?? null, data.code ?? null, data.name, data.nameEn ?? null,
      data.description ?? null, data.shortDescription ?? null, data.branchIds ?? '[]', data.descriptionEn ?? null,
      data.ageMin ?? 3, data.ageMax ?? 9,
      dur, p, v, c, skills, metrics, couponReqs,
      dur, c, p, v,
      dur, c, p, v,
      skills, metrics, skills, metrics,
      data.thumbnailUrl ?? null, data.detailPosterUrl ?? null, data.imagesJson ?? null,
      data.videoUrl ?? null, data.teacherGuideUrl ?? null,
      data.isRecommended ? 1 : 0,
      data.isExtraclass ? 1 : 0,
      data.isEvent ? 1 : 0,
      data.isService ? 1 : 0,
      data.allowRepeat === false ? 0 : 1,
      data.registrationFormId || null,
      data.shortDescriptionEn ?? null, data.location ?? null, data.location_link ?? null,
      data.stampsOnCompletion ?? 0, data.stampExpiryMonths ?? 12,
      data.salesCommissionType ?? null, data.salesCommissionValue ?? null,
      data.teacherCommissionType ?? null, data.teacherCommissionValue ?? null
    ).run();
    return result.meta.last_row_id;
  }

  async updateCourse(id: number, data: {
    categoryId: number;
    calendarId?: number;
    code?: string;
    name: string;
    nameEn?: string;
    description?: string;
    shortDescription?: string;
    branchIds?: string;
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
    detailPosterUrl?: string;
    imagesJson?: string;
    videoUrl?: string;
    teacherGuideUrl?: string;
    isRecommended?: boolean;
    isExtraclass?: boolean;
    isEvent?: boolean;
    isService?: boolean;
    allowRepeat?: boolean;
    registrationFormId?: number | null;
    shortDescriptionEn?: string;
    location?: string;
    location_link?: string;
    stampsOnCompletion?: number;
    stampExpiryMonths?: number;
    salesCommissionType?: string;
    salesCommissionValue?: number;
    teacherCommissionType?: string;
    teacherCommissionValue?: number;
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
        category_id = ?, calendar_id = ?, code = ?, name = ?, name_en = ?, description = ?, short_description = ?, branch_ids = ?, description_en = ?,
        age_min = ?, age_max = ?, duration = ?, original_price = ?, premium_price = ?, coupon_count = ?,
        achievement_skills_json = ?, metrics_json = ?, coupon_requirements_json = ?,
        duration_little_junior = ?, coupon_little_junior = ?,
        original_price_little_junior = ?, premium_price_little_junior = ?,
        duration_junior = ?, coupon_junior = ?,
        original_price_junior = ?, premium_price_junior = ?,
        achievement_skills_little_junior_json = ?, metrics_little_junior_json = ?,
        achievement_skills_junior_json = ?, metrics_junior_json = ?,
        thumbnail_url = ?, detail_poster_url = ?, images_json = ?, video_url = ?, teacher_guide_url = ?,
        is_recommended = ?, is_extraclass = ?, is_event = ?, is_service = ?, allow_repeat = ?, registration_form_id = ?,
        short_description_en = ?, location = ?, location_link = ?,
        stamps_on_completion = ?, stamp_expiry_months = ?,
        sales_commission_type = ?, sales_commission_value = ?,
        teacher_commission_type = ?, teacher_commission_value = ?
      WHERE id = ?
    `).bind(
      data.categoryId, data.calendarId ?? null, data.code ?? null, data.name, data.nameEn ?? null,
      data.description ?? null, data.shortDescription ?? null, data.branchIds ?? '[]', data.descriptionEn ?? null,
      data.ageMin ?? 3, data.ageMax ?? 9,
      dur, p, v, c, skills, metrics, couponReqs,
      dur, c, p, v,
      dur, c, p, v,
      skills, metrics, skills, metrics,
      data.thumbnailUrl ?? null, data.detailPosterUrl ?? null, data.imagesJson ?? null,
      data.videoUrl ?? null, data.teacherGuideUrl ?? null,
      data.isRecommended ? 1 : 0,
      data.isExtraclass ? 1 : 0,
      data.isEvent ? 1 : 0,
      data.isService ? 1 : 0,
      data.allowRepeat === false ? 0 : 1,
      data.registrationFormId || null,
      data.shortDescriptionEn ?? null, data.location ?? null, data.location_link ?? null,
      data.stampsOnCompletion ?? 0, data.stampExpiryMonths ?? 12,
      data.salesCommissionType ?? null, data.salesCommissionValue ?? null,
      data.teacherCommissionType ?? null, data.teacherCommissionValue ?? null,
      id
    ).run();
  }

  async deleteCourse(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Daily_Courses WHERE course_id = ?').bind(id).run();
    await this.db.prepare('DELETE FROM Bookings WHERE course_id = ?').bind(id).run();
    await this.db.prepare('DELETE FROM Courses WHERE id = ?').bind(id).run();
  }

  // --- Category CRUD ---
  async createCategory(name: string, description: string = '', color?: string, imageUrl?: string, imagePosition?: string, type?: string): Promise<number> {
    const result = await this.db.prepare(
      'INSERT INTO Course_Categories (name, description, color, image_url, image_position, type) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(name, description || '', color || null, imageUrl || null, imagePosition || '50% 50%', type || 'class').run();
    return result.meta.last_row_id;
  }

  async updateCategory(id: number, name: string, description: string = '', color?: string, imageUrl?: string, imagePosition?: string, type?: string): Promise<void> {
    await this.db.prepare(
      'UPDATE Course_Categories SET name = ?, description = ?, color = ?, image_url = ?, image_position = ?, type = ? WHERE id = ?'
    ).bind(name, description || '', color || null, imageUrl || null, imagePosition || '50% 50%', type || 'class', id).run();
  }

  async deleteCategory(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Course_Categories WHERE id = ?').bind(id).run();
  }

  // --- Skills Library CRUD ---
  async getSkillsLibrary(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Skills_Library ORDER BY type ASC, name ASC').all();
    return results;
  }

  async createSkill(name: string, type: string, icon: string, color?: string, nameEn?: string): Promise<number> {
    const result = await this.db.prepare(
      'INSERT INTO Skills_Library (name, name_en, type, icon, color) VALUES (?, ?, ?, ?, ?)'
    ).bind(name, nameEn || null, type, icon, color || null).run();
    return result.meta.last_row_id;
  }

  async updateSkill(id: number, name: string, type: string, icon: string, color?: string, nameEn?: string): Promise<void> {
    await this.db.prepare(
      'UPDATE Skills_Library SET name = ?, name_en = ?, type = ?, icon = ?, color = ? WHERE id = ?'
    ).bind(name, nameEn || null, type, icon, color || null, id).run();
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
        branch_id, date, label, start_time, end_time, capacity
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      data.branchId, data.date, data.label, data.startTime, data.endTime, data.capacity ?? 20
    ).run();
    return result.meta.last_row_id;
  }

  async updateTimeSlot(id: number, data: any): Promise<void> {
    await this.db.prepare(`
      UPDATE Time_Slots SET 
        branch_id = ?, date = ?, label = ?, start_time = ?, end_time = ?, capacity = ?
      WHERE id = ?
    `).bind(
      data.branchId, data.date, data.label, data.startTime, data.endTime, data.capacity ?? 20,
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
    const facilitator = await this.db.prepare('SELECT id FROM CRM_Users WHERE email=?').bind(email).first() as any;
    if (!facilitator) return [];
    const { results } = await this.db.prepare(`
      SELECT
        b.id, b.scheduled_at, b.status, b.slot_date, b.slot_start_time, b.payment_status,
        COALESCE(hp.name, '(ลูกค้าทั่วไป)') as child_name,
        co.name as course_name,
        br.name as branch_name
      FROM Bookings b
      LEFT JOIN Children ch ON b.child_id = ch.id AND b.child_id != 0
      LEFT JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
      JOIN Courses co ON b.course_id = co.id
      JOIN Branches br ON b.branch_id = br.id
      WHERE b.teaching_staff_id = ?
      ORDER BY b.scheduled_at DESC
      LIMIT 200
    `).bind(facilitator.id).all();
    return results;
  }

  async deleteBooking(id: number): Promise<void> {
    // Four tables FK-reference Bookings, so the plain DELETE below fails
    // with SQLITE_CONSTRAINT_FOREIGNKEY the moment any of them has a row for
    // this booking. Stamps/Child_Journey/Course_Reviews are the child's real
    // history (an earned stamp, a teacher's milestone note, a left review) —
    // that's worth keeping even once the booking itself is gone, so their
    // booking_id is just cleared (all three columns are nullable). A stock
    // reservation has no meaning without its booking (booking_id is NOT
    // NULL there), so those rows are deleted outright. All in one batch()
    // so a mid-way failure can't leave the booking half-detached.
    await this.db.batch([
      this.db.prepare('UPDATE Stamps SET booking_id = NULL WHERE booking_id = ?').bind(id),
      this.db.prepare('UPDATE Child_Journey SET booking_id = NULL WHERE booking_id = ?').bind(id),
      this.db.prepare('UPDATE Course_Reviews SET booking_id = NULL WHERE booking_id = ?').bind(id),
      this.db.prepare('DELETE FROM Stock_Reservations WHERE booking_id = ?').bind(id),
      this.db.prepare('DELETE FROM Bookings WHERE id = ?').bind(id),
    ]);
  }
}

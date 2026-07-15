export class HRRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  // ── Packages ───────────────────────────────────────────────────────────────
  async getPackages(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Packages ORDER BY created_at DESC').all();
    return results.map((p: any) => ({ ...p, coupons: JSON.parse(p.coupons_json || '[]') }));
  }
  async createPackage(d: any): Promise<number> {
    const r = await this.db.prepare(`
      INSERT INTO Packages (name, description, price, coupons_json, premium_days, seller_commission_type, seller_commission_value, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(d.name, d.description ?? null, d.price, JSON.stringify(d.coupons ?? []),
            d.premiumDays ?? 0, d.sellerCommission?.type ?? 'percent',
            parseFloat(d.sellerCommission?.value ?? 0), d.active ? 1 : 0).run();
    return r.meta.last_row_id as number;
  }
  async updatePackage(id: number, d: any): Promise<void> {
    await this.db.prepare(`
      UPDATE Packages SET name=?, description=?, price=?, coupons_json=?, premium_days=?, seller_commission_type=?, seller_commission_value=?, active=?
      WHERE id=?
    `).bind(d.name, d.description ?? null, d.price, JSON.stringify(d.coupons ?? []),
            d.premiumDays ?? 0, d.sellerCommission?.type ?? 'percent',
            parseFloat(d.sellerCommission?.value ?? 0), d.active ? 1 : 0, id).run();
  }
  async deletePackage(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Packages WHERE id=?').bind(id).run();
  }

  // ── Package Purchases (consumer self-service, paid via Beam) ───────────────
  async getActivePackages(): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT id, name, description, price, coupons_json FROM Packages WHERE active = 1 ORDER BY price ASC'
    ).all();
    return results.map((p: any) => ({ ...p, coupons: JSON.parse(p.coupons_json || '[]') }));
  }

  async getPackageById(id: number): Promise<any | null> {
    return await this.db.prepare('SELECT * FROM Packages WHERE id = ?').bind(id).first();
  }

  async createPackagePurchase(data: { packageId: number; childId: number; userId?: number; amount: number }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Package_Purchases (package_id, child_id, user_id, amount) VALUES (?, ?, ?, ?)
    `).bind(data.packageId, data.childId, data.userId ?? null, data.amount).run();
    return result.meta.last_row_id as number;
  }

  async setPackagePurchaseBeamSession(id: number, beamSessionId: string): Promise<void> {
    await this.db.prepare('UPDATE Package_Purchases SET beam_session_id = ? WHERE id = ?').bind(beamSessionId, id).run();
  }

  async getPackagePurchase(id: number): Promise<any | null> {
    return await this.db.prepare('SELECT * FROM Package_Purchases WHERE id = ?').bind(id).first();
  }

  // Credits one ChildCoupons row per entry in the package's coupons_json —
  // shared by the free-package fast path and the Beam webhook.
  async creditPackageCoupons(pkg: any, childId: number): Promise<void> {
    const coupons: { typeId: string; quantity: number }[] = JSON.parse(pkg.coupons_json || '[]');
    const stmts = coupons.filter(c => c.quantity > 0).map(coupon =>
      this.db.prepare(`
        INSERT INTO ChildCoupons (child_id, coupon_type_id, balance, total_earned)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(child_id, coupon_type_id) DO UPDATE SET
          balance = balance + excluded.balance,
          total_earned = total_earned + excluded.balance,
          updated_at = CURRENT_TIMESTAMP
      `).bind(childId, parseInt(coupon.typeId), coupon.quantity, coupon.quantity)
    );
    if (stmts.length > 0) await this.db.batch(stmts);
  }

  // ── Campaign Bonuses ───────────────────────────────────────────────────────
  async getCampaigns(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Campaign_Bonuses ORDER BY year DESC, month DESC, created_at DESC').all();
    return results.map((c: any) => ({ ...c, forRoles: JSON.parse(c.for_roles_json || '[]') }));
  }
  async createCampaign(d: any): Promise<number> {
    const r = await this.db.prepare(`
      INSERT INTO Campaign_Bonuses (name, description, type, target_value, bonus_type, bonus_value, month, year, for_roles_json, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(d.name, d.description ?? null, d.type, d.targetValue, d.bonusType, d.bonusValue,
            d.month, d.year, JSON.stringify(d.forRoles ?? []), d.status ?? 'active').run();
    return r.meta.last_row_id as number;
  }
  async updateCampaign(id: number, d: any): Promise<void> {
    await this.db.prepare(`
      UPDATE Campaign_Bonuses SET name=?, description=?, type=?, target_value=?, bonus_type=?, bonus_value=?, month=?, year=?, for_roles_json=?, status=?
      WHERE id=?
    `).bind(d.name, d.description ?? null, d.type, d.targetValue, d.bonusType, d.bonusValue,
            d.month, d.year, JSON.stringify(d.forRoles ?? []), d.status ?? 'active', id).run();
  }
  async deleteCampaign(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Campaign_Bonuses WHERE id=?').bind(id).run();
  }

  // ── Diligence Rules ────────────────────────────────────────────────────────
  async getDiligenceRules(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Diligence_Rules ORDER BY created_at DESC').all();
    return results.map((r: any) => ({
      ...r, conditions: JSON.parse(r.conditions_json || '[]'), forRoles: JSON.parse(r.for_roles_json || '[]'),
    }));
  }
  async createDiligenceRule(d: any): Promise<number> {
    const r = await this.db.prepare(`
      INSERT INTO Diligence_Rules (name, description, conditions_json, bonus_amount, for_roles_json, active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(d.name, d.description ?? null, JSON.stringify(d.conditions ?? []),
            d.bonusAmount, JSON.stringify(d.forRoles ?? []), d.active ? 1 : 0).run();
    return r.meta.last_row_id as number;
  }
  async updateDiligenceRule(id: number, d: any): Promise<void> {
    await this.db.prepare(`
      UPDATE Diligence_Rules SET name=?, description=?, conditions_json=?, bonus_amount=?, for_roles_json=?, active=?
      WHERE id=?
    `).bind(d.name, d.description ?? null, JSON.stringify(d.conditions ?? []),
            d.bonusAmount, JSON.stringify(d.forRoles ?? []), d.active ? 1 : 0, id).run();
  }
  async deleteDiligenceRule(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Diligence_Rules WHERE id=?').bind(id).run();
  }

  // ── Attendance ─────────────────────────────────────────────────────────────
  async getAttendance(crmUserId?: number, year?: number, month?: number): Promise<any[]> {
    let sql = 'SELECT * FROM Attendance_Records WHERE 1=1';
    const params: any[] = [];
    if (crmUserId) { sql += ' AND crm_user_id=?'; params.push(crmUserId); }
    if (year && month) {
      const start = `${year}-${String(month).padStart(2,'0')}-01`;
      const end   = `${year}-${String(month).padStart(2,'0')}-31`;
      sql += ' AND date>=? AND date<=?'; params.push(start, end);
    }
    sql += ' ORDER BY date DESC';
    const stmt = this.db.prepare(sql);
    const { results } = await stmt.bind(...params).all();
    return results;
  }
  async upsertAttendance(d: { crmUserId: number; date: string; checkIn?: string; checkOut?: string; note?: string }): Promise<void> {
    await this.db.prepare(`
      INSERT INTO Attendance_Records (crm_user_id, date, check_in, check_out, note)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(crm_user_id, date) DO UPDATE SET
        check_in  = excluded.check_in,
        check_out = excluded.check_out,
        note      = excluded.note
    `).bind(d.crmUserId, d.date, d.checkIn ?? null, d.checkOut ?? null, d.note ?? null).run();
  }
  async deleteAttendance(crmUserId: number, date: string): Promise<void> {
    await this.db.prepare('DELETE FROM Attendance_Records WHERE crm_user_id=? AND date=?').bind(crmUserId, date).run();
  }

  // Supporting data for a human diligence-bonus decision (not an automatic
  // pass/fail) — days worked, and which days were late/left early, each with
  // the reason recorded in Attendance_Records.note. Pay period follows the
  // 26th-of-prior-month → 25th-of-this-month convention used elsewhere
  // (IncentiveTracking.tsx). Freelance staff have no fixed work_start/end_time
  // to compare against, so late/early are left empty and only the raw log +
  // day count are returned — the admin reviews it directly instead.
  async getAttendanceSummary(crmUserId: number, month: number, year: number): Promise<any> {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const start = `${prevYear}-${String(prevMonth).padStart(2, '0')}-26`;
    const end = `${year}-${String(month).padStart(2, '0')}-25`;

    const staff = await this.db.prepare(
      'SELECT employment_type, work_start_time, work_end_time FROM CRM_Users WHERE id=?'
    ).bind(crmUserId).first<any>();

    const { results: records } = await this.db.prepare(`
      SELECT date, check_in, check_out, note FROM Attendance_Records
      WHERE crm_user_id=? AND date >= ? AND date <= ?
      ORDER BY date ASC
    `).bind(crmUserId, start, end).all();

    const isFreelance = staff?.employment_type === 'freelance';
    const daysWorked = (records as any[]).filter(r => r.check_in).length;

    const lateEntries: any[] = [];
    const earlyLeaveEntries: any[] = [];
    if (!isFreelance) {
      for (const r of records as any[]) {
        if (staff?.work_start_time && r.check_in && r.check_in > staff.work_start_time) {
          lateEntries.push({ date: r.date, checkIn: r.check_in, scheduled: staff.work_start_time, note: r.note });
        }
        if (staff?.work_end_time && r.check_out && r.check_out < staff.work_end_time) {
          earlyLeaveEntries.push({ date: r.date, checkOut: r.check_out, scheduled: staff.work_end_time, note: r.note });
        }
      }
    }

    return {
      periodStart: start,
      periodEnd: end,
      isFreelance,
      daysWorked,
      lateEntries,
      earlyLeaveEntries,
      records,
    };
  }

  // ── Leave Requests ─────────────────────────────────────────────────────────
  async getLeaveRequests(crmUserId?: number): Promise<any[]> {
    let sql = `SELECT lr.*, cu.full_name AS staff_name, cu.role AS staff_role
               FROM Leave_Requests lr
               JOIN CRM_Users cu ON lr.crm_user_id = cu.id
               WHERE 1=1`;
    const params: any[] = [];
    if (crmUserId) { sql += ' AND lr.crm_user_id=?'; params.push(crmUserId); }
    sql += ' ORDER BY lr.created_at DESC';
    const { results } = await this.db.prepare(sql).bind(...params).all();
    return results;
  }
  async createLeaveRequest(d: any): Promise<number> {
    const r = await this.db.prepare(`
      INSERT INTO Leave_Requests (crm_user_id, type, start_date, end_date, days, reason, is_paid)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(d.crmUserId, d.type, d.startDate, d.endDate, d.days, d.reason ?? null, d.isPaid ? 1 : 0).run();
    return r.meta.last_row_id as number;
  }
  async updateLeaveStatus(id: number, status: string, approverNote?: string): Promise<void> {
    await this.db.prepare('UPDATE Leave_Requests SET status=?, approver_note=? WHERE id=?')
      .bind(status, approverNote ?? null, id).run();
  }

  // ── Expense Advances ───────────────────────────────────────────────────────
  async getExpenseAdvances(crmUserId?: number): Promise<any[]> {
    let sql = `SELECT ea.*, cu.full_name AS submitted_by
               FROM Expense_Advances ea
               JOIN CRM_Users cu ON ea.crm_user_id = cu.id
               WHERE 1=1`;
    const params: any[] = [];
    if (crmUserId) { sql += ' AND ea.crm_user_id=?'; params.push(crmUserId); }
    sql += ' ORDER BY ea.created_at DESC';
    const { results } = await this.db.prepare(sql).bind(...params).all();
    return results;
  }
  async createExpenseAdvance(d: any): Promise<number> {
    const r = await this.db.prepare(`
      INSERT INTO Expense_Advances (crm_user_id, date, amount, category, description)
      VALUES (?, ?, ?, ?, ?)
    `).bind(d.crmUserId, d.date, d.amount, d.category, d.description).run();
    return r.meta.last_row_id as number;
  }
  async updateExpenseStatus(id: number, status: string, note?: string): Promise<void> {
    await this.db.prepare('UPDATE Expense_Advances SET status=?, note=? WHERE id=?')
      .bind(status, note ?? null, id).run();
  }

  // ── Payouts ────────────────────────────────────────────────────────────────
  async getPayouts(period?: string): Promise<any[]> {
    let sql = `SELECT p.*, cu.full_name AS staff_name, cu.role AS staff_role
               FROM Payouts p
               JOIN CRM_Users cu ON p.crm_user_id = cu.id
               WHERE 1=1`;
    const params: any[] = [];
    if (period) { sql += ' AND p.period=?'; params.push(period); }
    sql += ' ORDER BY p.created_at DESC';
    const { results } = await this.db.prepare(sql).bind(...params).all();
    return results;
  }
  async createPayout(d: any): Promise<number> {
    const total = (d.incentive ?? 0) + (d.otHours ?? 0) * (d.otRate ?? 150) + (d.expense ?? 0);
    const r = await this.db.prepare(`
      INSERT INTO Payouts (crm_user_id, period, incentive, ot_hours, ot_rate, expense, total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(d.crmUserId, d.period, d.incentive ?? 0, d.otHours ?? 0, d.otRate ?? 150, d.expense ?? 0, total).run();
    return r.meta.last_row_id as number;
  }
  async markPayoutPaid(id: number): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    await this.db.prepare('UPDATE Payouts SET status=?, paid_at=? WHERE id=?')
      .bind('paid', today, id).run();
  }
  async generatePayout(crmUserId: number, period: string, month: number, year: number): Promise<number> {
    const dateStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const dateEnd   = `${year}-${String(month).padStart(2, '0')}-31`;

    // ค่าปฏิบัติงาน (สอน): transactions where this staff was teaching — uses
    // the course's own teacher_commission_type/value (CourseManagement.tsx)
    // when set, otherwise falls back to the global operational_fee_type/value
    // setting (the only rate that existed before per-course rates existed).
    const { results: teachTx } = await this.db.prepare(`
      SELECT t.amount, c.teacher_commission_type, c.teacher_commission_value
      FROM Transactions t LEFT JOIN Courses c ON t.course_id = c.id
      WHERE t.teaching_staff_id=? AND DATE(t.created_at) BETWEEN ? AND ?
        AND t.type IN ('guest_sale','class_booking')
    `).bind(crmUserId, dateStart, dateEnd).all();

    const feeSetting = await this.db.prepare("SELECT key, value FROM System_Settings WHERE key IN ('operational_fee_type','operational_fee_value')").all();
    const feeMap: Record<string, string> = {};
    for (const r of feeSetting.results as any[]) feeMap[r.key] = r.value;
    const defaultFeeType = feeMap['operational_fee_type'] ?? 'percent';
    const defaultFeeValue = parseFloat(feeMap['operational_fee_value'] ?? '10');

    let incentive = 0;
    for (const tx of teachTx as any[]) {
      const feeType = tx.teacher_commission_type ?? defaultFeeType;
      const feeValue = tx.teacher_commission_value != null ? parseFloat(tx.teacher_commission_value) : defaultFeeValue;
      incentive += feeType === 'percent' ? (tx.amount * feeValue) / 100 : feeValue;
    }

    // ค่าคอมมิชชันขาย (จองคลาส): เฉพาะคลาสที่ตั้ง sales_commission ไว้ใน
    // CourseManagement.tsx เท่านั้น — ไม่มีอัตรากลาง fallback เหมือนฝั่งสอน
    // เพราะก่อนหน้านี้ไม่เคยมีคอมมิชชันขายสำหรับการจองคลาสเลย
    const { results: classSaleTx } = await this.db.prepare(`
      SELECT t.amount, c.sales_commission_type, c.sales_commission_value
      FROM Transactions t JOIN Courses c ON t.course_id = c.id
      WHERE t.sales_staff_id=? AND DATE(t.created_at) BETWEEN ? AND ?
        AND t.type IN ('guest_sale','class_booking')
        AND c.sales_commission_type IS NOT NULL
    `).bind(crmUserId, dateStart, dateEnd).all();

    for (const tx of classSaleTx as any[]) {
      const v = parseFloat(tx.sales_commission_value ?? 0);
      incentive += tx.sales_commission_type === 'percent' ? (tx.amount * v) / 100 : v;
    }

    // Package commission
    const { results: pkgTx } = await this.db.prepare(`
      SELECT t.amount, p.seller_commission_type, p.seller_commission_value
      FROM Transactions t JOIN Packages p ON t.package_id=p.id
      WHERE t.sales_staff_id=? AND t.type='package_sale' AND DATE(t.created_at) BETWEEN ? AND ?
    `).bind(crmUserId, dateStart, dateEnd).all();

    for (const tx of pkgTx as any[]) {
      const v = parseFloat(tx.seller_commission_value ?? 0);
      incentive += tx.seller_commission_type === 'percent' ? (tx.amount * v) / 100 : v;
    }

    // Service commission
    const { results: svcTx } = await this.db.prepare(`
      SELECT t.amount, s.commission_type, s.commission_value
      FROM Transactions t JOIN Services s ON t.service_id=s.id
      WHERE t.sales_staff_id=? AND t.type='service_sale' AND DATE(t.created_at) BETWEEN ? AND ?
    `).bind(crmUserId, dateStart, dateEnd).all();

    for (const tx of svcTx as any[]) {
      const v = parseFloat(tx.commission_value ?? 0);
      incentive += tx.commission_type === 'percent' ? (tx.amount * v) / 100 : v;
    }

    // Approved expense advances
    const expRow = await this.db.prepare(`
      SELECT COALESCE(SUM(amount),0) AS total FROM Expense_Advances
      WHERE crm_user_id=? AND status='approved' AND date BETWEEN ? AND ?
    `).bind(crmUserId, dateStart, dateEnd).first() as any;
    const expense = expRow?.total ?? 0;

    const total = Math.round(incentive + expense);

    const existing = await this.db.prepare('SELECT id FROM Payouts WHERE crm_user_id=? AND period=?').bind(crmUserId, period).first() as any;
    if (existing) {
      await this.db.prepare('UPDATE Payouts SET incentive=?, expense=?, total=?, status=? WHERE id=?')
        .bind(Math.round(incentive), expense, total, 'pending', existing.id).run();
      return existing.id;
    }
    const r = await this.db.prepare(`
      INSERT INTO Payouts (crm_user_id, period, incentive, ot_hours, ot_rate, expense, total)
      VALUES (?, ?, ?, 0, 0, ?, ?)
    `).bind(crmUserId, period, Math.round(incentive), expense, total).run();
    return r.meta.last_row_id as number;
  }

  // Real (non-mock) replacement for the CRM's IncentiveTracking.tsx page,
  // which used to render hardcoded MOCK_INCOME/MOCK_CAMPAIGNS data. Sourced
  // from the same Payouts/Campaign_Bonuses/Transactions tables the rest of
  // the HR module already writes to.
  async getMyIncentiveSummary(crmUserId: number, month: number, year: number): Promise<any> {
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const dateStart = `${period}-01`;
    const dateEnd = `${period}-31`;

    const staff = await this.db.prepare(
      'SELECT salary, employment_type, role FROM CRM_Users WHERE id=?'
    ).bind(crmUserId).first<any>();

    const payout = await this.db.prepare(
      'SELECT * FROM Payouts WHERE crm_user_id=? AND period=?'
    ).bind(crmUserId, period).first<any>();

    const { results: campaignsRaw } = await this.db.prepare(
      `SELECT * FROM Campaign_Bonuses WHERE month=? AND year=? AND status='active'`
    ).bind(month, year).all();

    const campaigns = [];
    for (const camp of campaignsRaw as any[]) {
      const roles: string[] = JSON.parse(camp.for_roles_json || '[]');
      if (roles.length > 0 && staff?.role && !roles.includes(staff.role)) continue;

      let progress = 0;
      if (camp.type === 'sales') {
        const row = await this.db.prepare(`
          SELECT COALESCE(SUM(amount), 0) AS total FROM Transactions
          WHERE sales_staff_id = ? AND type IN ('package_sale','service_sale','guest_sale','class_booking')
            AND DATE(created_at) BETWEEN ? AND ?
        `).bind(crmUserId, dateStart, dateEnd).first<any>();
        progress = row?.total ?? 0;
      } else if (camp.type === 'teaching_hours') {
        // No real session-duration tracking exists — each taught class
        // transaction is counted as one unit (an approximation, not hours).
        const row = await this.db.prepare(`
          SELECT COUNT(*) AS cnt FROM Transactions
          WHERE teaching_staff_id = ? AND type IN ('guest_sale','class_booking')
            AND DATE(created_at) BETWEEN ? AND ?
        `).bind(crmUserId, dateStart, dateEnd).first<any>();
        progress = row?.cnt ?? 0;
      }
      campaigns.push({ ...camp, progress });
    }

    return { staff, payout, campaigns };
  }

  // ── Leave Policies ─────────────────────────────────────────────────────────
  async getLeavePolicies(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Leave_Policies ORDER BY employee_type').all();
    return results;
  }
  async upsertLeavePolicy(employeeType: string, annualDays: number, sickDays: number, personalDays: number): Promise<void> {
    await this.db.prepare(`
      INSERT INTO Leave_Policies (employee_type, annual_days, sick_days, personal_days, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(employee_type) DO UPDATE SET
        annual_days=excluded.annual_days, sick_days=excluded.sick_days,
        personal_days=excluded.personal_days, updated_at=CURRENT_TIMESTAMP
    `).bind(employeeType, annualDays, sickDays, personalDays).run();
  }
}

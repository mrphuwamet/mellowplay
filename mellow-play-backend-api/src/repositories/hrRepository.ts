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

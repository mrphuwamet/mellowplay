export class ReportRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  // ── Transaction History ────────────────────────────────────────────────────
  async getTransactions(opts: {
    startDate?: string; endDate?: string;
    type?: string; branchId?: number; limit?: number; offset?: number;
  }): Promise<{ rows: any[]; total: number }> {
    const { startDate, endDate, type, branchId, limit = 100, offset = 0 } = opts;
    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (startDate) { where += ' AND DATE(t.created_at)>=?'; params.push(startDate); }
    if (endDate)   { where += ' AND DATE(t.created_at)<=?'; params.push(endDate); }
    if (type)      { where += ' AND t.type=?';              params.push(type); }
    if (branchId)  { where += ' AND t.branch_id=?';         params.push(branchId); }

    const countSql = `SELECT COUNT(*) as cnt FROM Transactions t ${where}`;
    const countRow = await this.db.prepare(countSql).bind(...params).first() as any;

    const sql = `
      SELECT t.*,
        b.name  AS branch_name,
        cu.full_name AS staff_name,
        c.name  AS course_name,
        p.name  AS package_name
      FROM Transactions t
      LEFT JOIN Branches b   ON t.branch_id = b.id
      LEFT JOIN CRM_Users cu ON t.sales_staff_id = cu.id
      LEFT JOIN Courses c    ON t.course_id = c.id
      LEFT JOIN Packages p   ON t.package_id = p.id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const { results } = await this.db.prepare(sql).bind(...params, limit, offset).all();
    return { rows: results, total: countRow?.cnt ?? 0 };
  }

  // ── Daily Sales Summary ────────────────────────────────────────────────────
  async getDailySales(startDate: string, endDate: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT DATE(created_at) AS date,
        COUNT(*) AS count,
        SUM(amount) AS revenue,
        SUM(CASE WHEN type='package_sale' THEN amount ELSE 0 END) AS package_revenue,
        SUM(CASE WHEN type IN ('guest_sale','class_booking') THEN amount ELSE 0 END) AS class_revenue,
        SUM(CASE WHEN type='service_sale' THEN amount ELSE 0 END) AS service_revenue
      FROM Transactions
      WHERE DATE(created_at) BETWEEN ? AND ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).bind(startDate, endDate).all();
    return results;
  }

  // ── Monthly Summary ────────────────────────────────────────────────────────
  async getMonthlySales(year: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT strftime('%m', created_at) AS month,
        COUNT(*) AS count,
        SUM(amount) AS revenue
      FROM Transactions
      WHERE strftime('%Y', created_at) = ?
      GROUP BY strftime('%m', created_at)
      ORDER BY month ASC
    `).bind(String(year)).all();
    return results;
  }

  // ── Best-selling Services / Products ──────────────────────────────────────
  async getBestSellers(startDate: string, endDate: string): Promise<{ services: any[]; packages: any[] }> {
    const { results: services } = await this.db.prepare(`
      SELECT s.name, COUNT(*) AS count, SUM(t.amount) AS revenue
      FROM Transactions t
      JOIN Services s ON t.service_id = s.id
      WHERE DATE(t.created_at) BETWEEN ? AND ?
      GROUP BY t.service_id
      ORDER BY count DESC LIMIT 10
    `).bind(startDate, endDate).all();

    const { results: packages } = await this.db.prepare(`
      SELECT p.name, COUNT(*) AS count, SUM(t.amount) AS revenue
      FROM Transactions t
      JOIN Packages p ON t.package_id = p.id
      WHERE DATE(t.created_at) BETWEEN ? AND ?
      GROUP BY t.package_id
      ORDER BY count DESC LIMIT 10
    `).bind(startDate, endDate).all();

    return { services, packages };
  }

  // ── Busiest Days (booking count per weekday) ───────────────────────────────
  async getBusiestDays(startDate: string, endDate: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT strftime('%w', scheduled_at) AS dow,
        COUNT(*) AS bookings
      FROM Bookings
      WHERE DATE(scheduled_at) BETWEEN ? AND ?
        AND status NOT IN ('cancelled')
      GROUP BY dow
      ORDER BY bookings DESC
    `).bind(startDate, endDate).all();
    return results;
  }

  // ── Summary KPIs ────────────────────────────────────────────────────────────
  async getSummaryKPIs(startDate: string, endDate: string): Promise<any> {
    const revenue = await this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS tx_count
      FROM Transactions
      WHERE DATE(created_at) BETWEEN ? AND ?
    `).bind(startDate, endDate).first() as any;

    const bookings = await this.db.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled
      FROM Bookings
      WHERE DATE(scheduled_at) BETWEEN ? AND ?
    `).bind(startDate, endDate).first() as any;

    return {
      revenue: revenue?.total ?? 0,
      txCount: revenue?.tx_count ?? 0,
      bookings: bookings?.total ?? 0,
      completedBookings: bookings?.completed ?? 0,
      cancelledBookings: bookings?.cancelled ?? 0,
    };
  }
}

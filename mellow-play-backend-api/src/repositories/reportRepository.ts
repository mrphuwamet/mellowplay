export class ReportRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  // ── Transaction History ────────────────────────────────────────────────────
  async getTransactions(opts: {
    startDate?: string; endDate?: string;
    type?: string; branchId?: number; search?: string; limit?: number; offset?: number;
    /** Money only. See the clause below for why this is the default. */
    moneyOnly?: boolean;
  }): Promise<{ rows: any[]; total: number }> {
    const { startDate, endDate, type, branchId, search, limit = 100, offset = 0, moneyOnly = true } = opts;
    let where = 'WHERE 1=1';
    // Cancelling a booking that was paid with a coupon writes a refund_booking
    // row for 0 baht: the coupon went back, no money moved. Sixteen of the
    // twenty-one rows on this screen were those, burying the four actual sales
    // under a list of zeroes on a page titled ยอดขายและรายได้.
    if (moneyOnly) where += ' AND COALESCE(t.amount, 0) <> 0';
    const params: any[] = [];
    if (startDate) { where += ' AND DATE(t.created_at)>=?'; params.push(startDate); }
    if (endDate)   { where += ' AND DATE(t.created_at)<=?'; params.push(endDate); }
    if (type)      { where += ' AND t.type=?';              params.push(type); }
    if (branchId)  { where += ' AND t.branch_id=?';         params.push(branchId); }
    if (search) {
      where += ` AND (
        COALESCE(u.display_name, u.first_name || ' ' || u.last_name, '') LIKE ? OR
        c.name LIKE ? OR p.name LIKE ? OR s.name LIKE ? OR CAST(t.id AS TEXT) LIKE ?
      )`;
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }

    const joins = `
      LEFT JOIN Branches b   ON t.branch_id = b.id
      LEFT JOIN CRM_Users cu ON t.sales_staff_id = cu.id
      LEFT JOIN Users u      ON t.user_id = u.id
      LEFT JOIN Courses c    ON t.course_id = c.id
      LEFT JOIN Packages p   ON t.package_id = p.id
      LEFT JOIN Services s   ON t.service_id = s.id
    `;

    const countSql = `SELECT COUNT(*) as cnt FROM Transactions t ${joins} ${where}`;
    const countRow = await this.db.prepare(countSql).bind(...params).first() as any;

    const sql = `
      SELECT t.*,
        b.name  AS branch_name,
        cu.full_name AS staff_name,
        COALESCE(u.display_name, NULLIF(TRIM(u.first_name || ' ' || u.last_name), '')) AS customer_name,
        c.name  AS course_name,
        p.name  AS package_name,
        s.name  AS service_name
      FROM Transactions t
      ${joins}
      ${where}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const { results } = await this.db.prepare(sql).bind(...params, limit, offset).all();
    return { rows: results, total: countRow?.cnt ?? 0 };
  }

  // ── Daily Sales Summary ────────────────────────────────────────────────────
  async getDailySales(startDate: string, endDate: string, branchId?: number): Promise<any[]> {
    // created_at is UTC; shift to Thailand (+7) before bucketing by day so
    // sales between midnight-7am local time count under the right date —
    // same bug/fix as analyticsRepository.getTrends.
    const branchClause = branchId ? ' AND branch_id = ?' : '';
    const params: any[] = [startDate, endDate];
    if (branchId) params.push(branchId);
    const { results } = await this.db.prepare(`
      SELECT DATE(created_at, '+7 hours') AS date,
        COUNT(*) AS count,
        SUM(amount) AS revenue,
        SUM(CASE WHEN type='package_sale' THEN amount ELSE 0 END) AS package_revenue,
        SUM(CASE WHEN type IN ('guest_sale','class_booking') THEN amount ELSE 0 END) AS class_revenue,
        SUM(CASE WHEN type='service_sale' THEN amount ELSE 0 END) AS service_revenue
      FROM Transactions
      WHERE DATE(created_at, '+7 hours') BETWEEN ? AND ? AND is_voided = 0${branchClause}
      GROUP BY DATE(created_at, '+7 hours')
      ORDER BY date ASC
    `).bind(...params).all();
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

  // ── Best-selling Courses / Packages / Services ─────────────────────────────
  async getBestSellers(startDate: string, endDate: string, branchId?: number): Promise<{ services: any[]; packages: any[]; courses: any[] }> {
    const branchClause = branchId ? ' AND t.branch_id = ?' : '';
    const branchParams = branchId ? [branchId] : [];

    const { results: services } = await this.db.prepare(`
      SELECT s.name, COUNT(*) AS count, SUM(t.quantity) AS units_sold, SUM(t.amount) AS revenue
      FROM Transactions t
      JOIN Services s ON t.service_id = s.id
      WHERE DATE(t.created_at, '+7 hours') BETWEEN ? AND ? AND t.is_voided = 0${branchClause}
      GROUP BY t.service_id
      ORDER BY revenue DESC LIMIT 10
    `).bind(startDate, endDate, ...branchParams).all();

    const { results: packages } = await this.db.prepare(`
      SELECT p.name, COUNT(*) AS count, SUM(t.quantity) AS units_sold, SUM(t.amount) AS revenue
      FROM Transactions t
      JOIN Packages p ON t.package_id = p.id
      WHERE DATE(t.created_at, '+7 hours') BETWEEN ? AND ? AND t.is_voided = 0${branchClause}
      GROUP BY t.package_id
      ORDER BY revenue DESC LIMIT 10
    `).bind(startDate, endDate, ...branchParams).all();

    const { results: courses } = await this.db.prepare(`
      SELECT c.name, COUNT(*) AS count, SUM(t.quantity) AS units_sold, SUM(t.amount) AS revenue
      FROM Transactions t
      JOIN Courses c ON t.course_id = c.id
      WHERE DATE(t.created_at, '+7 hours') BETWEEN ? AND ? AND t.is_voided = 0
        AND t.type IN ('guest_sale','class_booking')${branchClause}
      GROUP BY t.course_id
      ORDER BY revenue DESC LIMIT 10
    `).bind(startDate, endDate, ...branchParams).all();

    return { services, packages, courses };
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
  async getSummaryKPIs(startDate: string, endDate: string, branchId?: number): Promise<any> {
    let where = "WHERE DATE(created_at, '+7 hours') BETWEEN ? AND ? AND is_voided = 0";
    const params: any[] = [startDate, endDate];
    if (branchId) { where += ' AND branch_id = ?'; params.push(branchId); }

    const revenue = await this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS tx_count,
        COUNT(DISTINCT user_id) AS unique_customers
      FROM Transactions
      ${where}
    `).bind(...params).first() as any;

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
      uniqueCustomers: revenue?.unique_customers ?? 0,
      bookings: bookings?.total ?? 0,
      completedBookings: bookings?.completed ?? 0,
      cancelledBookings: bookings?.cancelled ?? 0,
    };
  }

  // ── Sponsor/Marketing Tag Attribution ──────────────────────────────────────
  // sponsor_tag is set on Bookings.created_at from a ?tag= URL param the
  // consumer app captured before checkout; NULL covers both "never tagged"
  // and "tag expired before booking" (organic), grouped into one bucket here
  // so staff can see attributed-vs-organic at a glance.
  async getTagAttributionSummary(startDate: string, endDate: string, branchId?: number): Promise<any[]> {
    const branchClause = branchId ? ' AND b.branch_id = ?' : '';
    const params: any[] = [startDate, endDate];
    if (branchId) params.push(branchId);
    const { results } = await this.db.prepare(`
      SELECT
        COALESCE(b.sponsor_tag, '(ไม่มี tag)') AS tag,
        COUNT(*) AS booking_count,
        COUNT(DISTINCT b.child_id) AS unique_children,
        MIN(DATE(b.created_at, '+7 hours')) AS first_seen,
        MAX(DATE(b.created_at, '+7 hours')) AS last_seen
      FROM Bookings b
      WHERE DATE(b.created_at, '+7 hours') BETWEEN ? AND ? AND b.status != 'cancelled'${branchClause}
      GROUP BY COALESCE(b.sponsor_tag, '(ไม่มี tag)')
      ORDER BY booking_count DESC
    `).bind(...params).all();
    return results;
  }

  async getTagAttributionTrend(startDate: string, endDate: string, branchId?: number): Promise<any[]> {
    const branchClause = branchId ? ' AND b.branch_id = ?' : '';
    const params: any[] = [startDate, endDate];
    if (branchId) params.push(branchId);
    const { results } = await this.db.prepare(`
      SELECT
        DATE(b.created_at, '+7 hours') AS date,
        COALESCE(b.sponsor_tag, '(ไม่มี tag)') AS tag,
        COUNT(*) AS booking_count
      FROM Bookings b
      WHERE DATE(b.created_at, '+7 hours') BETWEEN ? AND ? AND b.status != 'cancelled'${branchClause}
      GROUP BY DATE(b.created_at, '+7 hours'), COALESCE(b.sponsor_tag, '(ไม่มี tag)')
      ORDER BY date ASC
    `).bind(...params).all();
    return results;
  }

  // Per tag × activity — lets staff see not just how many signups a tag
  // drove, but which course/event/service they signed up for.
  async getTagAttributionByCourse(startDate: string, endDate: string, branchId?: number): Promise<any[]> {
    const branchClause = branchId ? ' AND b.branch_id = ?' : '';
    const params: any[] = [startDate, endDate];
    if (branchId) params.push(branchId);
    const { results } = await this.db.prepare(`
      SELECT
        COALESCE(b.sponsor_tag, '(ไม่มี tag)') AS tag,
        co.name AS course_name,
        COUNT(*) AS booking_count,
        COUNT(DISTINCT b.child_id) AS unique_children
      FROM Bookings b
      JOIN Courses co ON b.course_id = co.id
      WHERE DATE(b.created_at, '+7 hours') BETWEEN ? AND ? AND b.status != 'cancelled'${branchClause}
      GROUP BY COALESCE(b.sponsor_tag, '(ไม่มี tag)'), co.name
      ORDER BY tag ASC, booking_count DESC
    `).bind(...params).all();
    return results;
  }

  /**
   * The people behind the counts, one row per booking.
   *
   * Same WHERE clause as the summaries above, deliberately — a name list whose
   * total does not match the number on the dashboard above it is worse than no
   * list at all, so the date window, the branch filter and the "not cancelled"
   * rule all have to stay identical.
   *
   * LEFT JOINs on the child/parent side: a guest booking has child_id = 0 and
   * no account behind it, and dropping those rows would quietly under-report
   * exactly the walk-in traffic a campaign tag is measuring.
   */
  async getTagAttributionPeople(startDate: string, endDate: string, branchId?: number): Promise<any[]> {
    const branchClause = branchId ? ' AND b.branch_id = ?' : '';
    const params: any[] = [startDate, endDate];
    if (branchId) params.push(branchId);
    const { results } = await this.db.prepare(`
      SELECT
        COALESCE(b.sponsor_tag, '(ไม่มี tag)') AS tag,
        b.id AS booking_id,
        b.created_at,
        b.scheduled_at,
        b.status,
        co.name AS course_name,
        br.name AS branch_name,
        hp.name AS child_name,
        hp.nickname AS child_nickname,
        (u.first_name || ' ' || u.last_name) AS parent_name,
        u.phone AS parent_phone,
        u.email AS parent_email
      FROM Bookings b
      JOIN Courses co ON b.course_id = co.id
      LEFT JOIN Branches br ON b.branch_id = br.id
      LEFT JOIN Children ch ON b.child_id = ch.id AND b.child_id != 0
      LEFT JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
      LEFT JOIN Users u ON ch.parent_id = u.id
      WHERE DATE(b.created_at, '+7 hours') BETWEEN ? AND ? AND b.status != 'cancelled'${branchClause}
      ORDER BY tag ASC, b.created_at DESC
    `).bind(...params).all();
    return results;
  }
}

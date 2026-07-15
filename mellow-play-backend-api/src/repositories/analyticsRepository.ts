export class AnalyticsRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async getDemographics(): Promise<any> {
    const { results: genderRows } = await this.db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(LOWER(hp.gender)), ''), 'unspecified') as gender, COUNT(*) as count
      FROM Children c
      JOIN HD_Profiles hp ON c.hd_profile_id = hp.id
      GROUP BY gender
    `).all<any>();

    const { results: ageRows } = await this.db.prepare(`
      SELECT
        CAST((julianday('now') - julianday(hp.birth_date)) / 365.25 AS INTEGER) as age
      FROM Children c
      JOIN HD_Profiles hp ON c.hd_profile_id = hp.id
      WHERE hp.birth_date IS NOT NULL
    `).all<any>();

    const buckets = [
      { range: '0-3', min: 0, max: 3, count: 0 },
      { range: '4-6', min: 4, max: 6, count: 0 },
      { range: '7-9', min: 7, max: 9, count: 0 },
      { range: '10-12', min: 10, max: 12, count: 0 },
      { range: '13+', min: 13, max: 999, count: 0 },
    ];
    for (const row of ageRows) {
      const bucket = buckets.find(b => row.age >= b.min && row.age <= b.max);
      if (bucket) bucket.count++;
    }

    return {
      genderCounts: genderRows.map((r: any) => ({ gender: r.gender, count: r.count })),
      ageGroups: buckets.map(b => ({ range: b.range, count: b.count })),
    };
  }

  async getTopClasses(limit: number = 5): Promise<any> {
    const query = (isExtra: number) => this.db.prepare(`
      SELECT co.id as course_id, co.name, COUNT(b.id) as bookings
      FROM Bookings b
      JOIN Courses co ON b.course_id = co.id
      WHERE co.is_extraclass = ? AND b.status != 'cancelled'
      GROUP BY co.id
      ORDER BY bookings DESC
      LIMIT ?
    `).bind(isExtra, limit).all<any>();

    const [{ results: regular }, { results: extra }] = await Promise.all([query(0), query(1)]);
    return { regular, extra };
  }

  async getParentStats(): Promise<any> {
    const totalRow = await this.db.prepare(`SELECT COUNT(*) as total FROM Users`).first<any>();
    const { results: byType } = await this.db.prepare(`
      SELECT COALESCE(NULLIF(TRIM(membership_type), ''), 'standard') as type, COUNT(*) as count
      FROM Users
      GROUP BY type
    `).all<any>();
    return { total: totalRow?.total || 0, byMembershipType: byType };
  }

  async getTrends(range: 'week' | 'month' | 'year'): Promise<any[]> {
    const daysBack = range === 'week' ? 7 : range === 'month' ? 30 : 365;
    const dateFormat = range === 'year' ? '%Y-%m' : '%Y-%m-%d';

    const { results: bookingRows } = await this.db.prepare(`
      SELECT strftime('${dateFormat}', created_at) as period, COUNT(*) as bookings
      FROM Bookings
      WHERE created_at >= datetime('now', '-${daysBack} days') AND status != 'cancelled'
      GROUP BY period
      ORDER BY period ASC
    `).all<any>();

    const { results: revenueRows } = await this.db.prepare(`
      SELECT strftime('${dateFormat}', created_at) as period, SUM(amount) as revenue
      FROM Transactions
      WHERE created_at >= datetime('now', '-${daysBack} days') AND is_voided = 0 AND amount > 0
      GROUP BY period
      ORDER BY period ASC
    `).all<any>();

    const merged = new Map<string, { period: string; bookings: number; revenue: number }>();
    for (const r of bookingRows) merged.set(r.period, { period: r.period, bookings: r.bookings, revenue: 0 });
    for (const r of revenueRows) {
      const existing = merged.get(r.period);
      if (existing) existing.revenue = r.revenue || 0;
      else merged.set(r.period, { period: r.period, bookings: 0, revenue: r.revenue || 0 });
    }
    return Array.from(merged.values()).sort((a, b) => a.period.localeCompare(b.period));
  }

  async getCourseFunnel(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT
        co.id as course_id,
        co.name,
        co.is_extraclass,
        COALESCE(cv.views, 0) as views,
        COUNT(b.id) as bookings,
        SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) as completions,
        COALESCE(rv.avg_rating, 0) as avg_rating,
        COALESCE(rv.review_count, 0) as review_count
      FROM Courses co
      LEFT JOIN Bookings b ON b.course_id = co.id AND b.status != 'cancelled'
      LEFT JOIN (SELECT course_id, COUNT(*) as views FROM Course_Views GROUP BY course_id) cv ON cv.course_id = co.id
      LEFT JOIN (SELECT course_id, AVG(rating) as avg_rating, COUNT(*) as review_count FROM Course_Reviews GROUP BY course_id) rv ON rv.course_id = co.id
      GROUP BY co.id
      ORDER BY bookings DESC
      LIMIT 20
    `).all<any>();
    return results;
  }
}

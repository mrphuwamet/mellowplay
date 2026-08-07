// Shared recipient-resolving join — mirrors adminRepository.getAllBookings,
// but LEFT JOINs Branches (that query's inner join silently drops every
// Extra Class/Event booking, which legitimately has no branch_id) and
// requires a resolvable parent phone, since a guest booking (child_id = 0)
// or a child with no linked account has nobody to text.
const BOOKING_RECIPIENT_SELECT = `
  SELECT
    b.id as booking_id, b.course_id, b.scheduled_at, b.status, b.form_submission_id,
    COALESCE(hp.nickname, hp.name) as child_name,
    hp.name as child_real_name,
    hp.nickname as child_nickname,
    (u.first_name || ' ' || u.last_name) as parent_name,
    (u.first_name || ' ' || u.last_name) as parent_real_name,
    u.nickname as parent_nickname,
    u.id as parent_user_id,
    u.phone as phone,
    co.name as course_name,
    br.name as branch_name
  FROM Bookings b
  JOIN Children ch ON b.child_id = ch.id AND b.child_id != 0
  JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
  JOIN Users u ON ch.parent_id = u.id
  JOIN Courses co ON b.course_id = co.id
  LEFT JOIN Branches br ON b.branch_id = br.id
  WHERE u.phone IS NOT NULL AND b.status != 'cancelled'
`;

export class SmsRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async logSms(entry: {
    bookingId: number; courseId: number | null; type: 'booking_success' | 'reminder';
    phone: string; message: string; status: 'sent' | 'failed';
    providerDetail?: string | null; sentBy?: number | null;
  }): Promise<void> {
    await this.db.prepare(`
      INSERT INTO Sms_Logs (booking_id, course_id, type, phone, message, status, provider_detail, sent_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      entry.bookingId, entry.courseId, entry.type, entry.phone, entry.message,
      entry.status, entry.providerDetail ?? null, entry.sentBy ?? null,
    ).run();
  }

  async getReminderCandidates(filters: {
    courseId?: number; branchId?: number; dateFrom?: string; dateTo?: string; status?: string;
  }): Promise<any[]> {
    let query = BOOKING_RECIPIENT_SELECT;
    const params: any[] = [];
    if (filters.courseId) { query += ` AND b.course_id = ?`; params.push(filters.courseId); }
    if (filters.branchId) { query += ` AND b.branch_id = ?`; params.push(filters.branchId); }
    if (filters.dateFrom) { query += ` AND date(b.scheduled_at) >= ?`; params.push(filters.dateFrom); }
    if (filters.dateTo) { query += ` AND date(b.scheduled_at) <= ?`; params.push(filters.dateTo); }
    if (filters.status) { query += ` AND b.status = ?`; params.push(filters.status); }
    query += ` ORDER BY b.scheduled_at ASC`;
    const stmt = this.db.prepare(query);
    const { results } = await (params.length > 0 ? stmt.bind(...params) : stmt).all();
    return results;
  }

  // A booking qualifies as "unsent" when its course has the automatic SMS
  // turned on but no Sms_Logs row for it ever recorded a successful send —
  // covers both "never attempted" (no row at all) and "attempted and
  // failed" (a row exists, just never one with status='sent').
  async getUnsentConfirmations(filters: {
    courseId?: number; dateFrom?: string; dateTo?: string;
  }): Promise<any[]> {
    let query = BOOKING_RECIPIENT_SELECT + `
      AND co.sms_success_enabled = 1
      AND NOT EXISTS (
        SELECT 1 FROM Sms_Logs sl WHERE sl.booking_id = b.id AND sl.type = 'booking_success' AND sl.status = 'sent'
      )
    `;
    const params: any[] = [];
    if (filters.courseId) { query += ` AND b.course_id = ?`; params.push(filters.courseId); }
    if (filters.dateFrom) { query += ` AND date(b.scheduled_at) >= ?`; params.push(filters.dateFrom); }
    if (filters.dateTo) { query += ` AND date(b.scheduled_at) <= ?`; params.push(filters.dateTo); }
    query += ` ORDER BY b.scheduled_at ASC`;
    const stmt = this.db.prepare(query);
    const { results } = await (params.length > 0 ? stmt.bind(...params) : stmt).all();
    return results;
  }

  // Every registered account (a "member" = any parent who has signed up,
  // not specifically a Premium child) that has never made a booking — any
  // child, any status except cancelled — for this one course/activity.
  // Banned accounts are excluded since there's no point surfacing them for
  // outreach. "วันที่เป็นสมาชิก" is just Users.created_at.
  async getNonRegisteredMembers(courseId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT u.id as user_id, (u.first_name || ' ' || u.last_name) as name, u.phone, u.created_at as member_since
      FROM Users u
      WHERE u.is_banned = 0
        AND NOT EXISTS (
          SELECT 1 FROM Bookings b
          JOIN Children ch ON b.child_id = ch.id
          WHERE ch.parent_id = u.id AND b.course_id = ? AND b.status != 'cancelled'
        )
      ORDER BY u.created_at DESC
    `).bind(courseId).all();
    return results;
  }
}

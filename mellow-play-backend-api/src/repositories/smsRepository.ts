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

  // A course's registration form can ask specifically who is actually
  // attending (e.g. an event that needs a named "ผู้เข้าแข่งขัน (ผู้ปกครอง)"/
  // "(เด็ก)" — see family_member_picker's `config_json.role`), which may
  // well NOT be the account holder — the classic case is two parents on one
  // account where either could be the one showing up. When such a field
  // exists and was actually answered, that's a better default child_name/
  // parent_name than the account's own linked child/parent.
  async getFormPreferredNames(formSubmissionId: number): Promise<{
    child_name?: string; parent_name?: string;
    child_real_name?: string; child_nickname?: string;
    parent_real_name?: string; parent_nickname?: string;
  }> {
    const submission = await this.db.prepare('SELECT form_id, answers_json FROM Form_Submissions WHERE id = ?')
      .bind(formSubmissionId).first<{ form_id: number; answers_json: string }>();
    if (!submission) return {};

    const { results: fields } = await this.db.prepare(
      `SELECT field_key, config_json FROM Registration_Form_Fields WHERE form_id = ? AND type = 'family_member_picker'`
    ).bind(submission.form_id).all<{ field_key: string; config_json: string | null }>();
    if (fields.length === 0) return {};

    let answers: Record<string, any> = {};
    try { answers = JSON.parse(submission.answers_json || '{}'); } catch { /* malformed shouldn't block a send */ }

    const result: {
      child_name?: string; parent_name?: string;
      child_real_name?: string; child_nickname?: string;
      parent_real_name?: string; parent_nickname?: string;
    } = {};
    for (const f of fields) {
      let role: string | undefined;
      try { role = JSON.parse(f.config_json || '{}').role; } catch { /* ignore malformed config */ }
      const value = answers[f.field_key];
      if (value == null || String(value).trim() === '') continue;
      // The consumer app's family_member_picker records these two sibling
      // keys alongside the plain display value (see DynamicRegistrationForm.
      // tsx) — older submissions predating that just won't have them, so
      // real_name/nickname silently stay at whatever the account-based
      // default already resolved to.
      const realName = answers[`${f.field_key}__realname`];
      const nickname = answers[`${f.field_key}__nickname`];
      if (role === 'child') {
        result.child_name = String(value);
        if (realName) result.child_real_name = String(realName);
        if (nickname) result.child_nickname = String(nickname);
      } else if (role === 'adult') {
        result.parent_name = String(value);
        if (realName) result.parent_real_name = String(realName);
        if (nickname) result.parent_nickname = String(nickname);
      }
    }
    return result;
  }

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

// Shared recipient-resolving join — mirrors adminRepository.getAllBookings,
// but LEFT JOINs Branches (that query's inner join silently drops every
// Extra Class/Event booking, which legitimately has no branch_id) and
// requires a resolvable parent phone, since a guest booking (child_id = 0)
// or a child with no linked account has nobody to text.
/**
 * When this booking last had a reminder that actually went out.
 *
 * BOTH channels, for the reason getUnsentConfirmations already learned the hard
 * way: a course set to email-only has no SMS log by design, and asking only the
 * SMS table says nobody has ever been reminded. NULL means never.
 */
const LAST_REMINDER_SQL = `(
  SELECT MAX(sent_at) FROM (
    SELECT MAX(sl.created_at) AS sent_at FROM Sms_Logs sl
     WHERE sl.booking_id = b.id AND sl.type = 'reminder' AND sl.status = 'sent'
    UNION ALL
    SELECT MAX(el.created_at) FROM Email_Logs el
     WHERE el.booking_id = b.id AND el.type = 'reminder' AND el.status = 'sent'
  )
)`;

const BOOKING_RECIPIENT_SELECT = `
  SELECT
    b.id as booking_id, b.course_id, b.scheduled_at, b.status, b.form_submission_id,
    b.slot_date, b.slot_start_time,
    EXISTS (SELECT 1 FROM Booking_Checkin_Log l WHERE l.booking_id = b.id) AS checked_in,
    ${LAST_REMINDER_SQL} AS last_reminder_at,
    (SELECT GROUP_CONCAT(l.label_snapshot, ' · ')
       FROM Booking_Checkin_Log l WHERE l.booking_id = b.id) AS checkin_done_labels,
    COALESCE(hp.nickname, hp.name) as child_name,
    hp.name as child_real_name,
    hp.nickname as child_nickname,
    (u.first_name || ' ' || u.last_name) as parent_name,
    (u.first_name || ' ' || u.last_name) as parent_real_name,
    u.nickname as parent_nickname,
    u.id as parent_user_id,
    u.phone as phone,
    u.email as parent_email,
    co.name as course_name,
    co.location as course_location, co.location_link as course_location_link,
    br.name as branch_name, br.address as branch_address
  FROM Bookings b
  JOIN Children ch ON b.child_id = ch.id AND b.child_id != 0
  JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
  JOIN Users u ON ch.parent_id = u.id
  JOIN Courses co ON b.course_id = co.id
  LEFT JOIN Branches br ON b.branch_id = br.id
  WHERE (u.phone IS NOT NULL OR u.email IS NOT NULL) AND b.status != 'cancelled'
`;

export interface RecipientFilters {
  courseId?: number;
  branchId?: number;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  /** One round, as "slot_date|slot_start_time". Empty halves are meaningful. */
  round?: string;
  /**
   * Check-in state, as one string:
   *
   *   'in'  | 'out'        — any tick at all / none
   *   'done:<actionId>'    — that one step is ticked
   *   'todo:<actionId>'    — that one step is not
   *
   * Both grains exist on purpose. A course with several steps — arrive, then
   * collect a keepsake — has two useful senses of "has not turned up", and the
   * coarse one has to keep working for the courses that define no steps at all.
   */
  attendance?: string;
  /** 'yes' = already reminded, 'no' = never. Undefined leaves it alone. */
  reminded?: 'yes' | 'no';
}

/**
 * The filters the reminder list and the resend list share.
 *
 * One builder rather than two copies. They are the same audience narrowed
 * differently, and a round that means one thing on one tab and something else
 * on the next is exactly the drift this shape prevents.
 */
function recipientFilterSql(filters: RecipientFilters): { sql: string; params: any[] } {
  let sql = '';
  const params: any[] = [];
  if (filters.courseId) { sql += ` AND b.course_id = ?`; params.push(filters.courseId); }
  if (filters.branchId) { sql += ` AND b.branch_id = ?`; params.push(filters.branchId); }
  if (filters.dateFrom) { sql += ` AND date(b.scheduled_at) >= ?`; params.push(filters.dateFrom); }
  if (filters.dateTo) { sql += ` AND date(b.scheduled_at) <= ?`; params.push(filters.dateTo); }
  if (filters.status) { sql += ` AND b.status = ?`; params.push(filters.status); }

  if (filters.round) {
    // A round travels as one "date|time" string, so the dropdown value, the
    // query parameter and this comparison cannot drift apart. Both halves are
    // COALESCEd: an activity with no timetable is a real bucket of bookings,
    // and NULL = NULL would quietly match none of them.
    const [slotDate = '', slotStartTime = ''] = filters.round.split('|');
    sql += ` AND COALESCE(b.slot_date, '') = ? AND COALESCE(b.slot_start_time, '') = ?`;
    params.push(slotDate, slotStartTime);
  }

  if (filters.attendance) {
    // Turned up means a tick exists — the very test the check-in screen uses,
    // so "ยังไม่มา" here and "ยังไม่เช็คอิน" there stay one fact rather than two
    // that can disagree.
    const [kind, rawId] = filters.attendance.split(':');
    const actionId = rawId ? parseInt(rawId, 10) : NaN;

    if (kind === 'in' || kind === 'out') {
      sql += ` AND ${kind === 'out' ? 'NOT ' : ''}EXISTS (
        SELECT 1 FROM Booking_Checkin_Log l WHERE l.booking_id = b.id
      )`;
    } else if ((kind === 'done' || kind === 'todo') && Number.isFinite(actionId)) {
      // The id OR the label, because neither alone is a durable identity here.
      //
      // Saving the check-in steps deletes and reinserts every row (see
      // checkinRepository), so ids churn on an ordinary edit while the logs keep
      // pointing at the old ones — matching on the id alone would report every
      // person as not having done a step they did. label_snapshot survives that,
      // and the id covers the other direction, a step that was renamed.
      sql += ` AND ${kind === 'todo' ? 'NOT ' : ''}EXISTS (
        SELECT 1 FROM Booking_Checkin_Log l
         WHERE l.booking_id = b.id
           AND (l.action_id = ?
                OR l.label_snapshot = (SELECT a.label FROM Course_Checkin_Actions a WHERE a.id = ?))
      )`;
      params.push(actionId, actionId);
    }
  }

  if (filters.reminded === 'yes' || filters.reminded === 'no') {
    // The same expression the row reports, so a chip saying "ยังไม่ได้ส่ง" and a
    // filter for exactly those people can never disagree about one booking.
    sql += ` AND ${LAST_REMINDER_SQL} IS ${filters.reminded === 'yes' ? 'NOT ' : ''}NULL`;
  }

  return { sql, params };
}

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

  async getReminderCandidates(filters: RecipientFilters): Promise<any[]> {
    const { sql, params } = recipientFilterSql(filters);
    let query = BOOKING_RECIPIENT_SELECT + sql;
    query += ` ORDER BY b.scheduled_at ASC`;
    const stmt = this.db.prepare(query);
    const { results } = await (params.length > 0 ? stmt.bind(...params) : stmt).all();
    return results;
  }

  // A booking qualifies as "unsent" when its course is configured to confirm
  // on some channel, and no channel ever succeeded — no successful Sms_Logs row
  // and no successful Email_Logs row. Covers both "never attempted" (no row at
  // all) and "attempted and failed" (rows exist, just never a 'sent' one).
  //
  // Both channels are checked because either can be the one that was turned on:
  // an email-only course has no SMS log by design, and looking only at SMS
  // listed every one of its bookings as unsent forever.
  async getUnsentConfirmations(filters: RecipientFilters): Promise<any[]> {
    let query = BOOKING_RECIPIENT_SELECT + `
      AND (
        co.sms_success_enabled = 1
        OR co.email_success_enabled = 1
        OR (co.confirmation_channel_mode IS NOT NULL AND co.confirmation_channel_mode != 'off')
      )
      AND NOT EXISTS (
        SELECT 1 FROM Sms_Logs sl WHERE sl.booking_id = b.id AND sl.type = 'booking_success' AND sl.status = 'sent'
      )
      AND NOT EXISTS (
        SELECT 1 FROM Email_Logs el WHERE el.booking_id = b.id AND el.type = 'booking_success' AND el.status = 'sent'
      )
    `;
    const { sql, params } = recipientFilterSql(filters);
    query += sql;
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
        AND u.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM Bookings b
          JOIN Children ch ON b.child_id = ch.id
          WHERE ch.parent_id = u.id AND b.course_id = ? AND b.status != 'cancelled'
        )
      ORDER BY u.created_at DESC
    `).bind(courseId).all();
    return results;
  }

  /**
   * The rounds this course has bookings in, with how many people are in each.
   *
   * Counted through the same joins as the recipient list, so the number beside
   * a round is the number of rows that will actually appear when it is picked.
   * A count taken off Bookings alone would include guest bookings and children
   * with no reachable parent, and reading "12 คน" then seeing nine is the kind
   * of small lie that makes staff stop trusting the screen.
   */
  async getRounds(courseId: number): Promise<{
    slot_date: string | null; slot_start_time: string | null;
    booking_count: number; arrived_count: number;
  }[]> {
    const { results } = await this.db.prepare(`
      SELECT b.slot_date, b.slot_start_time,
             COUNT(*) AS booking_count,
             SUM(CASE WHEN EXISTS (
               SELECT 1 FROM Booking_Checkin_Log l WHERE l.booking_id = b.id
             ) THEN 1 ELSE 0 END) AS arrived_count
      FROM Bookings b
      JOIN Children ch ON b.child_id = ch.id AND b.child_id != 0
      JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
      JOIN Users u ON ch.parent_id = u.id
      WHERE b.course_id = ? AND b.status != 'cancelled'
        AND (u.phone IS NOT NULL OR u.email IS NOT NULL)
      GROUP BY b.slot_date, b.slot_start_time
      ORDER BY b.slot_date, b.slot_start_time
    `).bind(courseId).all<any>();
    return results;
  }

  // Backs the CRM send-history view, mirroring EmailLogRepository.listRecent.
  // The whole message is included because an SMS body is short enough to show
  // in the row itself — there is nothing to preview separately.
  async listRecent(filters: { limit?: number; type?: string; status?: string; search?: string } = {}): Promise<any[]> {
    const conditions: string[] = [];
    const binds: any[] = [];
    if (filters.type) { conditions.push('type = ?'); binds.push(filters.type); }
    if (filters.status) { conditions.push('status = ?'); binds.push(filters.status); }
    if (filters.search) {
      conditions.push('(phone LIKE ? OR message LIKE ?)');
      binds.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    binds.push(Math.min(filters.limit ?? 200, 500));

    const { results } = await this.db.prepare(`
      SELECT id, booking_id, course_id, broadcast_id, type, phone, message, status,
             provider_detail, sent_by, created_at
      FROM Sms_Logs
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(...binds).all();
    return results as any[];
  }
}

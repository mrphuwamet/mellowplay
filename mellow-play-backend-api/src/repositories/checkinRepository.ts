export class CheckinRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async getActionsForCourse(courseId: number): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT id, label, sort_order FROM Course_Checkin_Actions WHERE course_id = ? ORDER BY sort_order ASC, id ASC'
    ).bind(courseId).all();
    return results;
  }

  // Delete-all-reinsert on every save, same convention as
  // Registration_Form_Fields — action `id`s aren't stable across edits,
  // which is exactly why Booking_Checkin_Log keeps its own label_snapshot
  // instead of trusting the action row to still exist/mean the same thing.
  async saveActionsForCourse(courseId: number, actions: Array<{ label: string }>): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM Course_Checkin_Actions WHERE course_id = ?').bind(courseId),
      ...actions.map((action, index) =>
        this.db.prepare('INSERT INTO Course_Checkin_Actions (course_id, label, sort_order) VALUES (?, ?, ?)')
          .bind(courseId, action.label, index)
      ),
    ]);
  }

  // Scanning a QR looks up everything staff need in one call: who this is,
  // what course/round it's for, every action configured for that course, and
  // which of those are already checked off for this specific booking.
  async lookupByToken(token: string): Promise<any | null> {
    const booking = await this.db.prepare(`
      SELECT b.id, b.qr_token, b.child_id, b.course_id, b.scheduled_at, b.status,
        c.name as course_name, c.is_event, c.is_service,
        hp.name as child_name, hp.nickname as child_nickname, ch.avatar as child_avatar,
        u.first_name as parent_first_name, u.last_name as parent_last_name, u.phone as parent_phone
      FROM Bookings b
      JOIN Courses c ON b.course_id = c.id
      LEFT JOIN Children ch ON b.child_id = ch.id
      LEFT JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
      LEFT JOIN Users u ON ch.parent_id = u.id
      WHERE b.qr_token = ?
    `).bind(token).first() as any;
    if (!booking) return null;

    const actions = await this.getActionsForCourse(booking.course_id);
    const { results: checkedRows } = await this.db.prepare(
      'SELECT action_id, checked_at FROM Booking_Checkin_Log WHERE booking_id = ?'
    ).bind(booking.id).all();
    const checkedMap = new Map((checkedRows as any[]).map(r => [r.action_id, r.checked_at]));

    return {
      ...booking,
      actions: actions.map((a: any) => ({ ...a, checked_at: checkedMap.get(a.id) ?? null })),
    };
  }

  async toggleAction(bookingId: number, actionId: number, checkedByCrmUserId: number | null): Promise<boolean> {
    const existing = await this.db.prepare(
      'SELECT id FROM Booking_Checkin_Log WHERE booking_id = ? AND action_id = ?'
    ).bind(bookingId, actionId).first();

    if (existing) {
      await this.db.prepare('DELETE FROM Booking_Checkin_Log WHERE booking_id = ? AND action_id = ?')
        .bind(bookingId, actionId).run();
      return false; // now unchecked
    }

    const action = await this.db.prepare('SELECT label FROM Course_Checkin_Actions WHERE id = ?').bind(actionId).first() as any;
    if (!action) throw new Error('Action not found');
    await this.db.prepare(
      'INSERT INTO Booking_Checkin_Log (booking_id, action_id, label_snapshot, checked_by_crm_user_id) VALUES (?, ?, ?, ?)'
    ).bind(bookingId, actionId, action.label, checkedByCrmUserId).run();
    return true; // now checked
  }
}

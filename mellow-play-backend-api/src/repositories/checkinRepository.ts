export class CheckinRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async getActionsForCourse(courseId: number): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT id, label, sort_order FROM Course_Checkin_Actions WHERE course_id = ? ORDER BY sort_order ASC, id ASC'
    ).bind(courseId).all();
    return results;
  }

  // Diff-in-place, NOT delete-all-reinsert. Booking_Checkin_Log.action_id
  // cascades on delete, so the old delete-everything save silently erased a
  // course's entire check-in history the moment staff fixed a typo in a
  // label. Rows sent with their id are renamed in place; rows without one
  // (an old client, or a freshly typed line) claim the next unmatched
  // existing row in order before falling back to INSERT, so editing "on the
  // same box" never produces a new id. Only rows genuinely absent from the
  // payload are deleted — removing an action is the one edit that is meant
  // to take its ticks with it.
  async saveActionsForCourse(courseId: number, actions: Array<{ id?: number | null; label: string }>): Promise<void> {
    const existing = await this.getActionsForCourse(courseId);
    const claimed = new Set<number>();
    // A payload that carries ids is authoritative: a row without one is a
    // newly typed line. Only a fully id-less payload (an old client) falls
    // back to pairing by position, so its in-place edits still keep their ids.
    const payloadHasIds = actions.some(a => a.id != null);

    const statements: D1PreparedStatement[] = [];
    for (let index = 0; index < actions.length; index++) {
      const action = actions[index];
      let rowId: number | null = null;
      const byId = action.id != null ? existing.find((r: any) => r.id === Number(action.id)) : null;
      if (byId && !claimed.has(byId.id)) rowId = byId.id;
      else if (!payloadHasIds) {
        const next = existing.find((r: any) => !claimed.has(r.id));
        if (next) rowId = next.id;
      }
      if (rowId != null) {
        claimed.add(rowId);
        statements.push(
          this.db.prepare('UPDATE Course_Checkin_Actions SET label = ?, sort_order = ? WHERE id = ? AND course_id = ?')
            .bind(action.label, index, rowId, courseId)
        );
      } else {
        statements.push(
          this.db.prepare('INSERT INTO Course_Checkin_Actions (course_id, label, sort_order) VALUES (?, ?, ?)')
            .bind(courseId, action.label, index)
        );
      }
    }
    for (const row of existing as any[]) {
      if (!claimed.has(row.id)) {
        statements.push(this.db.prepare('DELETE FROM Course_Checkin_Actions WHERE id = ? AND course_id = ?').bind(row.id, courseId));
      }
    }
    if (statements.length > 0) await this.db.batch(statements);
  }

  // Scanning a QR looks up everything staff need in one call: who this is,
  // what course/round it's for, every action configured for that course, and
  // which of those are already checked off for this specific booking.
  async lookupByToken(token: string): Promise<any | null> {
    const booking = await this.db.prepare(`
      SELECT b.id, b.qr_token, b.child_id, b.course_id, b.scheduled_at, b.status, b.form_submission_id,
             b.staff_note,
        c.name as course_name, c.is_event, c.is_service,
        hp.name as child_name, hp.name_en as child_name_en, hp.nickname as child_nickname, ch.avatar as child_avatar,
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

    // For a form-based registration the form's person answers ARE the
    // attendees — the check-in surfaces (consumer QR page, CRM scanner)
    // lead with these instead of the account child the seat is booked
    // under, matching the CRM booking list/detail views.
    let formPeople: Array<{ label: string; value: string }> = [];
    if (booking.form_submission_id) {
      const sub = await this.db.prepare(
        'SELECT form_id, answers_json FROM Form_Submissions WHERE id = ?'
      ).bind(booking.form_submission_id).first() as any;
      if (sub) {
        const { results: pickerFields } = await this.db.prepare(
          `SELECT field_key, label FROM Registration_Form_Fields WHERE form_id = ? AND type = 'family_member_picker' ORDER BY page_index ASC, field_index ASC`
        ).bind(sub.form_id).all();
        let answers: Record<string, any> = {};
        try { answers = JSON.parse(sub.answers_json || '{}'); } catch { /* malformed answers shouldn't block check-in */ }
        formPeople = (pickerFields as any[])
          .map(f => ({ label: f.label, value: answers[f.field_key] }))
          .filter(p => !!p.value);
      }
    }

    return {
      ...booking,
      form_people: formPeople,
      actions: actions.map((a: any) => ({ ...a, checked_at: checkedMap.get(a.id) ?? null })),
    };
  }

  // Manual fallback for when scanning isn't practical (no signal, camera
  // trouble, attendee lost their QR) — exact match against Users.phone,
  // same no-normalization convention the rest of the system already uses
  // for phone lookups (matching whatever the parent actually typed at
  // registration). Returns every one of that family's bookings (soonest
  // first) with each row's own qr_token, so picking one just re-runs
  // lookupByToken() — the same single code path either way finds a match.

  /**
   * Which survey/test forms these people have already answered.
   *
   * Matched on the respondent, not on the booking: a survey is filled in
   * from a link, not from inside a booking, so there is no id joining the
   * two. Both sides are normalised before comparing — a name typed with a
   * double space, or a phone written with dashes, is the same person.
   *
   * Trial runs (is_test) never count: staff testing a form must not make a
   * family look like they have already answered it.
   */
  async findSurveyHistory(names: string[], phones: string[]): Promise<any[]> {
    const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
    // Capped so one booking with a long roster cannot build an unbounded
    // statement; a family roster is a handful of people.
    const nameList = Array.from(new Set(names.map(norm).filter(n => n.length > 1))).slice(0, 12);
    const phoneList = Array.from(new Set(phones.map(p => p.replace(/[^0-9]/g, "")).filter(p => p.length >= 9))).slice(0, 4);
    if (nameList.length === 0 && phoneList.length === 0) return [];

    const clauses: string[] = [];
    const binds: any[] = [];
    if (nameList.length > 0) {
      // TRIM+LOWER on the stored side, and a double-space squeeze, to mirror
      // norm() above. Thai has no case, so LOWER only matters for latin names.
      clauses.push(`REPLACE(LOWER(TRIM(s.respondent_name)), '  ', ' ') IN (${nameList.map(() => '?').join(',')})`);
      binds.push(...nameList);
    }
    if (phoneList.length > 0) {
      clauses.push(`REPLACE(REPLACE(REPLACE(s.respondent_phone, '-', ''), ' ', ''), '+66', '0') IN (${phoneList.map(() => '?').join(',')})`);
      binds.push(...phoneList);
    }

    const { results } = await this.db.prepare(`
      SELECT s.id, s.form_id, s.respondent_name, s.respondent_phone, s.created_at,
             s.total_score, s.max_score, s.attempt_no, s.attempt_label,
             f.name AS form_name, f.form_kind, f.has_answer_key
        FROM Survey_Submissions s
        JOIN Survey_Forms f ON f.id = s.form_id
       WHERE COALESCE(s.is_test, 0) = 0
         AND (${clauses.join(' OR ')})
       ORDER BY s.created_at DESC
       LIMIT 20
    `).bind(...binds).all();
    return results as any[];
  }

  async searchByPhone(phone: string): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT b.id as booking_id, b.qr_token, b.scheduled_at, b.status,
        c.name as course_name,
        hp.name as child_name, hp.nickname as child_nickname, ch.avatar as child_avatar
      FROM Users u
      JOIN Children ch ON ch.parent_id = u.id
      JOIN HD_Profiles hp ON ch.hd_profile_id = hp.id
      JOIN Bookings b ON b.child_id = ch.id
      JOIN Courses c ON b.course_id = c.id
      WHERE u.phone = ? AND u.deleted_at IS NULL AND b.qr_token IS NOT NULL
      ORDER BY b.scheduled_at ASC
      LIMIT 20
    `).bind(phone.trim()).all();
    return results;
  }

  /**
   * Bulk check-in from the booking list: SET the given actions checked for
   * every booking — never a toggle, so re-running it over a mixed selection
   * can only add ticks, not silently undo someone already checked in.
   *
   * Returns the bookings that went from zero ticks to some — the ones that
   * "arrived" by this call — so the controller can run the same stamp/
   * certificate side effects a door scan triggers.
   */
  async setActionsChecked(
    bookingIds: number[], actionIds: number[], checkedByCrmUserId: number | null
  ): Promise<{ newlyArrived: number[]; inserted: number }> {
    if (bookingIds.length === 0 || actionIds.length === 0) return { newlyArrived: [], inserted: 0 };

    const actionPh = actionIds.map(() => '?').join(',');
    const { results: actionRows } = await this.db.prepare(
      `SELECT id, label FROM Course_Checkin_Actions WHERE id IN (${actionPh})`
    ).bind(...actionIds).all();
    const labelById = new Map((actionRows as any[]).map(r => [r.id, r.label]));

    // One read for the whole selection, chunked under D1's 100-bind cap.
    const existing = new Set<string>();
    const tickedBookings = new Set<number>();
    for (let i = 0; i < bookingIds.length; i += 90) {
      const chunk = bookingIds.slice(i, i + 90);
      const { results } = await this.db.prepare(
        `SELECT booking_id, action_id FROM Booking_Checkin_Log WHERE booking_id IN (${chunk.map(() => '?').join(',')})`
      ).bind(...chunk).all();
      for (const r of results as any[]) {
        existing.add(`${r.booking_id}:${r.action_id}`);
        tickedBookings.add(Number(r.booking_id));
      }
    }

    const statements: D1PreparedStatement[] = [];
    const touched = new Set<number>();
    for (const bookingId of bookingIds) {
      for (const actionId of actionIds) {
        if (!labelById.has(actionId) || existing.has(`${bookingId}:${actionId}`)) continue;
        statements.push(
          this.db.prepare(
            'INSERT INTO Booking_Checkin_Log (booking_id, action_id, label_snapshot, checked_by_crm_user_id) VALUES (?, ?, ?, ?)'
          ).bind(bookingId, actionId, labelById.get(actionId), checkedByCrmUserId)
        );
        touched.add(bookingId);
      }
    }
    if (statements.length > 0) await this.db.batch(statements);

    return {
      newlyArrived: [...touched].filter(id => !tickedBookings.has(id)),
      inserted: statements.length,
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

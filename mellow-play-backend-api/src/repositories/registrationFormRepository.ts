export class RegistrationFormRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async listForms(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT f.id, f.name, f.description, f.is_active, f.created_at,
        (SELECT COUNT(*) FROM Courses c WHERE c.registration_form_id = f.id) AS course_count,
        (SELECT GROUP_CONCAT(DISTINCT ff.duplicate_check_scope) FROM Registration_Form_Fields ff
          WHERE ff.form_id = f.id AND ff.duplicate_check_scope IS NOT NULL) AS duplicate_check_scopes
      FROM Registration_Forms f
      ORDER BY f.created_at DESC
    `).all();
    return results;
  }

  async getFormWithFields(id: number): Promise<any | null> {
    const form = await this.db.prepare('SELECT * FROM Registration_Forms WHERE id = ?').bind(id).first();
    if (!form) return null;
    const { results: fields } = await this.db.prepare(`
      SELECT * FROM Registration_Form_Fields WHERE form_id = ? ORDER BY page_index ASC, field_index ASC
    `).bind(id).all();
    return { ...form, fields };
  }

  // Public/consumer read: the course may have no form assigned, or the
  // assigned form may since have been deactivated — both are "no form" to
  // whoever is booking, not an error.
  async getFormForCourse(courseId: number): Promise<any | null> {
    const course = await this.db.prepare('SELECT registration_form_id FROM Courses WHERE id = ?').bind(courseId).first() as any;
    if (!course?.registration_form_id) return null;
    const form = await this.getFormWithFields(course.registration_form_id);
    if (!form || !form.is_active) return null;
    return form;
  }

  // Duplicate check is scoped per field (any field marked with
  // duplicate_check_scope), but a submission only counts as a duplicate if
  // ALL of those scoped fields match together on the SAME prior submission
  // — matching by name alone is unreliable (common first names/nicknames
  // collide across unrelated families), so requiring every scoped field to
  // agree at once (e.g. parent name AND child name both matching the same
  // old submission) cuts false positives while still catching a real
  // repeat registration. 'round' scope (on any of the fields) additionally
  // restricts the comparison to submissions for the same scheduled_at;
  // otherwise it compares across every occurrence of the course.
  async findDuplicateSubmission(params: {
    formId: number; courseId: number;
    fields: Array<{ fieldKey: string; scope: 'course' | 'round'; normalizedValue: string }>;
    scheduledAt?: string;
  }): Promise<boolean> {
    if (params.fields.length === 0) return false;
    // A submission only counts as a real duplicate if it still has an
    // active booking attached — otherwise someone who cancelled (booking
    // row survives with status='cancelled') or was hard-deleted (no row
    // left at all) would be permanently blocked from ever registering
    // again with the same name/answer, even though nothing of theirs is
    // actually still booked.
    const activeBookingExists = `
      EXISTS (SELECT 1 FROM Bookings b WHERE b.form_submission_id = fs.id AND b.status != 'cancelled')
    `;
    const restrictToRound = params.fields.some(f => f.scope === 'round');
    const query = restrictToRound
      ? this.db.prepare(`SELECT answers_json FROM Form_Submissions fs WHERE fs.form_id = ? AND fs.course_id = ? AND fs.scheduled_at = ? AND ${activeBookingExists}`)
          .bind(params.formId, params.courseId, params.scheduledAt ?? null)
      : this.db.prepare(`SELECT answers_json FROM Form_Submissions fs WHERE fs.form_id = ? AND fs.course_id = ? AND ${activeBookingExists}`)
          .bind(params.formId, params.courseId);
    const { results } = await query.all();
    for (const row of results as any[]) {
      try {
        const answers = JSON.parse(row.answers_json || '{}');
        const allFieldsMatch = params.fields.every(f => {
          const value = answers[f.fieldKey];
          return value != null && String(value).trim().toLowerCase() === f.normalizedValue;
        });
        if (allFieldsMatch) return true;
      } catch { /* malformed answers_json shouldn't block booking on other rows */ }
    }
    return false;
  }

  // A family_member_picker field marked duplicate_check_scope='calendar' is
  // checked differently from the plain course/round text-field scopes above:
  // instead of requiring several fields to match together on ONE prior
  // submission, this looks for the SAME PERSON (by real name, regardless of
  // which role — parent or child — they were picked under) across every
  // course that shares this calendar, not just this one course/round. A
  // physical calendar slot is what's actually being double-booked, so a
  // person who registered for a different class sharing the same calendar
  // is still a real duplicate even though the course_id differs.
  async findDuplicatePersonInCalendar(calendarId: number, candidateNames: string[]): Promise<boolean> {
    const normalizedCandidates = new Set(candidateNames.map(n => n.trim().toLowerCase()).filter(Boolean));
    if (normalizedCandidates.size === 0) return false;
    const taken = await this.listRegisteredNamesInCalendar(calendarId);
    return taken.some(n => normalizedCandidates.has(n));
  }

  /**
   * Every person already registered anywhere on this calendar, normalised the
   * same way findDuplicatePersonInCalendar compares them.
   *
   * Exists so the booking form can grey out and label those people BEFORE
   * someone fills in a whole form and gets rejected at submit. The check above
   * now runs off this list rather than repeating the traversal, because two
   * copies of "who counts as already registered" would drift and the UI would
   * end up promising something the server refuses.
   */
  async listRegisteredNamesInCalendar(calendarId: number): Promise<string[]> {
    const { results: submissions } = await this.db.prepare(`
      SELECT fs.form_id, fs.answers_json
      FROM Form_Submissions fs
      JOIN Courses c ON c.id = fs.course_id
      WHERE c.calendar_id = ?
        AND EXISTS (SELECT 1 FROM Bookings b WHERE b.form_submission_id = fs.id AND b.status != 'cancelled')
    `).bind(calendarId).all();
    if ((submissions as any[]).length === 0) return [];

    const formIds = Array.from(new Set((submissions as any[]).map((s: any) => s.form_id)));
    const pickerKeysByForm = new Map<number, string[]>();
    for (const formId of formIds) {
      const { results: fields } = await this.db.prepare(
        `SELECT field_key FROM Registration_Form_Fields WHERE form_id = ? AND type = 'family_member_picker'`
      ).bind(formId).all();
      pickerKeysByForm.set(formId, (fields as any[]).map(f => f.field_key));
    }

    const taken = new Set<string>();
    for (const s of submissions as any[]) {
      const pickerKeys = pickerKeysByForm.get(s.form_id) || [];
      if (pickerKeys.length === 0) continue;
      let answers: Record<string, any> = {};
      try { answers = JSON.parse(s.answers_json || '{}'); } catch { continue; }
      for (const key of pickerKeys) {
        const realNameText = answers[`${key}__realname`];
        if (!realNameText) continue;
        for (const n of String(realNameText).split(',').map(x => x.trim().toLowerCase()).filter(Boolean)) {
          taken.add(n);
        }
      }
    }
    return Array.from(taken);
  }

  // Used to show (and, via updateSubmissionAnswers, edit) what a family
  // filled in for a specific booking — answers are keyed by field_key, so
  // pair each up with its field's label/options for display; the caller
  // filters out 'heading' fields and empty answers itself.
  async getSubmissionWithFields(submissionId: number): Promise<{ answers: Record<string, any>; fields: any[] } | null> {
    const submission = await this.db.prepare('SELECT form_id, answers_json FROM Form_Submissions WHERE id = ?').bind(submissionId).first() as any;
    if (!submission) return null;
    const { results: fields } = await this.db.prepare(`
      SELECT field_key, type, label, options_json, config_json FROM Registration_Form_Fields WHERE form_id = ? ORDER BY page_index ASC, field_index ASC
    `).bind(submission.form_id).all();
    let answers: Record<string, any> = {};
    try { answers = JSON.parse(submission.answers_json || '{}'); } catch { /* malformed shouldn't block display */ }
    return { answers, fields };
  }

  // CRM staff correcting a family's submitted answers (typos, wrong info) —
  // replaces the whole answers_json wholesale, same "always write the full
  // object" approach the consumer submit flow already uses.
  async updateSubmissionAnswers(submissionId: number, answersJson: string): Promise<void> {
    await this.db.prepare('UPDATE Form_Submissions SET answers_json = ? WHERE id = ?').bind(answersJson, submissionId).run();
  }

  // team_select fields cap how many registrants can pick each named team
  // (options_json holds [{label, capacity}, ...] instead of the plain
  // string options other choice types use). Availability resets per round
  // (scheduled_at) — a team fills up for one specific date/time, not for
  // every occurrence of the course — so the consumer booking wizard's date
  // step now runs before the registration-form step whenever a form has a
  // team_select field, and passes the chosen scheduledAt in here.
  async getTeamCounts(formId: number, courseId: number, scheduledAt: string, fieldKey: string): Promise<Record<string, number>> {
    // Same "only count it if still actively booked" guard as
    // findDuplicateSubmission — a cancelled or hard-deleted booking must
    // free its team spot back up, not hold it forever.
    //
    // Which round a submission belongs to is derived from its LIVE bookings'
    // scheduled_at, not fs.scheduled_at: the submission's own copy is frozen
    // at creation (rescheduling only updates Bookings), so counting against
    // it put a moved booking's team spot in the old round forever. Both
    // sides are truncated to minute precision because callers pass
    // "YYYY-MM-DD HH:MM" (consumer flow) or "...HH:MM:SS" (CRM, which reads
    // Bookings.scheduled_at back) — an exact string compare made every CRM
    // lookup miss entirely, so every team showed its full capacity as free.
    const { results } = await this.db.prepare(`
      SELECT answers_json FROM Form_Submissions fs
      WHERE fs.form_id = ? AND fs.course_id = ?
        AND EXISTS (
          SELECT 1 FROM Bookings b
          WHERE b.form_submission_id = fs.id AND b.status != 'cancelled'
            AND SUBSTR(b.scheduled_at, 1, 16) = SUBSTR(?, 1, 16)
        )
    `).bind(formId, courseId, scheduledAt).all();
    const counts: Record<string, number> = {};
    for (const row of results as any[]) {
      try {
        const answers = JSON.parse(row.answers_json || '{}');
        const chosen = answers[fieldKey];
        if (chosen) counts[chosen] = (counts[chosen] || 0) + 1;
      } catch { /* malformed answers_json shouldn't block other rows */ }
    }
    return counts;
  }

  // Same counts as getTeamCounts, but for every team_select field on the
  // form at once — what the consumer app's form step reads to show
  // remaining capacity (and disable full teams) before submit.
  async getTeamAvailability(formId: number, courseId: number, scheduledAt: string): Promise<Record<string, Record<string, number>>> {
    const { results: fields } = await this.db.prepare(
      `SELECT field_key FROM Registration_Form_Fields WHERE form_id = ? AND type = 'team_select'`
    ).bind(formId).all();
    const result: Record<string, Record<string, number>> = {};
    for (const f of fields as any[]) {
      result[f.field_key] = await this.getTeamCounts(formId, courseId, scheduledAt, f.field_key);
    }
    return result;
  }

  // Bulk version of getSubmissionWithFields — the CRM booking list's CSV
  // export needs every submission behind a whole filtered page of bookings
  // at once (those bookings can span several different courses/forms), not
  // one request per row. Field defs are only fetched once per distinct
  // form_id, not once per submission.
  async getSubmissionsWithFields(submissionIds: number[]): Promise<Record<number, { formId: number; answers: Record<string, any>; fields: any[] }>> {
    if (submissionIds.length === 0) return {};
    const { results: submissions } = await this.db.prepare(
      `SELECT id, form_id, answers_json FROM Form_Submissions WHERE id IN (${submissionIds.map(() => '?').join(',')})`
    ).bind(...submissionIds).all();

    const formIds = Array.from(new Set((submissions as any[]).map(s => s.form_id)));
    const fieldsByForm = new Map<number, any[]>();
    for (const formId of formIds) {
      const { results: fields } = await this.db.prepare(
        'SELECT field_key, type, label FROM Registration_Form_Fields WHERE form_id = ? ORDER BY page_index ASC, field_index ASC'
      ).bind(formId).all();
      fieldsByForm.set(formId, fields);
    }

    const result: Record<number, { formId: number; answers: Record<string, any>; fields: any[] }> = {};
    for (const s of submissions as any[]) {
      let answers: Record<string, any> = {};
      try { answers = JSON.parse(s.answers_json || '{}'); } catch { /* malformed shouldn't block the rest */ }
      result[s.id] = { formId: s.form_id, answers, fields: fieldsByForm.get(s.form_id) || [] };
    }
    return result;
  }

  async createSubmission(data: {
    formId: number; courseId: number; parentUserId: number | null;
    answersJson: string; scheduledAt?: string;
  }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Form_Submissions (form_id, course_id, parent_user_id, answers_json, scheduled_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(data.formId, data.courseId, data.parentUserId, data.answersJson, data.scheduledAt ?? null).run();
    return result.meta.last_row_id;
  }

  async createForm(data: {
    name: string;
    description?: string;
    isActive?: boolean;
    fields: Array<{
      fieldKey: string; pageIndex: number; fieldIndex: number; type: string;
      label: string; required?: boolean; optionsJson?: string; configJson?: string;
      duplicateCheckScope?: 'none' | 'course' | 'round';
    }>;
  }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Registration_Forms (name, description, is_active)
      VALUES (?, ?, ?)
    `).bind(
      data.name, data.description ?? null,
      data.isActive === false ? 0 : 1,
    ).run();
    const formId = result.meta.last_row_id;

    if (data.fields.length > 0) {
      await this.db.batch(data.fields.map(f =>
        this.db.prepare(`
          INSERT INTO Registration_Form_Fields (form_id, field_key, page_index, field_index, type, label, required, options_json, config_json, duplicate_check_scope)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          formId, f.fieldKey, f.pageIndex, f.fieldIndex, f.type, f.label,
          f.required ? 1 : 0, f.optionsJson ?? null, f.configJson ?? null,
          (f.duplicateCheckScope && f.duplicateCheckScope !== 'none') ? f.duplicateCheckScope : null,
        )
      ));
    }
    return formId;
  }

  // Fields are always replaced wholesale on save (delete-all-reinsert) —
  // simplest correct approach for a builder with no per-field diffing.
  // field_key (not the DB id, which churns every save) is what survives
  // across saves for anything that needs a stable reference.
  async updateForm(id: number, data: {
    name: string;
    description?: string;
    isActive?: boolean;
    fields: Array<{
      fieldKey: string; pageIndex: number; fieldIndex: number; type: string;
      label: string; required?: boolean; optionsJson?: string; configJson?: string;
      duplicateCheckScope?: 'none' | 'course' | 'round';
    }>;
  }): Promise<void> {
    const statements = [
      this.db.prepare(`
        UPDATE Registration_Forms SET name = ?, description = ?, is_active = ?
        WHERE id = ?
      `).bind(
        data.name, data.description ?? null,
        data.isActive === false ? 0 : 1,
        id,
      ),
      this.db.prepare('DELETE FROM Registration_Form_Fields WHERE form_id = ?').bind(id),
      ...data.fields.map(f =>
        this.db.prepare(`
          INSERT INTO Registration_Form_Fields (form_id, field_key, page_index, field_index, type, label, required, options_json, config_json, duplicate_check_scope)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id, f.fieldKey, f.pageIndex, f.fieldIndex, f.type, f.label,
          f.required ? 1 : 0, f.optionsJson ?? null, f.configJson ?? null,
          (f.duplicateCheckScope && f.duplicateCheckScope !== 'none') ? f.duplicateCheckScope : null,
        )
      ),
    ];
    await this.db.batch(statements);
  }

  // Courses referencing this form would otherwise fail the DELETE with a
  // FOREIGN KEY constraint error (same class of issue already hit once with
  // Bookings deletion) — clear the reference first, in the same batch.
  async deleteForm(id: number): Promise<void> {
    await this.db.batch([
      this.db.prepare('UPDATE Courses SET registration_form_id = NULL WHERE registration_form_id = ?').bind(id),
      this.db.prepare('DELETE FROM Registration_Forms WHERE id = ?').bind(id),
    ]);
  }
}

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

  // Duplicate check is scoped per field (the field marked with
  // duplicate_check_scope), compared as plain normalized text against every
  // prior submission's answer for that same field_key — matches the "check
  // by name" requirement without needing a dedicated identity column.
  // 'round' scope additionally restricts the comparison to submissions for
  // the same scheduled_at; 'course' scope compares across all of them.
  async findDuplicateSubmission(params: {
    formId: number; courseId: number; fieldKey: string; scope: 'course' | 'round';
    normalizedValue: string; scheduledAt?: string;
  }): Promise<boolean> {
    const query = params.scope === 'round'
      ? this.db.prepare('SELECT answers_json FROM Form_Submissions WHERE form_id = ? AND course_id = ? AND scheduled_at = ?')
          .bind(params.formId, params.courseId, params.scheduledAt ?? null)
      : this.db.prepare('SELECT answers_json FROM Form_Submissions WHERE form_id = ? AND course_id = ?')
          .bind(params.formId, params.courseId);
    const { results } = await query.all();
    for (const row of results as any[]) {
      try {
        const answers = JSON.parse(row.answers_json || '{}');
        const value = answers[params.fieldKey];
        if (value != null && String(value).trim().toLowerCase() === params.normalizedValue) return true;
      } catch { /* malformed answers_json shouldn't block booking on other rows */ }
    }
    return false;
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

export interface SurveyFieldInput {
  fieldKey: string; pageIndex: number; fieldIndex: number; type: string;
  label: string; required?: boolean; optionsJson?: string; configJson?: string;
}

export class SurveyRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async listForms(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT f.id, f.name, f.description, f.form_kind, f.has_answer_key, f.is_active, f.slug, f.created_at,
        (SELECT COUNT(*) FROM Survey_Submissions s WHERE s.form_id = f.id) AS response_count
      FROM Survey_Forms f
      ORDER BY f.created_at DESC
    `).all();
    return results;
  }

  async getFormWithFields(id: number): Promise<any | null> {
    const form = await this.db.prepare('SELECT * FROM Survey_Forms WHERE id = ?').bind(id).first();
    if (!form) return null;
    const { results: fields } = await this.db.prepare(
      'SELECT * FROM Survey_Form_Fields WHERE form_id = ? ORDER BY page_index ASC, field_index ASC'
    ).bind(id).all();
    return { ...form, fields };
  }

  // Public read: accepts either a numeric id or a slug, since the shareable
  // consumer-app link can use whichever the form was given. Inactive forms
  // are "not found" to a respondent, same as a deleted one.
  async getPublicForm(idOrSlug: string): Promise<any | null> {
    const isNumeric = /^\d+$/.test(idOrSlug);
    const form = isNumeric
      ? await this.db.prepare('SELECT * FROM Survey_Forms WHERE id = ?').bind(parseInt(idOrSlug)).first() as any
      : await this.db.prepare('SELECT * FROM Survey_Forms WHERE slug = ?').bind(idOrSlug).first() as any;
    if (!form || !form.is_active) return null;
    const { results: fields } = await this.db.prepare(
      'SELECT * FROM Survey_Form_Fields WHERE form_id = ? ORDER BY page_index ASC, field_index ASC'
    ).bind(form.id).all();
    return { ...form, fields };
  }

  async createForm(data: {
    name: string; description?: string; formKind: string; hasAnswerKey?: boolean;
    isActive?: boolean; slug?: string | null; fields: SurveyFieldInput[];
  }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Survey_Forms (name, description, form_kind, has_answer_key, is_active, slug)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      data.name, data.description ?? null, data.formKind,
      data.hasAnswerKey ? 1 : 0, data.isActive === false ? 0 : 1, data.slug ?? null,
    ).run();
    const formId = result.meta.last_row_id;

    if (data.fields.length > 0) {
      await this.db.batch(data.fields.map(f =>
        this.db.prepare(`
          INSERT INTO Survey_Form_Fields (form_id, field_key, page_index, field_index, type, label, required, options_json, config_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(formId, f.fieldKey, f.pageIndex, f.fieldIndex, f.type, f.label, f.required ? 1 : 0, f.optionsJson ?? null, f.configJson ?? null)
      ));
    }
    return formId;
  }

  // Fields are always replaced wholesale on save (delete-all-reinsert), same
  // approach as Registration_Form_Fields — field_key (client-generated, not
  // the DB id) is what survives across saves for anything referencing it.
  async updateForm(id: number, data: {
    name: string; description?: string; formKind: string; hasAnswerKey?: boolean;
    isActive?: boolean; slug?: string | null; fields: SurveyFieldInput[];
  }): Promise<void> {
    const statements = [
      this.db.prepare(`
        UPDATE Survey_Forms SET name = ?, description = ?, form_kind = ?, has_answer_key = ?, is_active = ?, slug = ?
        WHERE id = ?
      `).bind(
        data.name, data.description ?? null, data.formKind,
        data.hasAnswerKey ? 1 : 0, data.isActive === false ? 0 : 1, data.slug ?? null, id,
      ),
      this.db.prepare('DELETE FROM Survey_Form_Fields WHERE form_id = ?').bind(id),
      ...data.fields.map(f =>
        this.db.prepare(`
          INSERT INTO Survey_Form_Fields (form_id, field_key, page_index, field_index, type, label, required, options_json, config_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(id, f.fieldKey, f.pageIndex, f.fieldIndex, f.type, f.label, f.required ? 1 : 0, f.optionsJson ?? null, f.configJson ?? null)
      ),
    ];
    await this.db.batch(statements);
  }

  async deleteForm(id: number): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM Survey_Submissions WHERE form_id = ?').bind(id),
      this.db.prepare('DELETE FROM Survey_Forms WHERE id = ?').bind(id),
    ]);
  }

  async isSlugTaken(slug: string, excludeFormId?: number): Promise<boolean> {
    const row = excludeFormId
      ? await this.db.prepare('SELECT id FROM Survey_Forms WHERE slug = ? AND id != ?').bind(slug, excludeFormId).first()
      : await this.db.prepare('SELECT id FROM Survey_Forms WHERE slug = ?').bind(slug).first();
    return !!row;
  }

  // Scoring is computed here, server-side, from the form's OWN stored
  // options_json points — never trusted from the submitted answers payload.
  // radio/select: the point value of whichever single option was picked.
  // checkbox: sum of point values of every option selected. Per-field max
  // mirrors the same shape (highest single option for radio/select, sum of
  // every positive-point option for checkbox) so a non-graded form (or a
  // field with no points set) naturally contributes 0/0.
  private computeScore(fields: any[], answers: Record<string, any>): { totalScore: number; maxScore: number } {
    let totalScore = 0;
    let maxScore = 0;
    for (const f of fields) {
      if (f.type !== 'select' && f.type !== 'radio' && f.type !== 'checkbox') continue;
      let options: { label: string; points?: number }[] = [];
      try { options = f.options_json ? JSON.parse(f.options_json) : []; } catch { /* malformed options shouldn't block scoring other fields */ }
      if (options.length === 0) continue;

      if (f.type === 'checkbox') {
        const picked: string[] = Array.isArray(answers[f.field_key]) ? answers[f.field_key] : [];
        for (const opt of options) {
          const points = opt.points ?? 0;
          if (points > 0) maxScore += points;
          if (picked.includes(opt.label)) totalScore += points;
        }
      } else {
        const picked = answers[f.field_key];
        const bestPoints = Math.max(0, ...options.map(o => o.points ?? 0));
        maxScore += bestPoints;
        const match = options.find(o => o.label === picked);
        if (match) totalScore += match.points ?? 0;
      }
    }
    return { totalScore, maxScore };
  }

  async createSubmission(data: {
    formId: number; userId?: number | null; respondentName?: string | null;
    respondentPhone?: string | null; answers: Record<string, any>;
  }): Promise<{ id: number; totalScore: number | null; maxScore: number | null }> {
    const form = await this.db.prepare('SELECT has_answer_key FROM Survey_Forms WHERE id = ?').bind(data.formId).first() as any;
    let totalScore: number | null = null;
    let maxScore: number | null = null;
    if (form?.has_answer_key) {
      const { results: fields } = await this.db.prepare(
        'SELECT field_key, type, options_json FROM Survey_Form_Fields WHERE form_id = ?'
      ).bind(data.formId).all();
      const scored = this.computeScore(fields as any[], data.answers);
      totalScore = scored.totalScore;
      maxScore = scored.maxScore;
    }

    const result = await this.db.prepare(`
      INSERT INTO Survey_Submissions (form_id, user_id, respondent_name, respondent_phone, answers_json, total_score, max_score)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.formId, data.userId ?? null, data.respondentName ?? null, data.respondentPhone ?? null,
      JSON.stringify(data.answers), totalScore, maxScore,
    ).run();

    return { id: result.meta.last_row_id, totalScore, maxScore };
  }

  async listSubmissions(formId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT s.*, u.first_name AS user_first_name, u.last_name AS user_last_name
      FROM Survey_Submissions s
      LEFT JOIN Users u ON u.id = s.user_id
      WHERE s.form_id = ?
      ORDER BY s.created_at DESC
    `).bind(formId).all();
    return results;
  }
}

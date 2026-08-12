// Normalised form of a respondent name, used for the "one answer per person"
// rule. Thai names are typed inconsistently — leading spaces, double spaces
// between given and family name, mixed case on a Latin transliteration — and
// treating "สมชาย  ใจดี" as a different person from "สมชาย ใจดี" would make the
// rule trivially bypassable by accident.
export const normalizeName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ').toLowerCase();

export interface SessionFormInput { formId: number; orderIndex: number }

export class SessionRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async list(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT s.id, s.name, s.description, s.slug, s.is_active, s.require_unique_name, s.created_at,
        (SELECT COUNT(*) FROM Survey_Session_Forms sf WHERE sf.session_id = s.id) AS form_count,
        (SELECT COUNT(DISTINCT sub.session_run_id) FROM Survey_Submissions sub
          WHERE sub.session_id = s.id AND sub.session_run_id IS NOT NULL) AS respondent_count
      FROM Survey_Sessions s
      ORDER BY s.created_at DESC
    `).all();
    return results;
  }

  async getWithForms(id: number): Promise<any | null> {
    const session = await this.db.prepare('SELECT * FROM Survey_Sessions WHERE id = ?').bind(id).first();
    if (!session) return null;
    const { results: forms } = await this.db.prepare(`
      SELECT sf.form_id, sf.order_index, f.name, f.form_kind, f.has_answer_key
      FROM Survey_Session_Forms sf
      JOIN Survey_Forms f ON f.id = sf.form_id
      WHERE sf.session_id = ?
      ORDER BY sf.order_index ASC
    `).bind(id).all();
    return { ...session, forms };
  }

  // Public read: id or slug, inactive reads as "not found" — same contract as
  // SurveyRepository.getPublicForm. Returns only the form ids in order; the
  // controller fetches each form through the normal public path so shuffling
  // and answer-key stripping happen exactly once, in one place.
  async getPublicSession(idOrSlug: string): Promise<any | null> {
    const isNumeric = /^\d+$/.test(idOrSlug);
    const session = isNumeric
      ? await this.db.prepare('SELECT * FROM Survey_Sessions WHERE id = ?').bind(parseInt(idOrSlug)).first() as any
      : await this.db.prepare('SELECT * FROM Survey_Sessions WHERE slug = ?').bind(idOrSlug).first() as any;
    if (!session || !session.is_active) return null;

    const { results: forms } = await this.db.prepare(`
      SELECT sf.form_id
      FROM Survey_Session_Forms sf
      JOIN Survey_Forms f ON f.id = sf.form_id
      WHERE sf.session_id = ? AND f.is_active = 1
      ORDER BY sf.order_index ASC
    `).bind(session.id).all();

    return { ...session, formIds: (forms as any[]).map(f => f.form_id) };
  }

  async isSlugTaken(slug: string, excludeId?: number): Promise<boolean> {
    const row = excludeId
      ? await this.db.prepare('SELECT id FROM Survey_Sessions WHERE slug = ? AND id != ?').bind(slug, excludeId).first()
      : await this.db.prepare('SELECT id FROM Survey_Sessions WHERE slug = ?').bind(slug).first();
    return !!row;
  }

  async create(data: {
    name: string; description?: string | null; slug?: string | null;
    isActive?: boolean; requireUniqueName?: boolean; forms: SessionFormInput[];
  }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Survey_Sessions (name, description, slug, is_active, require_unique_name)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.name, data.description ?? null, data.slug ?? null,
      data.isActive === false ? 0 : 1, data.requireUniqueName === false ? 0 : 1,
    ).run();
    const id = result.meta.last_row_id;
    await this.replaceForms(id, data.forms);
    return id;
  }

  async update(id: number, data: {
    name: string; description?: string | null; slug?: string | null;
    isActive?: boolean; requireUniqueName?: boolean; forms: SessionFormInput[];
  }): Promise<void> {
    await this.db.prepare(`
      UPDATE Survey_Sessions SET name = ?, description = ?, slug = ?, is_active = ?, require_unique_name = ?
      WHERE id = ?
    `).bind(
      data.name, data.description ?? null, data.slug ?? null,
      data.isActive === false ? 0 : 1, data.requireUniqueName === false ? 0 : 1, id,
    ).run();
    await this.replaceForms(id, data.forms);
  }

  // Membership is replaced wholesale, same delete-all-reinsert approach the
  // form fields use. Submissions reference the session, never a membership
  // row, so reordering or swapping forms never orphans collected data.
  private async replaceForms(sessionId: number, forms: SessionFormInput[]): Promise<void> {
    const statements: D1PreparedStatement[] = [
      this.db.prepare('DELETE FROM Survey_Session_Forms WHERE session_id = ?').bind(sessionId),
      ...forms.map((f, i) =>
        this.db.prepare('INSERT INTO Survey_Session_Forms (session_id, form_id, order_index) VALUES (?, ?, ?)')
          .bind(sessionId, f.formId, f.orderIndex ?? i)
      ),
    ];
    await this.db.batch(statements);
  }

  async submissionCount(id: number): Promise<number> {
    const row = await this.db.prepare(
      'SELECT COUNT(*) AS n FROM Survey_Submissions WHERE session_id = ?'
    ).bind(id).first<{ n: number }>();
    return row?.n ?? 0;
  }

  /**
   * Deletes an empty session.
   *
   * A session that has collected answers is NOT deletable: Survey_Submissions
   * references it, so the delete would fail on the foreign key anyway, and the
   * two ways to force it through — dropping the submissions, or nulling their
   * session_id — either destroy responses or silently strip the grouping the
   * comparison view is built on. Deactivating is the operation staff actually
   * want there, and it keeps the link dead without losing anything.
   *
   * Returns false when the session still has responses, so the caller can say
   * so rather than surfacing a constraint error.
   */
  async remove(id: number): Promise<boolean> {
    if (await this.submissionCount(id) > 0) return false;
    await this.db.batch([
      this.db.prepare('DELETE FROM Survey_Session_Forms WHERE session_id = ?').bind(id),
      this.db.prepare('DELETE FROM Survey_Sessions WHERE id = ?').bind(id),
    ]);
    return true;
  }

  /**
   * Has this name already answered this session?
   *
   * Compared on the normalised name so spacing and case can't sneak a
   * duplicate through. Checked against submissions rather than against a
   * roster, because a run only exists once its first form is submitted.
   */
  async isNameTaken(sessionId: number, name: string, exceptRunId?: string | null): Promise<boolean> {
    const target = normalizeName(name);
    if (!target) return false;
    const { results } = await this.db.prepare(
      'SELECT DISTINCT respondent_name, session_run_id FROM Survey_Submissions WHERE session_id = ? AND respondent_name IS NOT NULL'
    ).bind(sessionId).all();
    return (results as any[]).some(r =>
      normalizeName(r.respondent_name) === target &&
      // A run in progress must not collide with itself when it submits its
      // second and third forms.
      (!exceptRunId || r.session_run_id !== exceptRunId)
    );
  }

  // Every submission collected under a session, with the form it belongs to.
  // The CRM does the grouping into runs/people — it already has to hold the
  // whole set to render the comparison anyway.
  async listSubmissions(sessionId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT sub.*, f.name AS form_name, f.form_kind, f.has_answer_key,
             u.first_name AS user_first_name, u.last_name AS user_last_name
      FROM Survey_Submissions sub
      JOIN Survey_Forms f ON f.id = sub.form_id
      LEFT JOIN Users u ON u.id = sub.user_id
      WHERE sub.session_id = ?
      ORDER BY sub.created_at ASC
    `).bind(sessionId).all();
    return results;
  }
}

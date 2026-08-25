/**
 * Certificate templates, and the certificates issued from them.
 *
 * The split matters: a template is a design that can change at will, and a
 * certificate is a thing a family already has. Everything printed on an issued
 * certificate is stored on its own row, so editing a template never rewrites
 * history — the template id is kept only so a reprint can find the artwork.
 */
export class CertificateRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // ── Templates ───────────────────────────────────────────────────────────
  async listTemplates(): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM Certificate_Templates WHERE is_active = 1 ORDER BY id'
    ).all();
    return results;
  }

  async getTemplate(id: number): Promise<any | null> {
    return await this.db.prepare('SELECT * FROM Certificate_Templates WHERE id = ?').bind(id).first();
  }

  async createTemplate(data: { name: string; backgroundUrl?: string | null; pageWidth?: number; pageHeight?: number; fieldsJson?: string }): Promise<number> {
    const res = await this.db.prepare(`
      INSERT INTO Certificate_Templates (name, background_url, page_width, page_height, fields_json)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.name, data.backgroundUrl ?? null,
      data.pageWidth ?? 297, data.pageHeight ?? 210,
      data.fieldsJson ?? '[]',
    ).run();
    return Number(res.meta.last_row_id);
  }

  async updateTemplate(id: number, data: { name?: string; backgroundUrl?: string | null; pageWidth?: number; pageHeight?: number; fieldsJson?: string }): Promise<void> {
    await this.db.prepare(`
      UPDATE Certificate_Templates SET
        name = COALESCE(?, name),
        background_url = ?,
        page_width = COALESCE(?, page_width),
        page_height = COALESCE(?, page_height),
        fields_json = COALESCE(?, fields_json),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      data.name ?? null, data.backgroundUrl ?? null,
      data.pageWidth ?? null, data.pageHeight ?? null,
      data.fieldsJson ?? null, id,
    ).run();
  }

  /** Soft, so certificates issued from it keep pointing at their artwork. */
  async deactivateTemplate(id: number): Promise<void> {
    await this.db.prepare('UPDATE Certificate_Templates SET is_active = 0 WHERE id = ?').bind(id).run();
  }

  // ── Bindings ────────────────────────────────────────────────────────────
  async listBindings(): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM Certificate_Template_Bindings ORDER BY scope, ref_id'
    ).all();
    return results;
  }

  async setBinding(scope: string, refId: number, templateId: number | null): Promise<void> {
    if (templateId == null) {
      await this.db.prepare('DELETE FROM Certificate_Template_Bindings WHERE scope = ? AND ref_id = ?')
        .bind(scope, refId).run();
      return;
    }
    await this.db.prepare(`
      INSERT INTO Certificate_Template_Bindings (scope, ref_id, template_id) VALUES (?, ?, ?)
      ON CONFLICT(scope, ref_id) DO UPDATE SET template_id = excluded.template_id
    `).bind(scope, refId, templateId).run();
  }

  /**
   * Which design this course uses: its own binding, then its calendar's.
   *
   * NO default. A certificate carries a child's name, an activity and a date,
   * and it is signed by us — so an item nobody chose a design for must issue
   * nothing at all rather than quietly reach for whichever template happens to
   * be first in the table. Falling back looks helpful and produces documents
   * that were never approved for that activity.
   *
   * The binding is still inherited from the calendar, so a series of rounds is
   * set up once rather than round by round.
   */
  async resolveTemplateId(courseId: number): Promise<number | null> {
    const row = await this.db.prepare(`
      SELECT COALESCE(
        (SELECT b.template_id FROM Certificate_Template_Bindings b
           JOIN Certificate_Templates t ON t.id = b.template_id AND t.is_active = 1
          WHERE b.scope = 'course' AND b.ref_id = c.id),
        (SELECT b.template_id FROM Certificate_Template_Bindings b
           JOIN Certificate_Templates t ON t.id = b.template_id AND t.is_active = 1
          WHERE b.scope = 'calendar' AND b.ref_id = c.calendar_id)
      ) AS template_id
      FROM Courses c WHERE c.id = ?
    `).bind(courseId).first<{ template_id: number | null }>();
    return row?.template_id ?? null;
  }

  // ── Issuing ─────────────────────────────────────────────────────────────

  /**
   * Everything needed to print, for one booking.
   *
   * The registration form's own people are preferred over the seat's system
   * child, the same way the check-in card and the booking list read them: on a
   * family booking the seat is often a placeholder and the form names who is
   * actually there.
   */
  async getIssueSource(bookingId: number): Promise<any | null> {
    return await this.db.prepare(`
      SELECT b.id AS booking_id, b.child_id, b.course_id, b.status,
             b.scheduled_at, b.form_submission_id,
             ch.parent_id AS user_id,
             hp.name AS child_name, hp.nickname AS child_nickname,
             co.name AS course_name
        FROM Bookings b
        LEFT JOIN Children ch ON ch.id = b.child_id
        LEFT JOIN HD_Profiles hp ON hp.id = ch.hd_profile_id
        LEFT JOIN Courses co ON co.id = b.course_id
       WHERE b.id = ?
    `).bind(bookingId).first();
  }

  async issue(data: {
    templateId: number | null; bookingId: number | null; childId: number | null; userId: number | null;
    recipientName: string; courseName: string | null; eventDate: string | null;
    serial: string | null; publicCode: string; issuedBy: number | null;
    source?: string;
    valuesJson?: string | null;
  }): Promise<number | null> {
    // OR IGNORE, not a pre-check: "issue for this whole round" is pressed
    // twice by people who are not sure it worked the first time, and the
    // unique index is what actually makes that safe.
    const res = await this.db.prepare(`
      INSERT OR IGNORE INTO Certificates
        (template_id, booking_id, child_id, user_id, recipient_name, course_name,
         event_date, serial, public_code, issued_by_crm_user_id, source, values_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.templateId, data.bookingId, data.childId, data.userId,
      data.recipientName, data.courseName, data.eventDate,
      data.serial, data.publicCode, data.issuedBy, data.source ?? 'manual',
      data.valuesJson ?? null,
    ).run();
    const id = Number(res.meta.last_row_id);
    return res.meta.changes > 0 ? id : null;
  }

  /** The running number, per calendar year. */
  async nextSerial(year: number): Promise<string> {
    const row = await this.db.prepare(
      "SELECT COUNT(*) AS n FROM Certificates WHERE serial LIKE ?"
    ).bind(`MP-${year}-%`).first<{ n: number }>();
    return `MP-${year}-${String((row?.n ?? 0) + 1).padStart(4, '0')}`;
  }

  async listForBookings(bookingIds: number[]): Promise<any[]> {
    if (bookingIds.length === 0) return [];
    const out: any[] = [];
    // Chunked at 90: D1 caps bound parameters at 100 per statement.
    for (let i = 0; i < bookingIds.length; i += 90) {
      const chunk = bookingIds.slice(i, i + 90);
      const { results } = await this.db.prepare(
        `SELECT * FROM Certificates WHERE revoked_at IS NULL AND booking_id IN (${chunk.map(() => '?').join(',')})`
      ).bind(...chunk).all();
      out.push(...(results as any[]));
    }
    return out;
  }

  async listForUser(userId: number): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM Certificates WHERE user_id = ? AND revoked_at IS NULL ORDER BY issued_at DESC'
    ).bind(userId).all();
    return results;
  }

  /** By its public code — what the QR and the verification page look up. */
  async getByPublicCode(code: string): Promise<any | null> {
    return await this.db.prepare(
      'SELECT * FROM Certificates WHERE public_code = ?'
    ).bind(code).first();
  }

  /**
   * Live certificates for these bookings, with their template — everything one
   * print run needs, in one round trip rather than one per sheet.
   */
  async listForPrinting(bookingIds: number[]): Promise<any[]> {
    if (bookingIds.length === 0) return [];
    const out: any[] = [];
    // Chunked at 90: D1 caps bound parameters at 100 per statement.
    for (let i = 0; i < bookingIds.length; i += 90) {
      const chunk = bookingIds.slice(i, i + 90);
      const { results } = await this.db.prepare(`
        SELECT c.*, t.background_url, t.page_width, t.page_height, t.fields_json
          FROM Certificates c
          LEFT JOIN Certificate_Templates t ON t.id = c.template_id
         WHERE c.revoked_at IS NULL AND c.booking_id IN (${chunk.map(() => '?').join(',')})
         ORDER BY c.id
      `).bind(...chunk).all();
      out.push(...(results as any[]));
    }
    return out;
  }

  /** One certificate with the address to send it to. */
  async getWithRecipientEmail(id: number): Promise<any | null> {
    return await this.db.prepare(`
      SELECT c.*, u.email AS parent_email, u.first_name, u.last_name
        FROM Certificates c
        LEFT JOIN Users u ON u.id = c.user_id AND u.deleted_at IS NULL
       WHERE c.id = ?
    `).bind(id).first();
  }

  async revoke(id: number, reason: string | null): Promise<void> {
    await this.db.prepare(
      "UPDATE Certificates SET revoked_at = datetime('now'), revoke_reason = ? WHERE id = ? AND revoked_at IS NULL"
    ).bind(reason, id).run();
  }

  /** Live bookings on one round, for issuing a whole session at once. */
  async bookingIdsForRound(courseId: number, slotDate: string, slotStartTime: string): Promise<number[]> {
    const { results } = await this.db.prepare(`
      SELECT id FROM Bookings
       WHERE course_id = ? AND status NOT IN ('cancelled', 'no_show')
         AND slot_date = ? AND SUBSTR(slot_start_time, 1, 5) = SUBSTR(?, 1, 5)
    `).bind(courseId, slotDate, slotStartTime).all<{ id: number }>();
    return (results as any[]).map(r => Number(r.id));
  }
}

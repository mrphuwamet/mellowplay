/**
 * Consent documents and their published versions — see migration 0119.
 *
 * The one rule this file exists to hold: the wording a family agreed to is
 * never edited away. Staff edit the live document freely, and every time the
 * words actually change a new version is archived alongside the old one, so a
 * consent recorded in March can still be shown as the words that were on
 * screen in March.
 */

export interface ConsentDocumentInput {
  docKey: string;
  title: string;
  summary?: string;
  bodyHtml?: string;
  isActive?: boolean;
  showOnPolicyPage?: boolean;
  isRequiredDefault?: boolean;
  displayOrder?: number;
}

/** A slug that can sit in a URL and in a form's config without escaping. */
export const isConsentKey = (key: string): boolean => /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(key);

export class ConsentRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  /** Everything, for the CRM's manager. Retired documents included. */
  async list(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT d.*,
        (SELECT COUNT(*) FROM Consent_Document_Versions v WHERE v.document_id = d.id) AS version_count
      FROM Consent_Documents d
      ORDER BY d.display_order, d.id
    `).all();
    return results as any[];
  }

  /** What a form may attach: still in use, nothing retired. */
  async listActive(): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM Consent_Documents WHERE is_active = 1 ORDER BY display_order, id'
    ).all();
    return results as any[];
  }

  /** What the public policy page shows. */
  async listPublic(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT id, doc_key, title, summary, body_html, version, updated_at
      FROM Consent_Documents
      WHERE is_active = 1 AND show_on_policy_page = 1
      ORDER BY display_order, id
    `).all();
    return results as any[];
  }

  async getById(id: number): Promise<any | null> {
    return await this.db.prepare('SELECT * FROM Consent_Documents WHERE id = ?').bind(id).first();
  }

  async getByKey(key: string): Promise<any | null> {
    if (!isConsentKey(key)) return null;
    return await this.db.prepare('SELECT * FROM Consent_Documents WHERE doc_key = ?').bind(key).first();
  }

  /**
   * One archived version, for showing what was actually agreed to.
   *
   * Falls back to the live document when the version predates the archive —
   * only possible for rows written before 0119 seeded it, and better than
   * showing a reader nothing at all.
   */
  async getVersion(documentId: number, version: number): Promise<any | null> {
    const archived = await this.db.prepare(
      'SELECT * FROM Consent_Document_Versions WHERE document_id = ? AND version = ?'
    ).bind(documentId, version).first();
    return archived ?? await this.getById(documentId);
  }

  async listVersions(documentId: number): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT id, version, title, summary, published_at FROM Consent_Document_Versions WHERE document_id = ? ORDER BY version DESC'
    ).bind(documentId).all();
    return results as any[];
  }

  async create(data: ConsentDocumentInput): Promise<number> {
    const res = await this.db.prepare(`
      INSERT INTO Consent_Documents
        (doc_key, title, summary, body_html, version, is_active, show_on_policy_page, is_required_default, display_order)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).bind(
      data.docKey, data.title, data.summary ?? '', data.bodyHtml ?? '',
      data.isActive === false ? 0 : 1,
      data.showOnPolicyPage === false ? 0 : 1,
      data.isRequiredDefault ? 1 : 0,
      data.displayOrder ?? 0,
    ).run();
    const id = res.meta.last_row_id as number;
    // Archived immediately, so the very first consent given against it can be
    // resolved the same way as every later one.
    await this.archive(id, 1, data.title, data.summary ?? '', data.bodyHtml ?? '', null);
    return id;
  }

  /**
   * Saves an edit, and publishes a new version if the words changed.
   *
   * Only summary and body_html count. A title tidied up, a reorder, a document
   * retired — none of those change what anyone agreed to, and raising the
   * version for them would ask families to consent again to identical wording.
   *
   * Returns the version the document now sits at, so the CRM can say whether
   * an edit published or merely saved.
   */
  async update(id: number, data: ConsentDocumentInput, crmUserId?: number | null): Promise<number | null> {
    const current = await this.getById(id);
    if (!current) return null;

    const summary = data.summary ?? '';
    const bodyHtml = data.bodyHtml ?? '';
    const wordingChanged = summary !== (current.summary ?? '') || bodyHtml !== (current.body_html ?? '');
    const version = wordingChanged ? (current.version as number) + 1 : (current.version as number);

    await this.db.prepare(`
      UPDATE Consent_Documents
         SET doc_key = ?, title = ?, summary = ?, body_html = ?, version = ?,
             is_active = ?, show_on_policy_page = ?, is_required_default = ?, display_order = ?,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
    `).bind(
      data.docKey, data.title, summary, bodyHtml, version,
      data.isActive === false ? 0 : 1,
      data.showOnPolicyPage === false ? 0 : 1,
      data.isRequiredDefault ? 1 : 0,
      data.displayOrder ?? current.display_order ?? 0,
      id,
    ).run();

    if (wordingChanged) {
      await this.archive(id, version, data.title, summary, bodyHtml, crmUserId ?? null);
    }
    return version;
  }

  /**
   * Retires a document rather than deleting it.
   *
   * There is no delete. Every consent already collected points at a version of
   * this document, and a row removed from under those is a consent nobody can
   * produce the wording for. Retired means "no form may attach it from now on".
   */
  async retire(id: number): Promise<void> {
    await this.db.prepare(
      'UPDATE Consent_Documents SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(id).run();
  }

  async restore(id: number): Promise<void> {
    await this.db.prepare(
      'UPDATE Consent_Documents SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(id).run();
  }

  private async archive(
    documentId: number, version: number, title: string, summary: string, bodyHtml: string, crmUserId: number | null,
  ): Promise<void> {
    await this.db.prepare(`
      INSERT OR IGNORE INTO Consent_Document_Versions
        (document_id, version, title, summary, body_html, published_by_crm_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(documentId, version, title, summary, bodyHtml, crmUserId).run();
  }
}

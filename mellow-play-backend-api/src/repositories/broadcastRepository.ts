export interface AudienceFilter {
  /** Everyone who ticked the marketing box at signup. */
  marketingConsent?: boolean;
  /** Everyone who has a booking on these courses/events. */
  courseIds?: number[];
  /** Every registered account, consent or not — staff-only announcements. */
  allMembers?: boolean;
}

export interface AudienceMember {
  user_id: number | null;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export class BroadcastRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  /**
   * Resolves who a broadcast would go to.
   *
   * Deliberately excludes banned accounts, and — for anything but an explicit
   * `allMembers` sweep — anyone who has unsubscribed. `allMembers` is the
   * escape hatch for a genuine service announcement, which is not marketing
   * and which an opt-out does not cover.
   *
   * Returns one row per person even when several filters match them, because
   * "attendees of the June camp" and "opted into marketing" overlap heavily and
   * nobody should get the same mail twice.
   */
  async resolveAudience(filter: AudienceFilter): Promise<AudienceMember[]> {
    const clauses: string[] = [];
    const binds: any[] = [];

    if (filter.allMembers) {
      clauses.push('1 = 1');
    } else {
      if (filter.marketingConsent) clauses.push('COALESCE(u.marketing_consent, 0) = 1');
      if (filter.courseIds?.length) {
        const placeholders = filter.courseIds.map(() => '?').join(',');
        clauses.push(`EXISTS (
          SELECT 1 FROM Bookings b
          JOIN Children ch ON b.child_id = ch.id
          WHERE ch.parent_id = u.id AND b.course_id IN (${placeholders}) AND b.status != 'cancelled'
        )`);
        binds.push(...filter.courseIds);
      }
    }
    if (clauses.length === 0) return [];

    const { results } = await this.db.prepare(`
      SELECT DISTINCT u.id AS user_id,
             (u.first_name || ' ' || u.last_name) AS name,
             u.email, u.phone
      FROM Users u
      WHERE COALESCE(u.is_banned, 0) = 0
        AND (${clauses.join(' OR ')})
      ORDER BY u.id
    `).bind(...binds).all();

    return results as unknown as AudienceMember[];
  }

  async list(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT b.*,
        (SELECT COUNT(*) FROM Broadcast_Recipients r WHERE r.broadcast_id = b.id AND r.status = 'sent')    AS sent_count,
        (SELECT COUNT(*) FROM Broadcast_Recipients r WHERE r.broadcast_id = b.id AND r.status = 'failed')  AS failed_count,
        (SELECT COUNT(*) FROM Broadcast_Recipients r WHERE r.broadcast_id = b.id AND r.status = 'pending') AS pending_count
      FROM Broadcasts b
      ORDER BY b.created_at DESC
    `).all();
    return results;
  }

  async findById(id: number): Promise<any | null> {
    return await this.db.prepare('SELECT * FROM Broadcasts WHERE id = ?').bind(id).first();
  }

  async create(data: {
    name: string; channel: 'email' | 'sms' | 'both';
    subject?: string | null; bodyHtml?: string | null; smsMessage?: string | null;
    audience: AudienceFilter; createdBy?: number | null;
  }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Broadcasts (name, channel, subject, body_html, sms_message, audience_json, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.name, data.channel, data.subject ?? null, data.bodyHtml ?? null,
      data.smsMessage ?? null, JSON.stringify(data.audience), data.createdBy ?? null,
    ).run();
    return result.meta.last_row_id;
  }

  async update(id: number, data: {
    name: string; channel: 'email' | 'sms' | 'both';
    subject?: string | null; bodyHtml?: string | null; smsMessage?: string | null;
    audience: AudienceFilter;
  }): Promise<void> {
    await this.db.prepare(`
      UPDATE Broadcasts SET name = ?, channel = ?, subject = ?, body_html = ?, sms_message = ?, audience_json = ?
      WHERE id = ? AND status = 'draft'
    `).bind(
      data.name, data.channel, data.subject ?? null, data.bodyHtml ?? null,
      data.smsMessage ?? null, JSON.stringify(data.audience), id,
    ).run();
  }

  async remove(id: number): Promise<void> {
    await this.db.batch([
      this.db.prepare('DELETE FROM Broadcast_Recipients WHERE broadcast_id = ?').bind(id),
      this.db.prepare("DELETE FROM Broadcasts WHERE id = ? AND status = 'draft'").bind(id),
    ]);
  }

  /**
   * Freezes the audience into a queue and flips the broadcast to 'sending'.
   *
   * The list is resolved once, here — not on each cron tick. A consent flag
   * flipped or a booking cancelled mid-send must not change who is still due
   * to receive something that is already going out, and staff need to be able
   * to answer "who did this reach?" from rows rather than by re-running a
   * query whose answer has since moved.
   */
  async launch(id: number, members: AudienceMember[]): Promise<number> {
    const broadcast = await this.findById(id);
    if (!broadcast || broadcast.status !== 'draft') return 0;

    const rows: { userId: number | null; name: string | null; email: string | null; phone: string | null; channel: 'email' | 'sms' }[] = [];
    for (const m of members) {
      if ((broadcast.channel === 'email' || broadcast.channel === 'both') && m.email?.trim()) {
        rows.push({ userId: m.user_id, name: m.name, email: m.email.trim(), phone: null, channel: 'email' });
      }
      if ((broadcast.channel === 'sms' || broadcast.channel === 'both') && m.phone?.trim()) {
        rows.push({ userId: m.user_id, name: m.name, email: null, phone: m.phone.trim(), channel: 'sms' });
      }
    }
    if (rows.length === 0) return 0;

    // Chunked because D1 caps how many statements one batch may carry, and a
    // few thousand recipients is an ordinary size for this.
    const CHUNK = 50;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await this.db.batch(rows.slice(i, i + CHUNK).map(r =>
        this.db.prepare(`
          INSERT INTO Broadcast_Recipients (broadcast_id, user_id, name, email, phone, channel)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(id, r.userId, r.name, r.email, r.phone, r.channel)
      ));
    }

    await this.db.prepare(`
      UPDATE Broadcasts SET status = 'sending', total_recipients = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(rows.length, id).run();

    return rows.length;
  }

  // The next slice of work for the cron drain, oldest broadcast first so one
  // huge send cannot starve a small one queued behind it.
  async nextPending(limit: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT r.*, b.subject, b.body_html, b.sms_message, b.name AS broadcast_name
      FROM Broadcast_Recipients r
      JOIN Broadcasts b ON b.id = r.broadcast_id
      WHERE r.status = 'pending' AND b.status = 'sending'
      ORDER BY r.broadcast_id ASC, r.id ASC
      LIMIT ?
    `).bind(limit).all();
    return results;
  }

  async markRecipient(id: number, status: 'sent' | 'failed' | 'skipped', detail?: string | null): Promise<void> {
    await this.db.prepare(
      'UPDATE Broadcast_Recipients SET status = ?, detail = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(status, detail ?? null, id).run();
  }

  // Flips any 'sending' broadcast with nothing left pending to 'sent'.
  async finishDrained(): Promise<void> {
    await this.db.prepare(`
      UPDATE Broadcasts SET status = 'sent', finished_at = CURRENT_TIMESTAMP
      WHERE status = 'sending'
        AND NOT EXISTS (SELECT 1 FROM Broadcast_Recipients r WHERE r.broadcast_id = Broadcasts.id AND r.status = 'pending')
    `).run();
  }

  async cancel(id: number): Promise<void> {
    await this.db.batch([
      this.db.prepare("UPDATE Broadcast_Recipients SET status = 'skipped', detail = 'ยกเลิกโดยผู้ดูแล' WHERE broadcast_id = ? AND status = 'pending'").bind(id),
      this.db.prepare("UPDATE Broadcasts SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('draft','sending')").bind(id),
    ]);
  }

  async recipients(id: number, limit = 500): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM Broadcast_Recipients WHERE broadcast_id = ? ORDER BY id LIMIT ?'
    ).bind(id, limit).all();
    return results;
  }

  /**
   * The recipient's stable unsubscribe token, minted on first use.
   *
   * A token rather than the user id: an id in a link lets anyone unsubscribe
   * anyone by counting upwards, and the link travels through mail servers we
   * do not control.
   */
  async unsubscribeToken(userId: number): Promise<string> {
    const row = await this.db.prepare('SELECT unsubscribe_token FROM Users WHERE id = ?')
      .bind(userId).first<{ unsubscribe_token: string | null }>();
    if (row?.unsubscribe_token) return row.unsubscribe_token;
    const token = crypto.randomUUID().replace(/-/g, '');
    await this.db.prepare('UPDATE Users SET unsubscribe_token = ? WHERE id = ?').bind(token, userId).run();
    return token;
  }

  // Returns false for an unknown token so the page can say so rather than
  // silently claiming success for a mangled link.
  async unsubscribeByToken(token: string): Promise<boolean> {
    const row = await this.db.prepare('SELECT id FROM Users WHERE unsubscribe_token = ?')
      .bind(token).first<{ id: number }>();
    if (!row) return false;
    await this.db.prepare('UPDATE Users SET marketing_consent = 0 WHERE id = ?').bind(row.id).run();
    // Anything still queued for them stops too — an opt-out that only takes
    // effect next campaign is not an opt-out.
    await this.db.prepare(
      "UPDATE Broadcast_Recipients SET status = 'skipped', detail = 'ยกเลิกรับข่าวสารแล้ว' WHERE user_id = ? AND status = 'pending'"
    ).bind(row.id).run();
    return true;
  }
}

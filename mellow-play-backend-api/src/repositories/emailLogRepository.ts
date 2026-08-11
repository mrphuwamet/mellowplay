export type EmailLogType = 'booking_success' | 'reminder' | 'otp' | 'password_reset';

export interface EmailLogEntry {
  bookingId?: number | null;
  courseId?: number | null;
  type: EmailLogType;
  email: string;
  subject: string;
  /**
   * Left null for 'otp' and 'password_reset': those bodies contain a live
   * one-time code, and a log table is the wrong place to keep one.
   */
  bodyHtml?: string | null;
  status: 'sent' | 'failed';
  providerMessageId?: string | null;
  providerDetail?: string | null;
  sentBy?: number | null;
}

// Counterpart to SmsRepository's logging half. Separate table because Sms_Logs
// declares `phone TEXT NOT NULL` and a CHECK on `type`, neither of which
// SQLite/D1 can alter without rebuilding the table — see migration 0072.
export class EmailLogRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async log(entry: EmailLogEntry): Promise<void> {
    await this.db.prepare(`
      INSERT INTO Email_Logs
        (booking_id, course_id, type, email, subject, body_html, status,
         provider_message_id, provider_detail, sent_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      entry.bookingId ?? null,
      entry.courseId ?? null,
      entry.type,
      entry.email,
      entry.subject,
      entry.bodyHtml ?? null,
      entry.status,
      entry.providerMessageId ?? null,
      entry.providerDetail ?? null,
      entry.sentBy ?? null,
    ).run();
  }

  async listByBooking(bookingId: number): Promise<any[]> {
    const { results } = await this.db.prepare(
      'SELECT * FROM Email_Logs WHERE booking_id = ? ORDER BY created_at DESC'
    ).bind(bookingId).all();
    return results as any[];
  }

  // Backs the CRM's send history view. body_html is excluded on purpose: the
  // list only needs to show what was sent to whom and whether it worked, and a
  // full HTML body per row would dwarf everything else in the response.
  async listRecent(limit = 200): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT id, booking_id, course_id, type, email, subject, status,
             provider_message_id, provider_detail, sent_by, created_at
      FROM Email_Logs
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(limit).all();
    return results as any[];
  }
}

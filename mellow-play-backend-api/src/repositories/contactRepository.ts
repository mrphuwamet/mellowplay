export class ContactRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async createMessage(data: {
    userId?: number;
    category: string;
    message: string;
    contactName?: string;
    contactPhone?: string;
  }): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO Contact_Messages (user_id, category, message, contact_name, contact_phone)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      data.userId ?? null,
      data.category,
      data.message,
      data.contactName ?? null,
      data.contactPhone ?? null
    ).run();
    return result.meta.last_row_id;
  }
}

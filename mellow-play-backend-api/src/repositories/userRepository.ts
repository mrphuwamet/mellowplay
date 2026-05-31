export class UserRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async create(phone: string, passwordHash: string, firstName?: string, lastName?: string): Promise<number> {
    const result = await this.db.prepare(
      'INSERT INTO Users (phone, password_hash, first_name, last_name, phone_verified) VALUES (?, ?, ?, ?, 1)'
    ).bind(phone, passwordHash, firstName, lastName).run();
    return result.meta.last_row_id;
  }

  async findByPhone(phone: string): Promise<any> {
    return await this.db.prepare('SELECT * FROM Users WHERE phone = ?')
      .bind(phone)
      .first();
  }

  async getMemberCoupons(childId: number): Promise<any | null> {
    return await this.db.prepare('SELECT * FROM Member_Coupons WHERE child_id = ?').bind(childId).first();
  }

  async updateCouponBalance(childId: number, type: 'little_junior' | 'junior', delta: number): Promise<void> {
    const column = type === 'little_junior' ? 'little_junior_balance' : 'junior_balance';
    await this.db.prepare(`
      INSERT INTO Member_Coupons (child_id, ${column})
      VALUES (?, ?)
      ON CONFLICT(child_id) DO UPDATE SET ${column} = ${column} + excluded.${column}, updated_at = CURRENT_TIMESTAMP
    `).bind(childId, delta).run();
  }

  async findByIdentifier(identifier: string): Promise<any> {
    return await this.db.prepare('SELECT * FROM Users WHERE phone = ? OR email = ?')
      .bind(identifier, identifier)
      .first();
  }

  async createWithChildren(
    phone: string, 
    passwordHash: string, 
    firstName: string, 
    lastName: string, 
    children: Array<{ name: string; dob: string; relation: string }>
  ): Promise<number> {
    // 1. Create User
    const userResult = await this.db.prepare(
      'INSERT INTO Users (phone, password_hash, first_name, last_name, phone_verified) VALUES (?, ?, ?, ?, 1)'
    ).bind(phone, passwordHash, firstName, lastName).run();
    
    const userId = userResult.meta.last_row_id;

    const statements = [];
    // 2. Create Children and their HD Profiles
    for (const child of children) {
      // Note: We need the hdProfileId for the Child record. 
      // This is tricky with auto-increment.
      // We'll do it sequentially for now or use a different strategy.
      // SQLite allows getting last_insert_rowid()
    }
    
    // For simplicity and correctness with auto-increment, let's do children one by one or 
    // use a more complex SQL if needed. Given this is a small number of children, sequential is fine.
    
    for (const child of children) {
      const hdResult = await this.db.prepare(
        'INSERT INTO HD_Profiles (user_id, name, relation, birth_date) VALUES (?, ?, ?, ?)'
      ).bind(userId, child.name, child.relation, child.dob).run();
      
      const hdProfileId = hdResult.meta.last_row_id;

      await this.db.prepare(
        'INSERT INTO Children (parent_id, hd_profile_id) VALUES (?, ?)'
      ).bind(userId, hdProfileId).run();
    }

    return userId;
  }
}

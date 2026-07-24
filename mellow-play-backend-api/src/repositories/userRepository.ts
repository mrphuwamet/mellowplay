import { HDService } from '../services/hdService';
import { AuthService } from '../services/authService';

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

  async findById(id: number): Promise<any> {
    return await this.db.prepare('SELECT * FROM Users WHERE id = ?')
      .bind(id)
      .first();
  }

  async updatePhone(userId: number, phone: string): Promise<void> {
    await this.db.prepare('UPDATE Users SET phone = ?, phone_verified = 1 WHERE id = ?')
      .bind(phone, userId)
      .run();
  }

  async updateAvatar(userId: number, avatarUrl: string): Promise<void> {
    await this.db.prepare('UPDATE Users SET profile_image_url = ? WHERE id = ?')
      .bind(avatarUrl, userId)
      .run();
  }

  async unlinkGoogleId(userId: number): Promise<void> {
    await this.db.prepare('UPDATE Users SET google_id = NULL WHERE id = ?')
      .bind(userId)
      .run();
  }

  async updatePassword(phone: string, passwordHash: string): Promise<void> {
    await this.db.prepare('UPDATE Users SET password_hash = ? WHERE phone = ?')
      .bind(passwordHash, phone)
      .run();
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

  async findByGoogleId(googleId: string): Promise<any> {
    return await this.db.prepare('SELECT * FROM Users WHERE google_id = ?')
      .bind(googleId)
      .first();
  }

  async findByEmail(email: string): Promise<any> {
    return await this.db.prepare('SELECT * FROM Users WHERE email = ?')
      .bind(email)
      .first();
  }

  async linkGoogleId(userId: number, googleId: string): Promise<void> {
    await this.db.prepare('UPDATE Users SET google_id = ? WHERE id = ?')
      .bind(googleId, userId)
      .run();
  }

  // Moves coupon balance between two children — restricted to siblings under
  // the SAME parent account, verified server-side against the requester's
  // own JWT userId rather than trusting the client's claimed ownership.
  async transferChildCoupon(
    fromChildId: number,
    toChildId: number,
    couponTypeId: number,
    quantity: number,
    requestingUserId: number
  ): Promise<{ success: boolean; message?: string }> {
    if (fromChildId === toChildId) {
      return { success: false, message: 'Cannot transfer to the same child' };
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { success: false, message: 'Invalid quantity' };
    }

    const { results: children } = await this.db.prepare(
      `SELECT id, parent_id FROM Children WHERE id IN (?, ?)`
    ).bind(fromChildId, toChildId).all<{ id: number; parent_id: number }>();

    if (children.length !== 2 || children.some(c => c.parent_id !== requestingUserId)) {
      return { success: false, message: 'Both children must belong to your account' };
    }

    const fromBalance = await this.db.prepare(
      `SELECT balance FROM ChildCoupons WHERE child_id = ? AND coupon_type_id = ?`
    ).bind(fromChildId, couponTypeId).first<{ balance: number }>();

    if (!fromBalance || fromBalance.balance < quantity) {
      return { success: false, message: 'Insufficient coupon balance' };
    }

    await this.db.batch([
      this.db.prepare(
        `UPDATE ChildCoupons SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE child_id = ? AND coupon_type_id = ?`
      ).bind(quantity, fromChildId, couponTypeId),
      this.db.prepare(`
        INSERT INTO ChildCoupons (child_id, coupon_type_id, balance)
        VALUES (?, ?, ?)
        ON CONFLICT(child_id, coupon_type_id) DO UPDATE SET balance = balance + excluded.balance, updated_at = CURRENT_TIMESTAMP
      `).bind(toChildId, couponTypeId, quantity),
    ]);

    return { success: true };
  }

  async countChildren(userId: number): Promise<number> {
    const row = await this.db.prepare('SELECT COUNT(*) as cnt FROM Children WHERE parent_id = ?')
      .bind(userId)
      .first<{ cnt: number }>();
    return row?.cnt || 0;
  }

  async createFromGoogle(googleId: string, email: string, firstName?: string, lastName?: string): Promise<number> {
    const passwordHash = await AuthService.hashPassword(crypto.randomUUID());
    const result = await this.db.prepare(
      'INSERT INTO Users (google_id, email, password_hash, first_name, last_name, phone_verified) VALUES (?, ?, ?, ?, ?, 0)'
    ).bind(googleId, email, passwordHash, firstName || null, lastName || null).run();
    return result.meta.last_row_id;
  }

  async createWithChildren(
    phone: string,
    passwordHash: string,
    firstName: string,
    lastName: string,
    children: Array<{ name: string; dob: string; relation: string; nickname: string; gender: string }>,
    email?: string,
    lineId?: string,
    pdpaConsent: boolean = false,
    marketingConsent: boolean = false,
    address?: string,
    prefix?: string,
    dob?: string,
    firstNameEn?: string,
    lastNameEn?: string
  ): Promise<number> {
    // 1. Create User
    const userResult = await this.db.prepare(
      'INSERT INTO Users (phone, password_hash, prefix, first_name, last_name, first_name_en, last_name_en, dob, email, line_id, pdpa_consent, marketing_consent, address, phone_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).bind(phone, passwordHash, prefix || null, firstName, lastName, firstNameEn || null, lastNameEn || null, dob || null, email || null, lineId || null, pdpaConsent ? 1 : 0, marketingConsent ? 1 : 0, address || null).run();

    const userId = userResult.meta.last_row_id;
    const hdService = new HDService(''); // Empty API key forces mock calculation

    // 2. Create Children and their HD Profiles
    for (const child of children) {
      let hdType = 'Generator';
      let hdProfile = '6/2';
      let centersJson = JSON.stringify(['ajna', 'sacral']);

      try {
        const chart = await hdService.calculateChart({
          birthdate: child.dob,
          birthtime: '12:00',
          lat: 13.7563,
          lng: 100.5018
        });
        hdType = chart.data.type;
        hdProfile = chart.data.profile;
        centersJson = JSON.stringify(chart.data.centers);
      } catch (err) {
        console.error('Failed to calculate HD chart at child registration:', err);
      }

      const hdResult = await this.db.prepare(`
        INSERT INTO HD_Profiles (user_id, name, nickname, gender, relation, birth_date, hd_type, hd_profile, centers_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(userId, child.name, child.nickname, child.gender, child.relation, child.dob, hdType, hdProfile, centersJson).run();

      const hdProfileId = hdResult.meta.last_row_id;

      await this.db.prepare(
        'INSERT INTO Children (parent_id, hd_profile_id) VALUES (?, ?)'
      ).bind(userId, hdProfileId).run();
    }

    return userId;
  }

  async addSingleChild(
    userId: number,
    child: { name: string; dob: string; relation: string; nickname: string; gender: string }
  ): Promise<number> {
    const hdService = new HDService(''); // Empty API key forces mock calculation

    let hdType = 'Generator';
    let hdProfile = '6/2';
    let centersJson = JSON.stringify(['ajna', 'sacral']);

    try {
      const chart = await hdService.calculateChart({
        birthdate: child.dob,
        birthtime: '12:00',
        lat: 13.7563,
        lng: 100.5018
      });
      hdType = chart.data.type;
      hdProfile = chart.data.profile;
      centersJson = JSON.stringify(chart.data.centers);
    } catch (err) {
      console.error('Failed to calculate HD chart at child registration:', err);
    }

    const hdResult = await this.db.prepare(`
      INSERT INTO HD_Profiles (user_id, name, nickname, gender, relation, birth_date, hd_type, hd_profile, centers_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(userId, child.name, child.nickname, child.gender, child.relation, child.dob, hdType, hdProfile, centersJson).run();

    const hdProfileId = hdResult.meta.last_row_id;

    // Random default avatar (char-1..char-6, matching src/assets/charactor-mp
    // in the consumer app) so new children don't all start on the same one.
    const randomAvatar = `char-${Math.floor(Math.random() * 6) + 1}`;

    const childResult = await this.db.prepare(
      'INSERT INTO Children (parent_id, hd_profile_id, avatar) VALUES (?, ?, ?)'
    ).bind(userId, hdProfileId, randomAvatar).run();

    return childResult.meta.last_row_id;
  }
}

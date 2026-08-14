import { HDService } from '../services/hdService';
import { AuthService } from '../services/authService';

export class UserRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // A soft, non-blocking check — the record still gets written either way,
  // this just gives the caller enough to show staff/the registering user a
  // "this name already exists" warning. Covers every place a real full name
  // lives (account holders, HD-registered children, CRM walk-in children) —
  // nicknames don't count, only the real name people are legally known by.
  async checkDuplicateFullName(
    fullName: string,
    exclude: { userId?: number; hdProfileId?: number; crmChildId?: number } = {}
  ): Promise<Array<{ type: 'user' | 'child'; id: number; name: string }>> {
    const normalized = fullName.trim().replace(/\s+/g, ' ');
    if (!normalized) return [];

    const matches: Array<{ type: 'user' | 'child'; id: number; name: string }> = [];

    const userQuery = exclude.userId
      ? `SELECT id, first_name, last_name FROM Users WHERE LOWER(TRIM(first_name) || ' ' || TRIM(last_name)) = LOWER(?) AND id != ? AND deleted_at IS NULL`
      : `SELECT id, first_name, last_name FROM Users WHERE LOWER(TRIM(first_name) || ' ' || TRIM(last_name)) = LOWER(?) AND deleted_at IS NULL`;
    const userBind = exclude.userId ? [normalized, exclude.userId] : [normalized];
    const { results: userMatches } = await this.db.prepare(userQuery).bind(...userBind).all();
    for (const u of (userMatches || []) as any[]) {
      matches.push({ type: 'user', id: u.id, name: `${u.first_name} ${u.last_name}` });
    }

    const hdQuery = exclude.hdProfileId
      ? `SELECT id, name FROM HD_Profiles WHERE LOWER(TRIM(name)) = LOWER(?) AND COALESCE(is_deleted, 0) = 0 AND id != ?`
      : `SELECT id, name FROM HD_Profiles WHERE LOWER(TRIM(name)) = LOWER(?) AND COALESCE(is_deleted, 0) = 0`;
    const hdBind = exclude.hdProfileId ? [normalized, exclude.hdProfileId] : [normalized];
    const { results: hdMatches } = await this.db.prepare(hdQuery).bind(...hdBind).all();
    for (const c of (hdMatches || []) as any[]) {
      matches.push({ type: 'child', id: c.id, name: c.name });
    }

    const crmChildQuery = exclude.crmChildId
      ? `SELECT id, full_name FROM User_CRM_Children WHERE LOWER(TRIM(full_name)) = LOWER(?) AND id != ?`
      : `SELECT id, full_name FROM User_CRM_Children WHERE LOWER(TRIM(full_name)) = LOWER(?)`;
    const crmChildBind = exclude.crmChildId ? [normalized, exclude.crmChildId] : [normalized];
    const { results: crmChildMatches } = await this.db.prepare(crmChildQuery).bind(...crmChildBind).all();
    for (const c of (crmChildMatches || []) as any[]) {
      matches.push({ type: 'child', id: c.id, name: c.full_name });
    }

    return matches;
  }

  async create(phone: string, passwordHash: string, firstName?: string, lastName?: string): Promise<number> {
    const result = await this.db.prepare(
      'INSERT INTO Users (phone, password_hash, first_name, last_name, phone_verified) VALUES (?, ?, ?, ?, 1)'
    ).bind(phone, passwordHash, firstName, lastName).run();
    return result.meta.last_row_id;
  }

  async findByPhone(phone: string): Promise<any> {
    // Every lookup that can lead to a session filters deleted accounts out.
    // Refusing at login would be a second rule to keep in step; not finding
    // the row is the same answer everywhere, including Google sign-in and the
    // "is this phone taken" check.
    return await this.db.prepare('SELECT * FROM Users WHERE phone = ? AND deleted_at IS NULL')
      .bind(phone)
      .first();
  }

  async findById(id: number): Promise<any> {
    return await this.db.prepare('SELECT * FROM Users WHERE id = ? AND deleted_at IS NULL')
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
    return await this.db.prepare('SELECT * FROM Users WHERE (phone = ? OR email = ?) AND deleted_at IS NULL')
      .bind(identifier, identifier)
      .first();
  }

  async findByGoogleId(googleId: string): Promise<any> {
    return await this.db.prepare('SELECT * FROM Users WHERE google_id = ? AND deleted_at IS NULL')
      .bind(googleId)
      .first();
  }

  async findByEmail(email: string): Promise<any> {
    return await this.db.prepare('SELECT * FROM Users WHERE email = ? AND deleted_at IS NULL')
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
    children: Array<{ name: string; nameEn?: string; dob: string; relation: string; nickname: string; gender: string }>,
    email?: string,
    lineId?: string,
    pdpaConsent: boolean = false,
    marketingConsent: boolean = false,
    address?: string,
    prefix?: string,
    dob?: string,
    firstNameEn?: string,
    lastNameEn?: string,
    relationship?: string
  ): Promise<number> {
    // 1. Create User
    const userResult = await this.db.prepare(
      'INSERT INTO Users (phone, password_hash, prefix, first_name, last_name, first_name_en, last_name_en, dob, email, line_id, pdpa_consent, marketing_consent, address, relationship, phone_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).bind(phone, passwordHash, prefix || null, firstName, lastName, firstNameEn || null, lastNameEn || null, dob || null, email || null, lineId || null, pdpaConsent ? 1 : 0, marketingConsent ? 1 : 0, address || null, relationship || null).run();

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
        INSERT INTO HD_Profiles (user_id, name, name_en, nickname, gender, relation, birth_date, hd_type, hd_profile, centers_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(userId, child.name, child.nameEn || null, child.nickname, child.gender, child.relation, child.dob, hdType, hdProfile, centersJson).run();

      const hdProfileId = hdResult.meta.last_row_id;

      await this.db.prepare(
        'INSERT INTO Children (parent_id, hd_profile_id) VALUES (?, ?)'
      ).bind(userId, hdProfileId).run();
    }

    return userId;
  }

  async addSingleChild(
    userId: number,
    child: { name: string; nameEn?: string; dob: string; relation: string; nickname: string; gender: string }
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
      INSERT INTO HD_Profiles (user_id, name, name_en, nickname, gender, relation, birth_date, hd_type, hd_profile, centers_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(userId, child.name, child.nameEn || null, child.nickname, child.gender, child.relation, child.dob, hdType, hdProfile, centersJson).run();

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

import { HDService } from '../services/hdService';

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
    children: Array<{ name: string; dob: string; relation: string; nickname?: string; gender?: string }>,
    email?: string,
    lineId?: string,
    pdpaConsent: boolean = false,
    marketingConsent: boolean = false,
    address?: string
  ): Promise<number> {
    // 1. Create User
    const userResult = await this.db.prepare(
      'INSERT INTO Users (phone, password_hash, first_name, last_name, email, line_id, pdpa_consent, marketing_consent, address, phone_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).bind(phone, passwordHash, firstName, lastName, email || null, lineId || null, pdpaConsent ? 1 : 0, marketingConsent ? 1 : 0, address || null).run();
    
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
      `).bind(userId, child.name, child.nickname || null, child.gender || null, child.relation, child.dob, hdType, hdProfile, centersJson).run();
      
      const hdProfileId = hdResult.meta.last_row_id;

      await this.db.prepare(
        'INSERT INTO Children (parent_id, hd_profile_id) VALUES (?, ?)'
      ).bind(userId, hdProfileId).run();
    }

    return userId;
  }

  async addSingleChild(
    userId: number,
    child: { name: string; dob: string; relation: string; nickname?: string; gender?: string }
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
    `).bind(userId, child.name, child.nickname || null, child.gender || null, child.relation, child.dob, hdType, hdProfile, centersJson).run();
    
    const hdProfileId = hdResult.meta.last_row_id;

    const childResult = await this.db.prepare(
      'INSERT INTO Children (parent_id, hd_profile_id) VALUES (?, ?)'
    ).bind(userId, hdProfileId).run();

    return childResult.meta.last_row_id;
  }
}

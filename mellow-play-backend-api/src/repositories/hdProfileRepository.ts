import { HDProfile } from '../types/hd';

export class HDProfileRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async create(data: Partial<HDProfile>): Promise<number> {
    const result = await this.db.prepare(`
      INSERT INTO HD_Profiles (
        user_id, name, relation, birth_date, birth_time, birth_place, birth_lat, birth_lng,
        birth_date_utc, hd_type, hd_profile, hd_strategy, hd_authority, hd_incarnation_cross,
        hd_definition, hd_signature, hd_not_self_theme, hd_cognition, hd_determination,
        hd_variables, hd_motivation, hd_transference, hd_perspective, hd_distraction,
        hd_environment, hd_circuitries, centers_json, channels_short_json, channels_long_json,
        gates_json, activations_design_json, activations_personality_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.user_id, data.name, data.relation,
      data.birth_date, data.birth_time, data.birth_place, data.birth_lat, data.birth_lng,
      data.birth_date_utc, data.hd_type, data.hd_profile, data.hd_strategy,
      data.hd_authority, data.hd_incarnation_cross, data.hd_definition,
      data.hd_signature, data.hd_not_self_theme, data.hd_cognition,
      data.hd_determination, data.hd_variables, data.hd_motivation,
      data.hd_transference, data.hd_perspective, data.hd_distraction,
      data.hd_environment, data.hd_circuitries, data.centers_json,
      data.channels_short_json, data.channels_long_json, data.gates_json,
      data.activations_design_json, data.activations_personality_json
    ).run();
    return result.meta.last_row_id;
  }

  async findByUserId(userId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT
        h.*,
        c.id as child_id,
        c.current_level,
        c.avatar,
        c.custom_photo_url,
        c.membership_type,
        c.membership_expires_at,
        COALESCE(mc.little_junior_balance, 0) as little_junior_balance,
        COALESCE(mc.junior_balance, 0) as junior_balance,
        (
          SELECT json_group_array(json_object(
            'id', ct.id,
            'name', ct.name,
            'color', ct.color,
            'icon_url', ct.icon_url,
            'balance', cc.balance,
            'total_earned', cc.total_earned
          ))
          FROM ChildCoupons cc
          JOIN CouponTypes ct ON cc.coupon_type_id = ct.id
          WHERE cc.child_id = c.id AND (cc.balance > 0 OR cc.total_earned > 0)
        ) as coupons_json
      FROM HD_Profiles h
      LEFT JOIN Children c ON h.id = c.hd_profile_id
      LEFT JOIN Member_Coupons mc ON c.id = mc.child_id
      WHERE h.user_id = ?
    `)
      .bind(userId)
      .all<any>();
      
    return results.map(r => ({
      ...r,
      coupons: r.coupons_json ? JSON.parse(r.coupons_json) : []
    }));
  }

  async updateAvatar(childId: number, avatar: string): Promise<boolean> {
    const result = await this.db.prepare(`
      UPDATE Children SET avatar = ? WHERE id = ?
    `).bind(avatar, childId).run();

    return result.success;
  }

  // Persists the uploaded photo separately from the currently-active `avatar`
  // so it survives switching to a character avatar and back.
  async updateCustomPhoto(childId: number, url: string): Promise<boolean> {
    const result = await this.db.prepare(`
      UPDATE Children SET custom_photo_url = ? WHERE id = ?
    `).bind(url, childId).run();
    return result.success;
  }

  async deleteCustomPhoto(childId: number, fallbackAvatar: string = 'char-1'): Promise<boolean> {
    const child = await this.db.prepare(
      `SELECT avatar, custom_photo_url FROM Children WHERE id = ?`
    ).bind(childId).first<{ avatar: string | null; custom_photo_url: string | null }>();
    if (!child) return false;

    const isActive = !!child.avatar && child.avatar === child.custom_photo_url;
    const result = await this.db.prepare(
      isActive
        ? `UPDATE Children SET custom_photo_url = NULL, avatar = ? WHERE id = ?`
        : `UPDATE Children SET custom_photo_url = NULL WHERE id = ?`
    ).bind(...(isActive ? [fallbackAvatar, childId] : [childId])).run();

    return result.success;
  }

  async updateChildProfile(childId: number, name: string, nickname: string, birth_date: string, relation: string, gender: string = ""): Promise<boolean> {
    // First find the hd_profile_id from Children
    const child = await this.db.prepare(`SELECT hd_profile_id FROM Children WHERE id = ?`).bind(childId).first<{ hd_profile_id: number }>();
    if (!child) return false;

    const result = await this.db.prepare(`
      UPDATE HD_Profiles SET name = ?, nickname = ?, birth_date = ?, relation = ?, gender = ? WHERE id = ?
    `).bind(name, nickname, birth_date, relation, gender, child.hd_profile_id).run();
    
    return result.success;
  }
}

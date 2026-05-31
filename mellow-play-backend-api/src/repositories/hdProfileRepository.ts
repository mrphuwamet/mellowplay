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

  async findByUserId(userId: number): Promise<HDProfile[]> {
    const { results } = await this.db.prepare('SELECT * FROM HD_Profiles WHERE user_id = ?')
      .bind(userId)
      .all<HDProfile>();
    return results;
  }
}

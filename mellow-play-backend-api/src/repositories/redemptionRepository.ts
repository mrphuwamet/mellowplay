export class RedemptionRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async createRedemption(data: {
    childId: number;
    rewardName: string;
    stampCost: number;
    ageGroup: 'little_junior' | 'junior';
    claimCode: string;
  }): Promise<number> {
    const couponColumn = data.ageGroup === 'little_junior' ? 'little_junior_balance' : 'junior_balance';

    // 1. Verify coupon balance
    const balance = await this.db.prepare(`SELECT ${couponColumn} FROM Member_Coupons WHERE child_id = ?`)
      .bind(data.childId)
      .first() as any;

    if (!balance || (balance[couponColumn] as number) < data.stampCost) {
      throw new Error('Insufficient stamps for this child');
    }

    // 2. Deduct coupons
    await this.db.prepare(`
      UPDATE Member_Coupons 
      SET ${couponColumn} = ${couponColumn} - ?, updated_at = CURRENT_TIMESTAMP 
      WHERE child_id = ?
    `).bind(data.stampCost, data.childId).run();

    // 3. Create redemption record
    const result = await this.db.prepare(`
      INSERT INTO Redemptions (child_id, reward_name, stamp_cost, claim_code, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).bind(data.childId, data.rewardName, data.stampCost, data.claimCode).run();

    const redemptionId = result.meta.last_row_id;

    // 4. Log Transaction
    const parentQuery = await this.db.prepare('SELECT parent_id FROM Children WHERE id=?').bind(data.childId).first() as any;
    const userId = parentQuery?.parent_id ?? null;

    await this.db.prepare(`
      INSERT INTO Transactions (branch_id, user_id, child_id, type, amount, payment_method, item_type, quantity)
      VALUES (1, ?, ?, 'reward_redemption', 0, 'coupon', ?, ?)
    `).bind(userId, data.childId, data.ageGroup, data.stampCost).run();

    return redemptionId;
  }

  async getRedemptionsByChild(childId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT * FROM Redemptions 
      WHERE child_id = ? 
      ORDER BY created_at DESC
    `).bind(childId).all();
    return results;
  }

  async getPendingRedemptions(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT r.*, hp.name as child_name, u.phone as parent_phone, u.first_name || ' ' || u.last_name as parent_name
      FROM Redemptions r
      LEFT JOIN Children c ON r.child_id = c.id
      LEFT JOIN HD_Profiles hp ON c.hd_profile_id = hp.id
      LEFT JOIN Users u ON c.parent_id = u.id
      ORDER BY r.created_at DESC
    `).all();
    return results;
  }

  async claimRedemption(id: number): Promise<void> {
    await this.db.prepare(`
      UPDATE Redemptions 
      SET status = 'claimed', claimed_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND status = 'pending'
    `).bind(id).run();
  }
}

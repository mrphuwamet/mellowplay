import { AuthService } from '../services/authService';

export interface InviteAccessLink {
  id: number;
  token: string;
  label: string | null;
  pin_hash: string;
  course_id: number;
  calendar_slot_rule_id: number;
  expires_at: string | null;
  is_revoked: number;
  created_by_crm_user_id: number | null;
  created_at: string;
}

// Not revoked and (if set) not past its own expiry — same shape as
// isCheckinLinkUsable, checked both at PIN entry and again server-side at
// booking time, so revoking a leaked link takes effect immediately.
export function isInviteLinkUsable(link: InviteAccessLink | null | undefined): boolean {
  if (!link || link.is_revoked) return false;
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return false;
  return true;
}

export class InviteAccessLinkRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async create(
    label: string | null, pin: string, courseId: number, calendarSlotRuleId: number,
    expiresAt: string | null, createdByCrmUserId: number | null
  ): Promise<{ id: number; token: string }> {
    const token = crypto.randomUUID();
    const pinHash = await AuthService.hashPassword(pin);
    const result = await this.db.prepare(
      'INSERT INTO Invite_Access_Links (token, label, pin_hash, course_id, calendar_slot_rule_id, expires_at, created_by_crm_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(token, label, pinHash, courseId, calendarSlotRuleId, expiresAt, createdByCrmUserId).run();
    return { id: result.meta.last_row_id as number, token };
  }

  async listForRule(calendarSlotRuleId: number): Promise<Omit<InviteAccessLink, 'pin_hash'>[]> {
    const { results } = await this.db.prepare(
      'SELECT id, token, label, course_id, calendar_slot_rule_id, expires_at, is_revoked, created_at FROM Invite_Access_Links WHERE calendar_slot_rule_id = ? ORDER BY created_at DESC'
    ).bind(calendarSlotRuleId).all();
    return results as any[];
  }

  async findByToken(token: string): Promise<InviteAccessLink | null> {
    return await this.db.prepare('SELECT * FROM Invite_Access_Links WHERE token = ?').bind(token).first() as any;
  }

  async findById(id: number): Promise<InviteAccessLink | null> {
    return await this.db.prepare('SELECT * FROM Invite_Access_Links WHERE id = ?').bind(id).first() as any;
  }

  async revoke(id: number): Promise<void> {
    await this.db.prepare('UPDATE Invite_Access_Links SET is_revoked = 1 WHERE id = ?').bind(id).run();
  }
}

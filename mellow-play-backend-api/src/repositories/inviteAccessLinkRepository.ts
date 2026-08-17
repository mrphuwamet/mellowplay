import { AuthService } from '../services/authService';

export interface InviteAccessLink {
  id: number;
  token: string;
  /** The short, readable address for the same link. */
  short_code: string | null;
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
/** True when this link lets someone straight through without a PIN. */
export function isInviteLinkOpen(link: InviteAccessLink | null | undefined): boolean {
  return !!link && !link.pin_hash;
}

export function isInviteLinkUsable(link: InviteAccessLink | null | undefined): boolean {
  if (!link || link.is_revoked) return false;
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return false;
  return true;
}

export class InviteAccessLinkRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async create(
    label: string | null, pin: string | null, courseId: number, calendarSlotRuleId: number,
    expiresAt: string | null, createdByCrmUserId: number | null
  ): Promise<{ id: number; token: string; shortCode: string }> {
    const token = crypto.randomUUID();
    // No PIN means an empty hash, which nothing can match — see migration 0093.
    const pinHash = pin ? await AuthService.hashPassword(pin) : '';
    const shortCode = await this.generateShortCode();
    const result = await this.db.prepare(
      'INSERT INTO Invite_Access_Links (token, short_code, label, pin_hash, course_id, calendar_slot_rule_id, expires_at, created_by_crm_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(token, shortCode, label, pinHash, courseId, calendarSlotRuleId, expiresAt, createdByCrmUserId).run();
    return { id: result.meta.last_row_id as number, token, shortCode };
  }

  // 6 characters from a 32-letter alphabet is ~1 in a billion per guess, and
  // the link is scoped to one round of one course even if guessed. Retried on
  // collision rather than assumed unique — the index is the real guarantee.
  private async generateShortCode(): Promise<string> {
    const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    for (let attempt = 0; attempt < 8; attempt++) {
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      const code = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
      const existing = await this.db.prepare('SELECT id FROM Invite_Access_Links WHERE short_code = ?').bind(code).first();
      if (!existing) return code;
    }
    // Vanishingly unlikely; fall back to something guaranteed unique rather
    // than failing to create the link at all.
    return crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
  }

  async listForRule(calendarSlotRuleId: number): Promise<Omit<InviteAccessLink, 'pin_hash'>[]> {
    const { results } = await this.db.prepare(
      `SELECT id, token, short_code, label, course_id, calendar_slot_rule_id, expires_at, is_revoked, created_at,
              (pin_hash != '') AS requires_pin
       FROM Invite_Access_Links WHERE calendar_slot_rule_id = ? ORDER BY created_at DESC`
    ).bind(calendarSlotRuleId).all();
    return results as any[];
  }

  // Accepts either address: the original UUID, or the short code. One lookup
  // rather than two call sites deciding which kind of string they were handed.
  async findByToken(token: string): Promise<InviteAccessLink | null> {
    return await this.db.prepare(
      'SELECT * FROM Invite_Access_Links WHERE token = ? OR short_code = ?'
    ).bind(token, token.toUpperCase()).first() as any;
  }

  async findById(id: number): Promise<InviteAccessLink | null> {
    return await this.db.prepare('SELECT * FROM Invite_Access_Links WHERE id = ?').bind(id).first() as any;
  }

  async revoke(id: number): Promise<void> {
    await this.db.prepare('UPDATE Invite_Access_Links SET is_revoked = 1 WHERE id = ?').bind(id).run();
  }
}

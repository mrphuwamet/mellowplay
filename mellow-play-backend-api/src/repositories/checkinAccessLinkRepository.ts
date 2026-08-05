import { AuthService } from '../services/authService';

export interface CheckinAccessLink {
  id: number;
  token: string;
  label: string | null;
  pin_hash: string;
  expires_at: string | null;
  is_revoked: number;
  created_by_crm_user_id: number | null;
  created_at: string;
}

// Not revoked and (if set) not past its own expiry — checked both when a
// volunteer's device first enters the PIN and on every request the 24h
// session token is used for, so revoking or an expiry passing takes effect
// immediately regardless of how long is left on that session.
export function isCheckinLinkUsable(link: CheckinAccessLink | null | undefined): boolean {
  if (!link || link.is_revoked) return false;
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return false;
  return true;
}

export class CheckinAccessLinkRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async create(label: string | null, pin: string, expiresAt: string | null, createdByCrmUserId: number | null): Promise<{ id: number; token: string }> {
    const token = crypto.randomUUID();
    const pinHash = await AuthService.hashPassword(pin);
    const result = await this.db.prepare(
      'INSERT INTO Checkin_Access_Links (token, label, pin_hash, expires_at, created_by_crm_user_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(token, label, pinHash, expiresAt, createdByCrmUserId).run();
    return { id: result.meta.last_row_id as number, token };
  }

  async list(): Promise<Omit<CheckinAccessLink, 'pin_hash'>[]> {
    const { results } = await this.db.prepare(
      'SELECT id, token, label, expires_at, is_revoked, created_at FROM Checkin_Access_Links ORDER BY created_at DESC'
    ).all();
    return results as any[];
  }

  async findByToken(token: string): Promise<CheckinAccessLink | null> {
    return await this.db.prepare('SELECT * FROM Checkin_Access_Links WHERE token = ?').bind(token).first() as any;
  }

  async findById(id: number): Promise<CheckinAccessLink | null> {
    return await this.db.prepare('SELECT * FROM Checkin_Access_Links WHERE id = ?').bind(id).first() as any;
  }

  async revoke(id: number): Promise<void> {
    await this.db.prepare('UPDATE Checkin_Access_Links SET is_revoked = 1 WHERE id = ?').bind(id).run();
  }
}

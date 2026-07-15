export class SettingsRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async getSetting(key: string): Promise<string | null> {
    const result = await this.db.prepare('SELECT value FROM System_Settings WHERE key = ?')
      .bind(key)
      .first<{ value: string }>();
    return result ? result.value : null;
  }

  async isOtpEnabled(): Promise<boolean> {
    const value = await this.getSetting('otp_enabled');
    return value === '1';
  }

  // Lets a super admin override a Cloudflare secret (Beam/SMS credentials)
  // from the CRM's Settings page without redeploying — falls back to the
  // Worker env/secret binding when nothing has been set in the DB.
  async getOverridable(key: string, envFallback: string): Promise<string> {
    const value = await this.getSetting(key);
    return value && value.trim() ? value : envFallback;
  }
}

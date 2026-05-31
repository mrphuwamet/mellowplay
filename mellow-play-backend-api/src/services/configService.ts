import { Bindings } from '../types/env';

export class ConfigService {
  private env: Bindings;

  constructor(env: Bindings) {
    this.env = env;
  }

  get hdApiKey(): string {
    return this.env.HD_API_KEY;
  }

  get hdGeocodeKey(): string {
    return this.env.HD_GEOCODE_KEY;
  }

  get smsApiKey(): string {
    return this.env.SMS_API_KEY;
  }

  get smsApiSecret(): string {
    return this.env.SMS_API_SECRET;
  }

  get jwtSecret(): string {
    return this.env.JWT_SECRET;
  }

  get db(): D1Database {
    return this.env.DB;
  }

  get kv(): KVNamespace {
    return this.env.OTP_KV;
  }

  get bucket(): R2Bucket {
    return this.env.BUCKET;
  }

  /**
   * Helper to check if we are running in local dev mode
   */
  get isDev(): boolean {
    return this.env.ENVIRONMENT === 'development';
  }
}

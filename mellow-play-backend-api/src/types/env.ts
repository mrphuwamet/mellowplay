export interface Bindings {
  DB: D1Database;
  OTP_KV: KVNamespace;
  BUCKET: R2Bucket;
  JWT_SECRET: string;
  HD_API_KEY: string;
  HD_GEOCODE_KEY: string;
  ENVIRONMENT: string;
  SMS_API_KEY: string;
  SMS_API_SECRET: string;
}

export type Variables = {
  userId: number;
}

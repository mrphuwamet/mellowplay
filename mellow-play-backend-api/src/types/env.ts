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
  GOOGLE_CLIENT_ID: string;
  BEAM_API_KEY: string;
  BEAM_MERCHANT_ID: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_AI_API_KEY?: string;
  LINE_LIFF_ID?: string;
}

export type Variables = {
  userId: number;
  crmUser?: { userId: number; type: string; role: string; branchId: number | null };
}

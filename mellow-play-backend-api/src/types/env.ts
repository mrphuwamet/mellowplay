// Cloudflare Email Service's send binding. Typed here rather than taken from
// @cloudflare/workers-types because the version this project pins (4.2024xxxx)
// predates Email Service and only ships the older Email Routing `SendEmail`
// interface, whose send() takes a raw MIME EmailMessage instead of this object.
//
// Optional on Bindings: the binding only exists once the sending domain is
// onboarded in the dashboard, and every send path must degrade to "not
// configured" rather than throw when it is absent.
export interface EmailSendResult {
  messageId: string;
}

export interface SendEmailBinding {
  send(message: {
    to: string | string[];
    from: string;
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string;
    cc?: string | string[];
    bcc?: string | string[];
    headers?: Record<string, string>;
  }): Promise<EmailSendResult>;
}

export interface Bindings {
  DB: D1Database;
  OTP_KV: KVNamespace;
  BUCKET: R2Bucket;
  EMAIL?: SendEmailBinding;
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
  // Set by Hono's jwt() middleware for consumer-app requests (the CRM side
  // uses `crmUser` instead — see the caller-type logic in index.ts). It was
  // missing from this type, so every `c.get('jwtPayload')` came back as
  // `unknown` and reading `.userId` off it failed to compile: 12 errors in
  // profileController alone. Indexed as `any` beyond userId because the token
  // body is issued in authController and carries claims this type has no
  // reason to enumerate.
  jwtPayload?: { userId: number; [claim: string]: any };
}

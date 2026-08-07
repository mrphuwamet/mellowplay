import { Bindings } from '../types/env';

export class SmsService {
  private apiKey: string;
  private apiSecret: string;
  private senderName: string;
  private apiUrl = 'https://api-v2.thaibulksms.com/sms';

  constructor(apiKey: string, apiSecret: string, senderName: string = 'Demo') {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.senderName = senderName;
  }

  async sendOtp(phone: string, otp: string, ref: string): Promise<boolean> {
    // Standard OTP wording for every flow (registration, forgot-password,
    // phone change) — states the expiry window (must match the 300s KV TTL
    // these OTPs are actually stored with) and warns against sharing it.
    const message = `รหัส OTP สำหรับ Mellow Play ของคุณคือ ${otp} (อ้างอิง: ${ref}) หมดอายุภายใน 5 นาที ห้ามบอกหรือส่งต่อรหัสนี้ให้ผู้อื่น`;
    const result = await this.send(phone, message);
    return result.ok;
  }

  // Used by the CRM's "Test Connection" button — sends a real SMS (costs
  // money, same as any other send) but with a message that reads as a
  // connectivity test rather than a fake OTP, and surfaces the provider's
  // error detail back to the admin instead of just true/false.
  async sendTest(phone: string): Promise<{ ok: boolean; detail?: string }> {
    const message = 'นี่คือข้อความทดสอบการเชื่อมต่อ SMS จากระบบ Mellow Play CRM';
    return this.send(phone, message);
  }

  // Generic send for anything that isn't OTP/connectivity-test — booking
  // confirmations, manual reminders, resent confirmations. Just exposes the
  // already-hardened private send() (timeout + structured result) publicly.
  async sendMessage(phone: string, message: string): Promise<{ ok: boolean; detail?: string }> {
    return this.send(phone, message);
  }

  private async send(phone: string, message: string): Promise<{ ok: boolean; detail?: string }> {
    // A hanging ThaiBulkSMS call used to run until Cloudflare killed the
    // Worker for exceeding its execution limit — the client just saw a raw
    // connection failure (no JSON body, so the frontend can't show a real
    // message) and the code never reached the sendAlert() call below it,
    // so nobody got notified either. Aborting on a timeout guarantees a
    // clean, fast, structured failure response every time instead.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const auth = btoa(`${this.apiKey}:${this.apiSecret}`);
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          'msisdn': phone,
          'message': message,
          'sender': this.senderName,
        }),
        signal: controller.signal,
      });

      const result = await response.json() as any;

      if (response.ok && !result.error) {
        return { ok: true };
      } else {
        console.error('ThaiBulkSMS Error:', result);
        return { ok: false, detail: result?.error?.message || result?.message || JSON.stringify(result) };
      }
    } catch (error: any) {
      const detail = error?.name === 'AbortError' ? 'ThaiBulkSMS did not respond in time' : error.message;
      console.error('SMS Service Error:', error);
      return { ok: false, detail };
    } finally {
      clearTimeout(timeout);
    }
  }
}

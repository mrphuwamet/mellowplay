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
    const message = `รหัส OTP สำหรับ Mellow Play ของคุณคือ ${otp} (อ้างอิง: ${ref})`;
    
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
        })
      });

      const result = await response.json() as any;
      
      if (response.ok && !result.error) {
        return true;
      } else {
        console.error('ThaiBulkSMS Error:', result);
        return false;
      }
    } catch (error) {
      console.error('SMS Service Error:', error);
      return false;
    }
  }
}

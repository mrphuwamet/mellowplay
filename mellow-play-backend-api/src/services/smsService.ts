import { Bindings } from '../types/env';

export class SmsService {
  private apiKey: string;
  private apiSecret: string;
  private apiUrl = 'https://api.thaibulksms.com/v2/sms';

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  async sendOtp(phone: string, otp: string): Promise<boolean> {
    const message = `รหัส OTP สำหรับ Mellow Play ของคุณคือ ${otp} (อ้างอิง: MLPW)`;
    
    // ThaiBulkSMS requires Basic Auth or API Key in body
    // This is a simplified version based on their v2 API
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'key': this.apiKey,
          'secret': this.apiSecret,
          'msisdn': phone,
          'message': message,
          'sender': 'MellowPlay', // Must be approved by ThaiBulkSMS first
          'force': 'standard'
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

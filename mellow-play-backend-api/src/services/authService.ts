import { sign, verify } from 'hono/jwt'

export class AuthService {
  // Generate a random 6-digit OTP
  static generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }

  // Generate a random 4-character uppercase alphanumeric reference code
  static generateRefCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Basic password hashing using Web Crypto API (SubtleCrypto)
  static async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    const hashed = await this.hashPassword(password)
    return hashed === hash
  }

  // --- JWT Methods ---

  static async generateToken(userId: number, secret: string, extraClaims: Record<string, any> = {}): Promise<string> {
    const payload = {
      userId,
      ...extraClaims,
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30), // 30 days expiry
    }
    return await sign(payload, secret, 'HS256')
  }

  static async verifyToken(token: string, secret: string): Promise<any> {
    try {
      return await verify(token, secret, 'HS256')
    } catch (e) {
      return null
    }
  }

  // Verifies a Google ID token via Google's tokeninfo endpoint.
  // Returns the decoded payload (with `sub`, `email`, `given_name`, `family_name`, etc.)
  // if valid and matching the expected client ID, otherwise null.
  static async verifyGoogleIdToken(idToken: string, expectedClientId: string): Promise<any | null> {
    try {
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`)
      if (!res.ok) return null

      const payload = await res.json() as any
      if (payload.aud !== expectedClientId) return null
      if (payload.email_verified !== 'true' && payload.email_verified !== true) return null

      return payload
    } catch (e) {
      return null
    }
  }
}

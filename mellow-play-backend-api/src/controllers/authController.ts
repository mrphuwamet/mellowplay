import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { AuthService } from '../services/authService';
import { ConfigService } from '../services/configService';
import { SmsService } from '../services/smsService';
import { UserRepository } from '../repositories/userRepository';
import { SettingsRepository } from '../repositories/settingsRepository';
import { sendAlert, sendNotification } from '../services/alertService';
import { enforceOtpRequestLimit, enforceOtpVerifyLimit, clearOtpVerifyAttempts } from '../services/otpRateLimiter';

export class AuthController {
  async requestOtp(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const settingsRepo = new SettingsRepository(config.db);
      
      const { phone, email } = await c.req.json();
      
      const userRepository = new UserRepository(config.db);
      
      const existingPhoneUser = await userRepository.findByIdentifier(phone);
      if (existingPhoneUser && existingPhoneUser.phone === phone) {
        return c.json({ success: false, message: 'เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว (Phone number is already registered)' }, 400);
      }
      
      if (email) {
         const existingEmailUser = await userRepository.findByIdentifier(email);
         if (existingEmailUser && existingEmailUser.email === email) {
           return c.json({ success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว (Email is already registered)' }, 400);
         }
      }

      const rateLimit = await enforceOtpRequestLimit(config.kv, phone);
      if (!rateLimit.ok) return c.json({ success: false, message: rateLimit.message }, 429);

      // OTP switched off system-wide (CRM > System Settings) — nothing to
      // send or verify, so tell the frontend to skip the OTP screen
      // entirely instead of generating a code nobody actually needs to type.
      const otpEnabled = await settingsRepo.isOtpEnabled();
      if (!otpEnabled) {
        return c.json({ success: true, otpRequired: false });
      }

      const otp = AuthService.generateOTP();
      const ref = AuthService.generateRefCode();

      // Store OTP and Ref in KV with 5-min expiry
      await config.kv.put(`otp:${phone}`, JSON.stringify({ otp, ref }), { expirationTtl: 300 });

      // Send SMS via ThaiBulkSMS
      const smsApiKey = await settingsRepo.getOverridable('sms_api_key', config.smsApiKey);
      const smsApiSecret = await settingsRepo.getOverridable('sms_api_secret', config.smsApiSecret);
      const smsSenderName = await settingsRepo.getOverridable('sms_sender_name', 'Demo');
      const smsService = new SmsService(smsApiKey, smsApiSecret, smsSenderName);
      const sent = await smsService.sendOtp(phone, otp, ref);

      if (!sent && !config.isDev) {
        await sendAlert(config.db, 'SMS Send Failed (Registration OTP)', { phone });
        return c.json({ success: false, message: 'Failed to send SMS' }, 500);
      }

      return c.json({
        success: true,
        otpRequired: true,
        message: 'OTP sent via SMS',
        ref,
        ...(config.isDev ? { debug_otp: otp } : {})
      });
    } catch (error: any) {
      console.error('requestOtp error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }
  async verifyOtp(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { phone, otp } = await c.req.json();
      const otpKey = `otp:${phone}`;
      const storedOtpData = await config.kv.get(otpKey);

      if (!storedOtpData) return c.json({ success: false, message: 'OTP expired' }, 400);

      const verifyLimit = await enforceOtpVerifyLimit(config.kv, otpKey);
      if (!verifyLimit.ok) return c.json({ success: false, message: verifyLimit.message }, 429);

      let storedOtp = storedOtpData;
      try {
        const parsed = JSON.parse(storedOtpData);
        storedOtp = parsed.otp;
      } catch (e) {
        // Fallback if it's stored as plain text
      }

      if (otp !== storedOtp) return c.json({ success: false, message: 'Invalid OTP' }, 400);

      await clearOtpVerifyAttempts(config.kv, otpKey);
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async register(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { phone, otp, password, prefix, firstName, lastName, dob, children, email, lineId, pdpaConsent, marketingConsent, address } = await c.req.json();

      const childList = children || [];
      const invalidChild = childList.find((child: any) => !child.nickname || !child.gender);
      if (invalidChild) {
        return c.json({ success: false, message: 'Nickname and gender are required for each child' }, 400);
      }

      const userRepository = new UserRepository(config.db);
      const passwordHash = await AuthService.hashPassword(password);

      const userId = await userRepository.createWithChildren(
        phone,
        passwordHash,
        firstName,
        lastName,
        childList,
        email,
        lineId,
        pdpaConsent,
        marketingConsent,
        address,
        prefix,
        dob
      );
      await sendNotification(config.db, 'สมาชิกใหม่', {
        'ชื่อ': `${prefix ?? ''}${firstName} ${lastName}`.trim(),
        'เบอร์โทร': phone,
        'จำนวนบุตร': childList.length,
      });
      return c.json({ success: true, userId });
    } catch (error: any) {
      console.error('register error:', error);
      let message = error.message;
      if (message.includes('UNIQUE constraint failed: Users.email')) {
        message = 'อีเมลนี้ถูกใช้งานแล้ว (Email is already registered)';
      } else if (message.includes('UNIQUE constraint failed: Users.phone')) {
        message = 'เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว (Phone number is already registered)';
      } else if (message.includes('UNIQUE constraint failed: Users.google_id')) {
        message = 'บัญชี Google นี้ถูกใช้งานแล้ว (This Google account is already linked to another user)';
      }
      return c.json({ success: false, message }, 500);
    }
  }

  async login(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    // Declared outside the try block so the catch below (which reports
    // config.isDev) can still see it — it was previously scoped inside
    // try{}, so any login failure crashed with an unrelated ReferenceError
    // instead of the intended graceful JSON error response.
    const config = new ConfigService(c.env);
    try {
      console.log('Login attempt started');
      const body = await c.req.json();
      console.log('Request body parsed:', JSON.stringify(body));
      
      const { login, password } = body;

      if (!login || !password) {
        return c.json({ success: false, message: 'Login and password are required' }, 400);
      }

      const attemptKey = `login_attempts:${login}`;
      const attemptDataStr = await config.kv.get(attemptKey);
      const attemptData = attemptDataStr ? JSON.parse(attemptDataStr) : { count: 0, lockedUntil: 0 };
      const now = Date.now();

      if (attemptData.lockedUntil && attemptData.lockedUntil > now) {
        const retryAfter = Math.ceil((attemptData.lockedUntil - now) / 1000);
        return c.json({ success: false, message: 'Too many attempts. Please try again later.', locked: true, retryAfter }, 429);
      }

      const registerFailedAttempt = async () => {
        attemptData.count = (attemptData.count || 0) + 1;
        if (attemptData.count >= 5) {
          attemptData.lockedUntil = now + 60 * 1000;
          attemptData.count = 0;
          await config.kv.put(attemptKey, JSON.stringify(attemptData), { expirationTtl: 90 });
          return { locked: true, retryAfter: 60 };
        }
        await config.kv.put(attemptKey, JSON.stringify(attemptData), { expirationTtl: 300 });
        return { locked: false, attemptsRemaining: 5 - attemptData.count };
      };

      console.log('Connecting to database...');
      const userRepository = new UserRepository(config.db);

      console.log('Finding user by phone:', login);
      let user = await userRepository.findByPhone(login);
      console.log('User found:', user ? 'Yes' : 'No');

      if (!user) {
        const result = await registerFailedAttempt();
        return c.json({ success: false, message: 'User not found', ...result }, result.locked ? 429 : 401);
      }

      console.log('Verifying password...');
      const isValid = await AuthService.verifyPassword(password, user.password_hash);
      console.log('Password valid:', isValid);

      if (!isValid) {
        const result = await registerFailedAttempt();
        return c.json({ success: false, message: 'Invalid password', ...result }, result.locked ? 429 : 401);
      }

      await config.kv.delete(attemptKey);

      console.log('Generating token...');
      const token = await AuthService.generateToken(user.id, config.jwtSecret);
      console.log('Token generated');

      // Determine membership status
      let membershipStatus = 'inactive';
      if (user.membership_expires_at) {
        const expiryDate = new Date(user.membership_expires_at);
        if (expiryDate > new Date()) {
          membershipStatus = 'active';
        }
      }
      
      return c.json({
        success: true,
        token,
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          membershipStatus,
          avatarUrl: user.profile_image_url,
          displayName: user.display_name
        }
      });
    } catch (error: any) {
      console.error('login error detail:', error.stack || error.message);
      return c.json({ success: false, message: error.message, stack: config.isDev ? error.stack : undefined }, 500);
    }
  }

  async googleLogin(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { idToken } = await c.req.json();

      if (!idToken) {
        return c.json({ success: false, message: 'idToken is required' }, 400);
      }

      const payload = await AuthService.verifyGoogleIdToken(idToken, config.googleClientId);
      if (!payload) {
        return c.json({ success: false, message: 'Invalid Google token' }, 401);
      }

      const googleId = payload.sub;
      const email = payload.email;
      const firstName = payload.given_name;
      const lastName = payload.family_name;

      const userRepository = new UserRepository(config.db);

      let user = await userRepository.findByGoogleId(googleId);

      if (!user) {
        const existingByEmail = await userRepository.findByEmail(email);
        if (existingByEmail) {
          await userRepository.linkGoogleId(existingByEmail.id, googleId);
          user = await userRepository.findByGoogleId(googleId);
        } else {
          const userId = await userRepository.createFromGoogle(googleId, email, firstName, lastName);
          user = await userRepository.findByGoogleId(googleId) || { id: userId, phone: null, email, first_name: firstName, last_name: lastName };
        }
      }

      const token = await AuthService.generateToken(user.id, config.jwtSecret);
      const childCount = await userRepository.countChildren(user.id);

      let membershipStatus = 'inactive';
      if (user.membership_expires_at) {
        const expiryDate = new Date(user.membership_expires_at);
        if (expiryDate > new Date()) {
          membershipStatus = 'active';
        }
      }

      return c.json({
        success: true,
        token,
        needsPhone: !user.phone,
        needsChildInfo: childCount === 0,
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          membershipStatus,
          avatarUrl: user.profile_image_url,
          displayName: user.display_name
        }
      });
    } catch (error: any) {
      console.error('googleLogin error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async adminLogin(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { email, password } = await c.req.json();
      
      if (!email || !password) {
        return c.json({ success: false, message: 'Email and password are required' }, 400);
      }

      const { AdminRepository } = await import('../repositories/adminRepository');
      const adminRepo = new AdminRepository(config.db);
      
      const user = await adminRepo.findCrmUserByEmail(email);

      if (!user) {
        return c.json({ success: false, message: 'Admin user not found' }, 401);
      }

      // Password comparison - using AuthService if available or simple check if seed used plain text
      // For seed data 'password123', it's likely plain text or needs hashing.
      // Let's assume AuthService.verifyPassword for consistency, but handle potential plain text from seed.
      let isValid = false;
      try {
        isValid = await AuthService.verifyPassword(password, user.password_hash);
      } catch (e) {
        // Fallback for plain text from seed if hashing fails
        isValid = password === user.password_hash;
      }

      if (!isValid) {
        return c.json({ success: false, message: 'Invalid credentials' }, 401);
      }

      // type: 'admin' distinguishes a CRM staff token from a consumer-app
      // token — both are signed with the same secret/shape otherwise, and
      // the admin route middleware in index.ts checks this claim.
      const token = await AuthService.generateToken(user.id, config.jwtSecret, {
        type: 'admin',
        role: user.role,
        branchId: user.branch_id,
      });

      // Fetch available branches
      let branches = [];
      if (user.role === 'super_admin') {
        branches = await adminRepo.getAllBranches();
      } else if (user.branch_id) {
        const allBranches = await adminRepo.getAllBranches();
        branches = allBranches.filter(b => b.id === user.branch_id);
      }

      return c.json({
        success: true,
        token,
        branches,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          branchId: user.branch_id
        }
      });
    } catch (error: any) {
      console.error('adminLogin error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async forgotPasswordRequestOtp(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const settingsRepo = new SettingsRepository(config.db);
      const { phone } = await c.req.json();
      
      const userRepository = new UserRepository(config.db);
      const user = await userRepository.findByPhone(phone);

      if (!user) {
        return c.json({ success: false, message: 'User not found' }, 404);
      }
      
      const rateLimit = await enforceOtpRequestLimit(config.kv, `forgot_pw:${phone}`);
      if (!rateLimit.ok) return c.json({ success: false, message: rateLimit.message }, 429);

      const otpEnabled = await settingsRepo.isOtpEnabled();
      if (!otpEnabled) {
        return c.json({ success: true, otpRequired: false });
      }

      const otp = AuthService.generateOTP();
      const ref = AuthService.generateRefCode();

      // Store OTP and Ref in KV
      await config.kv.put(`forgot_pw_otp:${phone}`, JSON.stringify({ otp, ref }), { expirationTtl: 300 });

      const smsApiKey = await settingsRepo.getOverridable('sms_api_key', config.smsApiKey);
      const smsApiSecret = await settingsRepo.getOverridable('sms_api_secret', config.smsApiSecret);
      const smsSenderName = await settingsRepo.getOverridable('sms_sender_name', 'Demo');
      const smsService = new SmsService(smsApiKey, smsApiSecret, smsSenderName);
      const sent = await smsService.sendOtp(phone, otp, ref);

      if (!sent && !config.isDev) {
        await sendAlert(config.db, 'SMS Send Failed (Forgot Password OTP)', { phone });
        return c.json({ success: false, message: 'Failed to send SMS' }, 500);
      }

      return c.json({
        success: true,
        otpRequired: true,
        message: 'OTP sent via SMS',
        ref,
        ...(config.isDev ? { debug_otp: otp } : {})
      });
    } catch (error: any) {
      console.error('forgotPasswordRequestOtp error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async forgotPasswordVerifyOtp(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { phone, otp } = await c.req.json();
      const otpKey = `forgot_pw_otp:${phone}`;
      const storedOtpData = await config.kv.get(otpKey);

      if (!storedOtpData) return c.json({ success: false, message: 'OTP expired' }, 400);

      const verifyLimit = await enforceOtpVerifyLimit(config.kv, otpKey);
      if (!verifyLimit.ok) return c.json({ success: false, message: verifyLimit.message }, 429);

      let storedOtp = storedOtpData;
      try {
        const parsed = JSON.parse(storedOtpData);
        storedOtp = parsed.otp;
      } catch (e) {
        // Fallback if stored as plain text
      }

      if (otp !== storedOtp) return c.json({ success: false, message: 'Invalid OTP' }, 400);

      await clearOtpVerifyAttempts(config.kv, otpKey);
      return c.json({ success: true });
    } catch (error: any) {
      console.error('forgotPasswordVerifyOtp error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async forgotPasswordReset(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const settingsRepo = new SettingsRepository(config.db);
      const { phone, otp, newPassword } = await c.req.json();

      // Mirrors forgotPasswordRequestOtp's own otpEnabled check — since no
      // OTP was ever generated for this request when OTP is off, there's
      // nothing in KV to match against here either.
      const otpEnabled = await settingsRepo.isOtpEnabled();
      if (otpEnabled) {
        const otpKey = `forgot_pw_otp:${phone}`;
        const storedOtpData = await config.kv.get(otpKey);

        if (!storedOtpData) return c.json({ success: false, message: 'OTP expired or invalid' }, 400);

        const verifyLimit = await enforceOtpVerifyLimit(config.kv, otpKey);
        if (!verifyLimit.ok) return c.json({ success: false, message: verifyLimit.message }, 429);

        let storedOtp = storedOtpData;
        try {
          const parsed = JSON.parse(storedOtpData);
          storedOtp = parsed.otp;
        } catch (e) {
          // Fallback for simple string format
        }

        if (otp !== storedOtp) return c.json({ success: false, message: 'Invalid OTP' }, 400);
      }

      const userRepository = new UserRepository(config.db);
      const user = await userRepository.findByPhone(phone);

      if (!user) {
        return c.json({ success: false, message: 'User not found' }, 404);
      }
      
      const passwordHash = await AuthService.hashPassword(newPassword);
      await userRepository.updatePassword(phone, passwordHash);
      
      // Delete OTP
      await config.kv.delete(`forgot_pw_otp:${phone}`);
      
      return c.json({ success: true, message: 'Password reset successfully' });
    } catch (error: any) {
      console.error('forgotPasswordReset error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Completes a CRM staff manual-share password reset (see
  // adminController.resetCrmUserPassword) — public/unauthenticated since the
  // staff member has no session yet, just the link they were sent.
  async crmResetPassword(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { token, newPassword } = await c.req.json();
      if (!token || !newPassword || !newPassword.trim()) {
        return c.json({ success: false, message: 'token and newPassword required' }, 400);
      }

      const { AdminRepository } = await import('../repositories/adminRepository');
      const adminRepo = new AdminRepository(config.db);
      const match = await adminRepo.findCrmUserByResetToken(token);

      if (!match) return c.json({ success: false, message: 'ลิงก์ไม่ถูกต้องหรือถูกใช้ไปแล้ว' }, 400);
      if (new Date(match.reset_token_expires_at) < new Date()) {
        return c.json({ success: false, message: 'ลิงก์หมดอายุแล้ว กรุณาขอลิงก์ใหม่' }, 400);
      }

      const passwordHash = await AuthService.hashPassword(newPassword.trim());
      await adminRepo.resetCrmUserPasswordByToken(match.id, passwordHash);

      return c.json({ success: true });
    } catch (error: any) {
      console.error('crmResetPassword error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Lightweight "who am I" for the settings screen — the consumer JWT only
  // carries userId, so account-security UI (phone verified? Google linked?)
  // needs a fresh read from the DB rather than trusting localStorage.
  async getMe(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getAuthedUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const userRepository = new UserRepository(config.db);
      const user = await userRepository.findById(userId);
      if (!user) return c.json({ success: false, message: 'User not found' }, 404);

      return c.json({
        success: true,
        user: {
          id: user.id,
          firstName: user.first_name,
          lastName: user.last_name,
          phone: user.phone,
          phoneVerified: !!user.phone_verified,
          email: user.email,
          hasGoogleLinked: !!user.google_id,
          avatarUrl: user.profile_image_url,
          displayName: user.display_name,
        },
      });
    } catch (error: any) {
      console.error('getMe error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Self-service PIN change from the profile settings page — requires the
  // current PIN rather than an OTP, since the user is already signed in
  // (identity from the JWT) and re-entering the current PIN is the standard
  // "prove you're still you" check for a security-sensitive change.
  async changePassword(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getAuthedUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const { currentPassword, newPassword } = await c.req.json();
      if (!currentPassword || !newPassword) {
        return c.json({ success: false, message: 'currentPassword and newPassword required' }, 400);
      }
      if (!/^\d{6}$/.test(newPassword)) {
        return c.json({ success: false, message: 'PIN ใหม่ต้องเป็นตัวเลข 6 หลัก' }, 400);
      }

      const userRepository = new UserRepository(config.db);
      const user = await userRepository.findById(userId);
      if (!user) return c.json({ success: false, message: 'User not found' }, 404);

      const isValid = await AuthService.verifyPassword(currentPassword, user.password_hash);
      if (!isValid) return c.json({ success: false, message: 'PIN ปัจจุบันไม่ถูกต้อง' }, 400);

      const passwordHash = await AuthService.hashPassword(newPassword);
      await userRepository.updatePassword(user.phone, passwordHash);

      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ─── Phone change (self-service) ──────────────────────────────────────────
  // Two OTP steps: first the CURRENT phone (proves the requester is the
  // account owner, not just someone who guessed the new number), then the
  // NEW phone (proves they actually control it). Identity from the JWT only
  // — never trust a client-supplied userId for an identity-changing action.
  private async getAuthedUserId(c: Context<{ Bindings: Bindings; Variables: Variables }>, config: ConfigService): Promise<number | null> {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return null;
    const payload = await AuthService.verifyToken(token, config.jwtSecret);
    return payload?.userId ?? null;
  }

  private async sendOtpSms(config: ConfigService, settingsRepo: SettingsRepository, phone: string, otp: string, ref: string): Promise<{ otpEnabled: boolean; sent: boolean }> {
    const otpEnabled = await settingsRepo.isOtpEnabled();
    let sent = false;
    if (otpEnabled) {
      const smsApiKey = await settingsRepo.getOverridable('sms_api_key', config.smsApiKey);
      const smsApiSecret = await settingsRepo.getOverridable('sms_api_secret', config.smsApiSecret);
      const smsSenderName = await settingsRepo.getOverridable('sms_sender_name', 'Demo');
      const smsService = new SmsService(smsApiKey, smsApiSecret, smsSenderName);
      sent = await smsService.sendOtp(phone, otp, ref);
    } else {
      console.log(`[TEST MODE] OTP for ${phone}: ${otp} (Ref: ${ref})`);
    }
    return { otpEnabled, sent };
  }

  async requestPhoneChangeCurrentOtp(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getAuthedUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const userRepository = new UserRepository(config.db);
      const user = await userRepository.findById(userId);
      if (!user) return c.json({ success: false, message: 'User not found' }, 404);
      if (!user.phone) {
        // No phone on file yet (e.g. Google sign-up) — nothing to confirm
        // identity against, so the flow can skip straight to the new-phone step.
        return c.json({ success: true, skipIdentityStep: true });
      }

      const rateLimit = await enforceOtpRequestLimit(config.kv, `phone_change_id:${userId}`);
      if (!rateLimit.ok) return c.json({ success: false, message: rateLimit.message }, 429);

      const settingsRepo = new SettingsRepository(config.db);

      // OTP switched off system-wide — nothing to verify, so mark identity
      // as confirmed directly and let the frontend skip straight to the
      // new-phone step instead of showing a code nobody was sent.
      const otpEnabled = await settingsRepo.isOtpEnabled();
      if (!otpEnabled) {
        await config.kv.put(`phone_change_authorized:${userId}`, '1', { expirationTtl: 600 });
        return c.json({ success: true, otpRequired: false });
      }

      const otp = AuthService.generateOTP();
      const ref = AuthService.generateRefCode();
      await config.kv.put(`phone_change_current_otp:${userId}`, JSON.stringify({ otp, ref }), { expirationTtl: 300 });

      const { sent } = await this.sendOtpSms(config, settingsRepo, user.phone, otp, ref);
      if (!sent && !config.isDev) {
        await sendAlert(config.db, 'SMS Send Failed (Phone Change - Identity OTP)', { userId });
        return c.json({ success: false, message: 'Failed to send SMS' }, 500);
      }

      return c.json({
        success: true,
        otpRequired: true,
        phone: user.phone,
        ref,
        ...(config.isDev ? { debug_otp: otp } : {}),
      });
    } catch (error: any) {
      console.error('requestPhoneChangeCurrentOtp error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async verifyPhoneChangeCurrentOtp(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getAuthedUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const { otp } = await c.req.json();
      const otpKey = `phone_change_current_otp:${userId}`;
      const storedOtpData = await config.kv.get(otpKey);
      if (!storedOtpData) return c.json({ success: false, message: 'OTP expired' }, 400);

      const verifyLimit = await enforceOtpVerifyLimit(config.kv, otpKey);
      if (!verifyLimit.ok) return c.json({ success: false, message: verifyLimit.message }, 429);

      const { otp: storedOtp } = JSON.parse(storedOtpData);
      if (otp !== storedOtp) return c.json({ success: false, message: 'Invalid OTP' }, 400);

      await clearOtpVerifyAttempts(config.kv, otpKey);
      await config.kv.delete(otpKey);
      // 10-minute window to finish the new-phone step before re-verifying identity.
      await config.kv.put(`phone_change_authorized:${userId}`, '1', { expirationTtl: 600 });

      return c.json({ success: true });
    } catch (error: any) {
      console.error('verifyPhoneChangeCurrentOtp error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async requestPhoneChangeNewOtp(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getAuthedUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const { newPhone } = await c.req.json();
      if (!newPhone) return c.json({ success: false, message: 'newPhone is required' }, 400);

      const userRepository = new UserRepository(config.db);
      const user = await userRepository.findById(userId);
      if (!user) return c.json({ success: false, message: 'User not found' }, 404);

      if (user.phone) {
        const authorized = await config.kv.get(`phone_change_authorized:${userId}`);
        if (!authorized) return c.json({ success: false, message: 'กรุณายืนยันเบอร์เดิมก่อน (Please verify your current phone first)' }, 403);
      }

      const existing = await userRepository.findByPhone(newPhone);
      if (existing && existing.id !== userId) {
        return c.json({ success: false, message: 'เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว (Phone number is already registered)' }, 400);
      }

      const rateLimit = await enforceOtpRequestLimit(config.kv, `phone_change_new:${userId}`);
      if (!rateLimit.ok) return c.json({ success: false, message: rateLimit.message }, 429);

      const settingsRepo = new SettingsRepository(config.db);

      // OTP switched off system-wide — there's nothing left to verify at
      // this point (identity already confirmed above), so complete the
      // phone change immediately rather than round-tripping through a
      // confirm step with a code nobody was sent.
      const otpEnabled = await settingsRepo.isOtpEnabled();
      if (!otpEnabled) {
        await userRepository.updatePhone(userId, newPhone);
        await config.kv.delete(`phone_change_authorized:${userId}`);
        const updated = await userRepository.findById(userId);
        return c.json({ success: true, otpRequired: false, phone: updated.phone });
      }

      const otp = AuthService.generateOTP();
      const ref = AuthService.generateRefCode();
      await config.kv.put(`phone_change_new_otp:${userId}`, JSON.stringify({ otp, ref, newPhone }), { expirationTtl: 300 });

      const { sent } = await this.sendOtpSms(config, settingsRepo, newPhone, otp, ref);
      if (!sent && !config.isDev) {
        await sendAlert(config.db, 'SMS Send Failed (Phone Change - New Phone OTP)', { userId, newPhone });
        return c.json({ success: false, message: 'Failed to send SMS' }, 500);
      }

      return c.json({
        success: true,
        otpRequired: true,
        ref,
        ...(config.isDev ? { debug_otp: otp } : {}),
      });
    } catch (error: any) {
      console.error('requestPhoneChangeNewOtp error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async confirmPhoneChange(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getAuthedUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const { otp } = await c.req.json();
      const otpKey = `phone_change_new_otp:${userId}`;
      const storedOtpData = await config.kv.get(otpKey);
      if (!storedOtpData) return c.json({ success: false, message: 'OTP expired' }, 400);

      const verifyLimit = await enforceOtpVerifyLimit(config.kv, otpKey);
      if (!verifyLimit.ok) return c.json({ success: false, message: verifyLimit.message }, 429);

      const { otp: storedOtp, newPhone } = JSON.parse(storedOtpData);
      if (otp !== storedOtp) return c.json({ success: false, message: 'Invalid OTP' }, 400);

      const userRepository = new UserRepository(config.db);
      const existing = await userRepository.findByPhone(newPhone);
      if (existing && existing.id !== userId) {
        return c.json({ success: false, message: 'เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว (Phone number is already registered)' }, 400);
      }

      await userRepository.updatePhone(userId, newPhone);
      await clearOtpVerifyAttempts(config.kv, otpKey);
      await config.kv.delete(otpKey);
      await config.kv.delete(`phone_change_authorized:${userId}`);

      const user = await userRepository.findById(userId);
      return c.json({ success: true, phone: user.phone });
    } catch (error: any) {
      console.error('confirmPhoneChange error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // ─── Google account linking (self-service) ────────────────────────────────
  async linkGoogle(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getAuthedUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const { idToken } = await c.req.json();
      if (!idToken) return c.json({ success: false, message: 'idToken is required' }, 400);

      const payload = await AuthService.verifyGoogleIdToken(idToken, config.googleClientId);
      if (!payload) return c.json({ success: false, message: 'Invalid Google token' }, 401);

      const userRepository = new UserRepository(config.db);
      const existing = await userRepository.findByGoogleId(payload.sub);
      if (existing && existing.id !== userId) {
        return c.json({ success: false, message: 'บัญชี Google นี้ถูกผูกกับบัญชีอื่นแล้ว (This Google account is already linked to another user)' }, 409);
      }

      await userRepository.linkGoogleId(userId, payload.sub);

      const user = await userRepository.findById(userId);
      // Backfill email only if this account doesn't have one and Google's isn't taken.
      if (!user.email && payload.email) {
        const emailTaken = await userRepository.findByEmail(payload.email);
        if (!emailTaken) {
          await config.db.prepare('UPDATE Users SET email = ? WHERE id = ?').bind(payload.email, userId).run();
        }
      }

      const updated = await userRepository.findById(userId);
      return c.json({ success: true, email: updated.email });
    } catch (error: any) {
      console.error('linkGoogle error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async unlinkGoogle(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getAuthedUserId(c, config);
      if (!userId) return c.json({ success: false, message: 'Unauthorized' }, 401);

      const userRepository = new UserRepository(config.db);
      const user = await userRepository.findById(userId);
      if (!user) return c.json({ success: false, message: 'User not found' }, 404);

      // A verified phone is the only remaining way to log back in / be
      // reached once Google is unlinked — email alone isn't enough since
      // email is optional and never OTP-verified in this app.
      if (!user.phone_verified) {
        return c.json({ success: false, message: 'ต้องมีเบอร์โทรที่ยืนยันแล้วก่อนจึงจะยกเลิกการผูกบัญชี Google ได้ (A verified phone number is required before unlinking Google)' }, 400);
      }

      await userRepository.unlinkGoogleId(userId);
      return c.json({ success: true });
    } catch (error: any) {
      console.error('unlinkGoogle error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }
}

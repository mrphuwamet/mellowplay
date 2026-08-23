import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { AuthService } from '../services/authService';
import { ConfigService } from '../services/configService';
import { SmsService } from '../services/smsService';
import { EmailService } from '../services/emailService';
import { UserRepository } from '../repositories/userRepository';
import { SettingsRepository } from '../repositories/settingsRepository';
import { sendAlert, sendNotification } from '../services/alertService';
import { sendWelcomeEmail } from '../services/welcomeEmailService';
import { isValidPin, PIN_ERROR } from '../utils/pin';
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
  // ── Optional email verification during registration ─────────────────────
  //
  // Kept separate from the phone OTP rather than folded into it. Phone stays the
  // identity (Users.phone is UNIQUE NOT NULL and login keys off it); this only
  // proves a typed address is real so Users.email_verified can be trusted.
  // Skipping it must always leave registration completable.
  //
  // Why it matters beyond correctness: Cloudflare scales the account's daily send
  // quota on deliverability, so mail to mistyped addresses costs sending capacity
  // for every other email the system sends.
  async requestEmailOtp(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { email } = await c.req.json();
      const address = (email || '').trim().toLowerCase();

      if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
        return c.json({ success: false, message: 'กรุณากรอกอีเมลให้ถูกต้อง' }, 400);
      }

      const settingsRepo = new SettingsRepository(config.db);
      const fromAddress = await settingsRepo.getOverridable('email_from_address', 'contact@mellowplay.co');
      const fromName = await settingsRepo.getOverridable('email_from_name', 'Mellow Play');
      const emailService = new EmailService(config.emailBinding, fromAddress, fromName);

      // Unlike a booking confirmation — where an unsendable email is skipped and
      // the booking still succeeds — a code that never arrives leaves the user
      // stuck on the code screen. Refuse up front; the frontend hides the option
      // entirely via /auth/email-otp/available.
      if (!emailService.isConfigured) {
        return c.json({ success: false, message: 'ระบบยังไม่พร้อมส่งอีเมลยืนยัน' }, 503);
      }

      // Same limiter as the phone OTP, keyed on the address. It matters more here:
      // repeatedly mailing a non-existent address drives up the bounce rate, which
      // is what the sending quota is scaled on.
      const rateLimit = await enforceOtpRequestLimit(config.kv, `email:${address}`);
      if (!rateLimit.ok) return c.json({ success: false, message: rateLimit.message }, 429);

      const otp = AuthService.generateOTP();
      const ref = AuthService.generateRefCode();
      // 5 minutes, matching what sendOtp's wording promises.
      await config.kv.put(`email_otp:${address}`, JSON.stringify({ otp, ref }), { expirationTtl: 300 });

      const result = await emailService.sendOtp(address, otp, ref);
      if (!result.ok && !config.isDev) {
        await sendAlert(config.db, 'Email Send Failed (Registration OTP)', { email: address, detail: result.detail });
        return c.json({ success: false, message: 'ส่งอีเมลยืนยันไม่สำเร็จ' }, 502);
      }

      return c.json({
        success: true,
        message: 'ส่งรหัสยืนยันไปที่อีเมลแล้ว',
        ref,
        ...(config.isDev ? { debug_otp: otp } : {}),
      });
    } catch (error: any) {
      console.error('requestEmailOtp error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async verifyEmailOtp(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { email, otp } = await c.req.json();
      const address = (email || '').trim().toLowerCase();
      const otpKey = `email_otp:${address}`;

      const stored = await config.kv.get(otpKey);
      if (!stored) return c.json({ success: false, message: 'รหัสหมดอายุ กรุณาขอรหัสใหม่' }, 400);

      const verifyLimit = await enforceOtpVerifyLimit(config.kv, otpKey);
      if (!verifyLimit.ok) return c.json({ success: false, message: verifyLimit.message }, 429);

      let expected: string | null = null;
      try { expected = JSON.parse(stored).otp; } catch { expected = stored; }
      if (!otp || otp !== expected) return c.json({ success: false, message: 'รหัสไม่ถูกต้อง' }, 400);

      await clearOtpVerifyAttempts(config.kv, otpKey);
      await config.kv.delete(otpKey);

      // The account does not exist yet at this point in registration, so there is
      // no row to flag. A short-lived marker records the proof and register() reads
      // it — the client is never trusted to claim "verified", it only reports which
      // address it verified.
      await config.kv.put(`email_verified:${address}`, '1', { expirationTtl: 1800 });

      return c.json({ success: true, message: 'ยืนยันอีเมลเรียบร้อย' });
    } catch (error: any) {
      console.error('verifyEmailOtp error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  // Lets the registration screen decide whether to offer email verification at
  // all, rather than showing a button that can only fail.
  async emailOtpAvailable(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const settingsRepo = new SettingsRepository(config.db);
      const fromAddress = await settingsRepo.getOverridable('email_from_address', 'contact@mellowplay.co');
      const emailService = new EmailService(config.emailBinding, fromAddress);
      return c.json({ success: true, available: emailService.isConfigured });
    } catch {
      return c.json({ success: true, available: false });
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

  /**
   * Check a reset link before showing the customer a form.
   *
   * Answers only "is this token usable", never who it belongs to: the link
   * travels over LINE and email, and an expired one should not confirm whose
   * account it was.
   */
  async checkResetToken(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const token = c.req.query('token') || '';
      if (!token) return c.json({ success: false, message: 'ลิงก์ไม่ถูกต้อง' }, 400);
      const config = new ConfigService(c.env);
      const { AdminRepository } = await import('../repositories/adminRepository');
      const match = await new AdminRepository(config.db).findUserByResetToken(token);
      if (!match) return c.json({ success: false, message: 'ลิงก์ไม่ถูกต้องหรือถูกใช้ไปแล้ว' }, 400);
      if (new Date(match.reset_token_expires_at) < new Date()) {
        return c.json({ success: false, message: 'ลิงก์หมดอายุแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่' }, 400);
      }
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /** Set a new PIN from a reset link. */
  async resetPasswordWithToken(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const { token, password } = await c.req.json();
      if (!token) return c.json({ success: false, message: 'ลิงก์ไม่ถูกต้อง' }, 400);
      if (!isValidPin(password)) return c.json({ success: false, message: PIN_ERROR }, 400);

      const config = new ConfigService(c.env);
      const { AdminRepository } = await import('../repositories/adminRepository');
      const adminRepo = new AdminRepository(config.db);
      const match = await adminRepo.findUserByResetToken(token);
      if (!match) return c.json({ success: false, message: 'ลิงก์ไม่ถูกต้องหรือถูกใช้ไปแล้ว' }, 400);
      if (new Date(match.reset_token_expires_at) < new Date()) {
        return c.json({ success: false, message: 'ลิงก์หมดอายุแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่' }, 400);
      }

      // Clearing the token is part of the same statement as setting the hash,
      // so a link can never be spent twice.
      await adminRepo.setUserPasswordAndClearToken(match.id, await AuthService.hashPassword(password));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async register(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { phone, otp, password, prefix, firstName, lastName, firstNameEn, lastNameEn, dob, children, email, lineId, pdpaConsent, marketingConsent, address, relationship } = await c.req.json();

      // A blank email has to reach the database as NULL, never as ''.
      // Users.email is UNIQUE, and SQLite allows any number of NULLs but only one
      // '' — so with email optional, the SECOND person to leave it empty would fail
      // on "UNIQUE constraint failed: Users.email" and be shown "อีเมลนี้ถูกใช้งานแล้ว",
      // which is both wrong and impossible for them to work around.
      const emailValue = email && String(email).trim() ? String(email).trim() : null;

      const childList = children || [];
      const invalidChild = childList.find((child: any) => !child.nickname || !child.gender);
      if (invalidChild) {
        return c.json({ success: false, message: 'Nickname and gender are required for each child' }, 400);
      }

      const userRepository = new UserRepository(config.db);
      const passwordHash = await AuthService.hashPassword(password);

      const duplicateMatches = [
        ...await userRepository.checkDuplicateFullName(`${firstName} ${lastName}`),
        ...(await Promise.all(childList.map((child: any) => child.name ? userRepository.checkDuplicateFullName(child.name) : []))).flat(),
      ];
      const duplicateWarning = duplicateMatches.length > 0
        ? `พบชื่อ-นามสกุลนี้ในระบบแล้ว: ${[...new Set(duplicateMatches.map(m => m.name))].join(', ')}`
        : undefined;

      const userId = await userRepository.createWithChildren(
        phone,
        passwordHash,
        firstName,
        lastName,
        childList,
        emailValue,
        lineId,
        pdpaConsent,
        marketingConsent,
        address,
        prefix,
        dob,
        firstNameEn,
        lastNameEn,
        relationship
      );

      // Email verification is optional, so this is a separate UPDATE after the
      // fact rather than another parameter threaded through createWithChildren's
      // already 15-argument signature and its INSERT.
      //
      // The proof comes from the KV marker verifyEmailOtp wrote, never from the
      // request body: the client says which address it used, and only a marker
      // this server put there can make it count as verified. The marker is
      // consumed on use so it cannot be replayed for a second account.
      if (emailValue) {
        const address = emailValue.toLowerCase();
        const markerKey = `email_verified:${address}`;
        if (await config.kv.get(markerKey)) {
          await config.db.prepare('UPDATE Users SET email_verified = 1 WHERE id = ?').bind(userId).run();
          await config.kv.delete(markerKey);
        }
      }

      await sendNotification(config.db, 'สมาชิกใหม่', {
        'ชื่อ': `${prefix ?? ''}${firstName} ${lastName}`.trim(),
        'เบอร์โทร': phone,
        'จำนวนบุตร': childList.length,
      });

      // After the account exists and after the verification marker is consumed:
      // a welcome mail is a courtesy, so it must not sit between the signup
      // succeeding and the client being told. It swallows its own errors.
      await sendWelcomeEmail(config.db, config, {
        id: userId,
        name: `${firstName} ${lastName}`.trim(),
        email: emailValue,
        phone,
      });

      return c.json({ success: true, userId, duplicateWarning });
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

      if (user.is_banned) {
        return c.json({ success: false, message: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อเจ้าหน้าที่', banned: true }, 403);
      }

      await config.kv.delete(attemptKey);

      console.log('Generating token...');
      const token = await AuthService.generateToken(user.id, config.jwtSecret);
      console.log('Token generated');

      return c.json({
        success: true,
        token,
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          firstNameEn: user.first_name_en,
          lastNameEn: user.last_name_en,
          relationship: user.relationship,
          avatarUrl: user.profile_image_url,
          displayName: user.display_name,
          isCommunityAdmin: !!user.is_community_admin
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

      if (user.is_banned) {
        return c.json({ success: false, message: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อเจ้าหน้าที่', banned: true }, 403);
      }

      const token = await AuthService.generateToken(user.id, config.jwtSecret);
      const childCount = await userRepository.countChildren(user.id);

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
          firstNameEn: user.first_name_en,
          lastNameEn: user.last_name_en,
          avatarUrl: user.profile_image_url,
          displayName: user.display_name,
          isCommunityAdmin: !!user.is_community_admin
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

      // Forgot-password IS the identity check for taking over an account
      // from a logged-out state — unlike registration/phone-change, there's
      // no session backing this request yet. Skipping OTP here would let
      // anyone reset any customer's PIN just by knowing their phone number,
      // so when OTP is off, refuse self-service reset outright instead of
      // silently letting it through (see forgotPasswordReset for the
      // matching server-side check).
      const otpEnabled = await settingsRepo.isOtpEnabled();
      if (!otpEnabled) {
        return c.json({
          success: false,
          contactAdminRequired: true,
          message: 'ระบบยืนยันตัวตนด้วย OTP ปิดใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลเพื่อรีเซ็ตรหัสผ่านที่ LINE: @mellowplay',
        }, 403);
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

      // Unlike registration or phone-change (both tied to a session that's
      // either brand-new or already authenticated), forgot-password reset
      // IS the identity check for taking over an EXISTING account from a
      // logged-out state — phone number alone is public-ish knowledge, so
      // skipping OTP here would let anyone reset any customer's PIN just by
      // knowing their phone number. When OTP is off, refuse self-service
      // reset entirely rather than silently bypassing the identity check;
      // staff must reset it manually via the CRM instead.
      const otpEnabled = await settingsRepo.isOtpEnabled();
      if (!otpEnabled) {
        return c.json({
          success: false,
          contactAdminRequired: true,
          message: 'ระบบยืนยันตัวตนด้วย OTP ปิดใช้งานชั่วคราว กรุณาติดต่อผู้ดูแลเพื่อรีเซ็ตรหัสผ่านที่ LINE: @mellowplay',
        }, 403);
      }

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
          firstNameEn: user.first_name_en,
          lastNameEn: user.last_name_en,
          relationship: user.relationship,
          phone: user.phone,
          phoneVerified: !!user.phone_verified,
          email: user.email,
          hasGoogleLinked: !!user.google_id,
          avatarUrl: user.profile_image_url,
          displayName: user.display_name,
          isCommunityAdmin: !!user.is_community_admin,
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

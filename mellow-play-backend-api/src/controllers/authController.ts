import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { AuthService } from '../services/authService';
import { ConfigService } from '../services/configService';
import { SmsService } from '../services/smsService';
import { UserRepository } from '../repositories/userRepository';
import { SettingsRepository } from '../repositories/settingsRepository';

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

      const otp = AuthService.generateOTP();
      
      // Store OTP in KV with 5-min expiry
      await config.kv.put(`otp:${phone}`, otp, { expirationTtl: 300 });
      
      // Check if real OTP is enabled in database
      const otpEnabled = await settingsRepo.isOtpEnabled();
      let sent = false;

      if (otpEnabled) {
        // Send SMS via ThaiBulkSMS
        const smsService = new SmsService(config.smsApiKey, config.smsApiSecret);
        sent = await smsService.sendOtp(phone, otp);
      } else {
        console.log(`[TEST MODE] OTP for ${phone}: ${otp}`);
      }
      
      if (otpEnabled && !sent && !config.isDev) {
        return c.json({ success: false, message: 'Failed to send SMS' }, 500);
      }
      
      return c.json({ 
        success: true, 
        message: otpEnabled ? 'OTP sent via SMS' : 'OTP generated (Test Mode)',
        ...((config.isDev || !otpEnabled) ? { debug_otp: otp } : {})
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
      const storedOtp = await config.kv.get(`otp:${phone}`);
      
      if (!storedOtp) return c.json({ success: false, message: 'OTP expired' }, 400);
      if (otp !== storedOtp) return c.json({ success: false, message: 'Invalid OTP' }, 400);

      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async register(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { phone, otp, password, firstName, lastName, children, email, lineId, pdpaConsent, marketingConsent, address } = await c.req.json();
      const storedOtp = await config.kv.get(`otp:${phone}`);
      
      if (otp !== storedOtp) {
        return c.json({ success: false, message: 'Invalid or expired OTP' }, 400);
      }

      const userRepository = new UserRepository(config.db);
      const passwordHash = await AuthService.hashPassword(password);

      const userId = await userRepository.createWithChildren(
        phone, 
        passwordHash, 
        firstName, 
        lastName, 
        children || [],
        email,
        lineId,
        pdpaConsent,
        marketingConsent,
        address
      );
      return c.json({ success: true, userId });
    } catch (error: any) {
      console.error('register error:', error);
      let message = error.message;
      if (message.includes('UNIQUE constraint failed: Users.email')) {
        message = 'อีเมลนี้ถูกใช้งานแล้ว (Email is already registered)';
      } else if (message.includes('UNIQUE constraint failed: Users.phone')) {
        message = 'เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว (Phone number is already registered)';
      }
      return c.json({ success: false, message }, 500);
    }
  }

  async login(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      console.log('Login attempt started');
      const config = new ConfigService(c.env);
      const body = await c.req.json();
      console.log('Request body parsed:', JSON.stringify(body));
      
      const { login, password } = body;
      
      if (!login || !password) {
        return c.json({ success: false, message: 'Login and password are required' }, 400);
      }

      console.log('Connecting to database...');
      const userRepository = new UserRepository(config.db);
      
      console.log('Finding user by identifier:', login);
      let user = await userRepository.findByIdentifier(login);
      console.log('User found:', user ? 'Yes' : 'No');

      if (!user) {
        return c.json({ success: false, message: 'User not found' }, 401);
      }

      console.log('Verifying password...');
      const isValid = await AuthService.verifyPassword(password, user.password_hash);
      console.log('Password valid:', isValid);

      if (!isValid) {
        return c.json({ success: false, message: 'Invalid password' }, 401);
      }

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
          membershipStatus
        }
      });
    } catch (error: any) {
      console.error('login error detail:', error.stack || error.message);
      return c.json({ success: false, message: error.message, stack: config.isDev ? error.stack : undefined }, 500);
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

      const token = await AuthService.generateToken(user.id, config.jwtSecret);
      
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
      const user = await userRepository.findByIdentifier(phone);
      
      if (!user) {
        return c.json({ success: false, message: 'User not found' }, 404);
      }
      
      // Rate limit check
      const limitKey = `forgot_pw_limit:${phone}`;
      let limitDataStr = await config.kv.get(limitKey);
      let limitData = limitDataStr ? JSON.parse(limitDataStr) : { count: 0 };
      
      if (limitData.count >= 5) {
        return c.json({ success: false, message: 'Too many requests. Please try again after 1 hour.' }, 429);
      }
      
      // Increment and save rate limit (1 hour expiry)
      limitData.count += 1;
      await config.kv.put(limitKey, JSON.stringify(limitData), { expirationTtl: 3600 });
      
      const otp = AuthService.generateOTP();
      await config.kv.put(`forgot_pw_otp:${phone}`, otp, { expirationTtl: 300 });
      
      const otpEnabled = await settingsRepo.isOtpEnabled();
      let sent = false;

      if (otpEnabled) {
        const smsService = new SmsService(config.smsApiKey, config.smsApiSecret);
        sent = await smsService.sendOtp(phone, otp);
      } else {
        console.log(`[TEST MODE] Forgot PW OTP for ${phone}: ${otp}`);
      }
      
      if (otpEnabled && !sent && !config.isDev) {
        return c.json({ success: false, message: 'Failed to send SMS' }, 500);
      }
      
      return c.json({ 
        success: true, 
        message: otpEnabled ? 'OTP sent via SMS' : 'OTP generated (Test Mode)',
        ...((config.isDev || !otpEnabled) ? { debug_otp: otp } : {})
      });
    } catch (error: any) {
      console.error('forgotPasswordRequestOtp error:', error);
      return c.json({ success: false, message: error.message }, 500);
    }
  }

  async forgotPasswordReset(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const config = new ConfigService(c.env);
      const { phone, otp, newPassword } = await c.req.json();
      
      const storedOtp = await config.kv.get(`forgot_pw_otp:${phone}`);
      
      if (!storedOtp) return c.json({ success: false, message: 'OTP expired or invalid' }, 400);
      if (otp !== storedOtp) return c.json({ success: false, message: 'Invalid OTP' }, 400);
      
      const userRepository = new UserRepository(config.db);
      const user = await userRepository.findByIdentifier(phone);
      
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
}

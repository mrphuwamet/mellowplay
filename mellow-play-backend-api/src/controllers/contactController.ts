import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ContactRepository } from '../repositories/contactRepository';
import { UserRepository } from '../repositories/userRepository';
import { ConfigService } from '../services/configService';
import { AuthService } from '../services/authService';
import { sendNotification } from '../services/alertService';

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

const MAX_MESSAGE_LENGTH = 1000;
const CATEGORIES = ['feedback', 'complaint', 'review', 'other'];
const CATEGORY_LABELS: Record<string, string> = {
  feedback: 'ข้อเสนอแนะ',
  complaint: 'ร้องเรียน',
  review: 'รีวิว',
  other: 'อื่นๆ',
};

export class ContactController {
  // Logged-in users attach their identity automatically; guests can still
  // reach this form (Contact Us doesn't require an account), so it's an
  // optional lookup rather than a hard 401 like the community endpoints.
  private async getOptionalUserId(c: Ctx, config: ConfigService): Promise<number | undefined> {
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return undefined;
    const payload = await AuthService.verifyToken(token, config.jwtSecret);
    return payload?.userId ?? undefined;
  }

  async submitMessage(c: Ctx) {
    try {
      const config = new ConfigService(c.env);
      const userId = await this.getOptionalUserId(c, config);
      const { category, message, contactName, contactPhone } = await c.req.json();

      const trimmedMessage = (message || '').trim();
      if (!trimmedMessage) return c.json({ success: false, message: 'Message is required' }, 400);
      if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
        return c.json({ success: false, message: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` }, 400);
      }
      const safeCategory = CATEGORIES.includes(category) ? category : 'other';

      let author = 'Guest';
      let phone = contactPhone;
      if (userId) {
        const userRepo = new UserRepository(config.db);
        const user = await userRepo.findById(userId);
        if (user) {
          author = user.display_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Member';
          phone = phone || user.phone;
        }
      } else if (contactName) {
        author = contactName;
      }

      const repo = new ContactRepository(config.db);
      const id = await repo.createMessage({
        userId,
        category: safeCategory,
        message: trimmedMessage,
        contactName,
        contactPhone,
      });

      await sendNotification(config.db, `ข้อความติดต่อใหม่ (${CATEGORY_LABELS[safeCategory]})`, {
        'จาก': author,
        'เบอร์โทร': phone || '-',
        'ประเภท': CATEGORY_LABELS[safeCategory],
        'ข้อความ': trimmedMessage,
      });

      return c.json({ success: true, id });
    } catch (error: any) {
      return c.json({ success: false, message: error.message }, 500);
    }
  }
}

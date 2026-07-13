import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { RedemptionRepository } from '../repositories/redemptionRepository';
import { ConfigService } from '../services/configService';

export class RedemptionController {
  private repo(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const config = new ConfigService(c.env);
    return new RedemptionRepository(config.db);
  }

  async create(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const { childId, rewardName, stampCost, ageGroup } = await c.req.json();
      if (!childId || !rewardName || !stampCost || !ageGroup) {
        return c.json({ success: false, message: 'Missing parameters' }, 400);
      }

      // Generate random claim code, e.g. MP-RW-H4X9B
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let codeSuffix = '';
      for (let i = 0; i < 5; i++) {
        codeSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const claimCode = `MP-RW-${codeSuffix}`;

      const id = await this.repo(c).createRedemption({
        childId: parseInt(childId),
        rewardName,
        stampCost: parseInt(stampCost),
        ageGroup,
        claimCode
      });

      return c.json({ success: true, id, claimCode });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async listByChild(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const childId = parseInt(c.req.param('childId'));
      const redemptions = await this.repo(c).getRedemptionsByChild(childId);
      return c.json({ success: true, redemptions });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async listPending(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const redemptions = await this.repo(c).getPendingRedemptions();
      return c.json({ success: true, redemptions });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  async claim(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const id = parseInt(c.req.param('id'));
      await this.repo(c).claimRedemption(id);
      return c.json({ success: true });
    } catch (e: any) {
      return c.json({ success: false, message: e.message }, 500);
    }
  }
}

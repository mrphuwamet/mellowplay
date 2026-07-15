import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { HRRepository } from '../repositories/hrRepository';
import { SettingsRepository } from '../repositories/settingsRepository';
import { sendAlert } from '../services/alertService';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

export class HRController {
  private repo(c: C) { return new HRRepository(new ConfigService(c.env).db); }

  // ── Packages ───────────────────────────────────────────────────────────────
  async getPackages(c: C) {
    try { return c.json({ success: true, packages: await this.repo(c).getPackages() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async createPackage(c: C) {
    try {
      const d = await c.req.json();
      if (!d.name) return c.json({ success: false, message: 'name required' }, 400);
      const id = await this.repo(c).createPackage(d);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async updatePackage(c: C) {
    try {
      await this.repo(c).updatePackage(parseInt(c.req.param('id')), await c.req.json());
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async deletePackage(c: C) {
    try {
      await this.repo(c).deletePackage(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Package Purchases (consumer self-service storefront) ───────────────────
  async getActivePackages(c: C) {
    try { return c.json({ success: true, packages: await this.repo(c).getActivePackages() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async purchasePackage(c: C) {
    try {
      const config = new ConfigService(c.env);
      const packageId = parseInt(c.req.param('id'));
      const { childId, userId } = await c.req.json();
      if (!childId) return c.json({ success: false, message: 'childId required' }, 400);

      const pkg = await this.repo(c).getPackageById(packageId);
      if (!pkg || !pkg.active) return c.json({ success: false, message: 'Package not found' }, 404);

      const purchaseId = await this.repo(c).createPackagePurchase({
        packageId, childId: parseInt(childId), userId: userId ? parseInt(userId) : undefined, amount: pkg.price,
      });

      if (pkg.price <= 0) {
        // Free package — skip Beam entirely and credit stamps immediately.
        await this.repo(c).creditPackageCoupons(pkg, parseInt(childId));
        await config.db.prepare(`UPDATE Package_Purchases SET status='paid', payment_method='free' WHERE id=?`).bind(purchaseId).run();
        return c.json({ success: true, id: purchaseId, paymentUrl: '' });
      }

      const settingsRepo = new SettingsRepository(config.db);
      const BEAM_API_KEY = await settingsRepo.getOverridable('beam_api_key', c.env.BEAM_API_KEY);
      const BEAM_MERCHANT_ID = await settingsRepo.getOverridable('beam_merchant_id', c.env.BEAM_MERCHANT_ID);
      if (!BEAM_API_KEY || !BEAM_MERCHANT_ID) {
        return c.json({ success: false, message: 'Beam credentials not found' }, 500);
      }

      const authString = btoa(`${BEAM_MERCHANT_ID}:${BEAM_API_KEY}`);
      const baseUrl = c.req.header('origin') || 'http://localhost:5173';
      const redirectUrl = `${baseUrl}/package-purchase-success?purchaseId=${purchaseId}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const netAmount = Math.round(pkg.price * 100);

      const payload = {
        linkSettings: {
          card: { isEnabled: true },
          qrPromptPay: { isEnabled: true },
          eWallets: { isEnabled: true },
          mobileBanking: { isEnabled: true },
        },
        order: {
          currency: 'THB',
          netAmount,
          description: `Package: ${pkg.name}`,
          referenceId: `PKG-${purchaseId}-${Date.now()}`,
        },
        expiresAt,
        redirectUrl,
      };

      const res = await fetch('https://api.beamcheckout.com/api/v1/payment-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${authString}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }
      const data: any = await res.json();

      await this.repo(c).setPackagePurchaseBeamSession(purchaseId, data.id);

      return c.json({ success: true, id: purchaseId, paymentUrl: data.url });
    } catch (error: any) {
      await sendAlert(new ConfigService(c.env).db, 'Payment Error (Package Purchase)', {
        purchaseId, error: error.message,
      });
      return c.json({ success: false, message: 'ระบบชำระเงินขัดข้อง กรุณาลองใหม่อีกครั้ง หรือติดต่อพนักงาน' }, 500);
    }
  }

  async getPackagePurchaseStatus(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const purchase = await this.repo(c).getPackagePurchase(id);
      if (!purchase) return c.json({ success: false, message: 'Purchase not found' }, 404);
      return c.json({ success: true, purchase });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Campaign Bonuses ───────────────────────────────────────────────────────
  async getCampaigns(c: C) {
    try { return c.json({ success: true, campaigns: await this.repo(c).getCampaigns() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async createCampaign(c: C) {
    try {
      const d = await c.req.json();
      if (!d.name) return c.json({ success: false, message: 'name required' }, 400);
      const id = await this.repo(c).createCampaign(d);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async updateCampaign(c: C) {
    try {
      await this.repo(c).updateCampaign(parseInt(c.req.param('id')), await c.req.json());
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async deleteCampaign(c: C) {
    try {
      await this.repo(c).deleteCampaign(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Diligence Rules ────────────────────────────────────────────────────────
  async getDiligenceRules(c: C) {
    try { return c.json({ success: true, rules: await this.repo(c).getDiligenceRules() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async createDiligenceRule(c: C) {
    try {
      const d = await c.req.json();
      if (!d.name) return c.json({ success: false, message: 'name required' }, 400);
      const id = await this.repo(c).createDiligenceRule(d);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async updateDiligenceRule(c: C) {
    try {
      await this.repo(c).updateDiligenceRule(parseInt(c.req.param('id')), await c.req.json());
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async deleteDiligenceRule(c: C) {
    try {
      await this.repo(c).deleteDiligenceRule(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Attendance ─────────────────────────────────────────────────────────────
  async getAttendance(c: C) {
    try {
      const { userId, year, month } = c.req.query();
      const records = await this.repo(c).getAttendance(
        userId ? parseInt(userId) : undefined,
        year  ? parseInt(year)  : undefined,
        month ? parseInt(month) : undefined,
      );
      return c.json({ success: true, records });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async upsertAttendance(c: C) {
    try {
      const d = await c.req.json();
      if (!d.crmUserId || !d.date) return c.json({ success: false, message: 'crmUserId and date required' }, 400);
      await this.repo(c).upsertAttendance(d);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async deleteAttendance(c: C) {
    try {
      const { userId, date } = c.req.query();
      if (!userId || !date) return c.json({ success: false, message: 'userId and date required' }, 400);
      await this.repo(c).deleteAttendance(parseInt(userId), date);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async getAttendanceSummary(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const { month, year } = c.req.query();
      const now = new Date();
      const summary = await this.repo(c).getAttendanceSummary(
        id,
        month ? parseInt(month) : now.getMonth() + 1,
        year ? parseInt(year) : now.getFullYear(),
      );
      return c.json({ success: true, ...summary });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Leave Requests ─────────────────────────────────────────────────────────
  async getLeaveRequests(c: C) {
    try {
      const { userId } = c.req.query();
      const requests = await this.repo(c).getLeaveRequests(userId ? parseInt(userId) : undefined);
      return c.json({ success: true, requests });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async createLeaveRequest(c: C) {
    try {
      const d = await c.req.json();
      if (!d.crmUserId || !d.type || !d.startDate || !d.endDate) return c.json({ success: false, message: 'missing required fields' }, 400);
      const id = await this.repo(c).createLeaveRequest(d);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async updateLeaveStatus(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const { status, approverNote } = await c.req.json();
      if (!status) return c.json({ success: false, message: 'status required' }, 400);
      await this.repo(c).updateLeaveStatus(id, status, approverNote);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Expense Advances ───────────────────────────────────────────────────────
  async getExpenseAdvances(c: C) {
    try {
      const { userId } = c.req.query();
      const advances = await this.repo(c).getExpenseAdvances(userId ? parseInt(userId) : undefined);
      return c.json({ success: true, advances });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async createExpenseAdvance(c: C) {
    try {
      const d = await c.req.json();
      if (!d.crmUserId || !d.date || !d.amount || !d.category || !d.description)
        return c.json({ success: false, message: 'missing required fields' }, 400);
      const id = await this.repo(c).createExpenseAdvance(d);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async updateExpenseStatus(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const { status, note } = await c.req.json();
      if (!status) return c.json({ success: false, message: 'status required' }, 400);
      await this.repo(c).updateExpenseStatus(id, status, note);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Payouts ────────────────────────────────────────────────────────────────
  async getPayouts(c: C) {
    try {
      const { period } = c.req.query();
      const payouts = await this.repo(c).getPayouts(period);
      return c.json({ success: true, payouts });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async createPayout(c: C) {
    try {
      const d = await c.req.json();
      if (!d.crmUserId || !d.period) return c.json({ success: false, message: 'crmUserId and period required' }, 400);
      const id = await this.repo(c).createPayout(d);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async markPayoutPaid(c: C) {
    try {
      await this.repo(c).markPayoutPaid(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async generatePayout(c: C) {
    try {
      const { crmUserId, period, month, year } = await c.req.json();
      if (!crmUserId || !period || !month || !year)
        return c.json({ success: false, message: 'crmUserId, period, month, year required' }, 400);
      const id = await this.repo(c).generatePayout(crmUserId, period, month, year);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Incentive Summary (real data for IncentiveTracking.tsx) ────────────────
  async getMyIncentiveSummary(c: C) {
    try {
      const { crmUserId, month, year } = c.req.query();
      if (!crmUserId || !month || !year)
        return c.json({ success: false, message: 'crmUserId, month, year required' }, 400);
      const summary = await this.repo(c).getMyIncentiveSummary(parseInt(crmUserId), parseInt(month), parseInt(year));
      return c.json({ success: true, ...summary });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Leave Policies ─────────────────────────────────────────────────────────
  async getLeavePolicies(c: C) {
    try { return c.json({ success: true, policies: await this.repo(c).getLeavePolicies() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async upsertLeavePolicy(c: C) {
    try {
      const { employeeType, annualDays, sickDays, personalDays } = await c.req.json();
      if (!employeeType) return c.json({ success: false, message: 'employeeType required' }, 400);
      await this.repo(c).upsertLeavePolicy(employeeType, annualDays ?? 0, sickDays ?? 0, personalDays ?? 0);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { ReportRepository } from '../repositories/reportRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

const defaultDates = () => {
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
  return { startDate: `${y}-${m}-01`, endDate: now.toISOString().slice(0, 10) };
};

export class ReportController {
  private repo(c: C) { return new ReportRepository(new ConfigService(c.env).db); }

  async getTransactions(c: C) {
    try {
      const { startDate, endDate, type, branchId, search, limit, offset } = c.req.query();
      const d = defaultDates();
      const result = await this.repo(c).getTransactions({
        startDate: startDate || d.startDate,
        endDate:   endDate   || d.endDate,
        type,
        branchId: branchId ? parseInt(branchId) : undefined,
        search: search || undefined,
        limit:  limit  ? parseInt(limit)  : 100,
        offset: offset ? parseInt(offset) : 0,
      });
      return c.json({ success: true, ...result });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async getDailySales(c: C) {
    try {
      const d = defaultDates();
      const { startDate = d.startDate, endDate = d.endDate, branchId } = c.req.query();
      return c.json({ success: true, data: await this.repo(c).getDailySales(startDate, endDate, branchId ? parseInt(branchId) : undefined) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async getMonthlySales(c: C) {
    try {
      const { year } = c.req.query();
      return c.json({ success: true, data: await this.repo(c).getMonthlySales(year ? parseInt(year) : new Date().getFullYear()) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async getBestSellers(c: C) {
    try {
      const d = defaultDates();
      const { startDate = d.startDate, endDate = d.endDate, branchId } = c.req.query();
      return c.json({ success: true, ...(await this.repo(c).getBestSellers(startDate, endDate, branchId ? parseInt(branchId) : undefined)) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async getBusiestDays(c: C) {
    try {
      const d = defaultDates();
      const { startDate = d.startDate, endDate = d.endDate } = c.req.query();
      return c.json({ success: true, data: await this.repo(c).getBusiestDays(startDate, endDate) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async getSummaryKPIs(c: C) {
    try {
      const d = defaultDates();
      const { startDate = d.startDate, endDate = d.endDate, branchId } = c.req.query();
      return c.json({ success: true, kpis: await this.repo(c).getSummaryKPIs(startDate, endDate, branchId ? parseInt(branchId) : undefined) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

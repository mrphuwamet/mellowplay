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
      const { startDate, endDate, type, branchId, search, limit, offset, includeNonMonetary } = c.req.query();
      const d = defaultDates();
      const result = await this.repo(c).getTransactions({
        startDate: startDate || d.startDate,
        endDate:   endDate   || d.endDate,
        type,
        branchId: branchId ? parseInt(branchId) : undefined,
        search: search || undefined,
        limit:  limit  ? parseInt(limit)  : 100,
        offset: offset ? parseInt(offset) : 0,
        // Opt back in for anyone auditing coupon movements; the sales screen
        // never asks for it.
        moneyOnly: includeNonMonetary !== '1',
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

  async getTagAttribution(c: C) {
    try {
      const d = defaultDates();
      const { startDate = d.startDate, endDate = d.endDate, branchId } = c.req.query();
      const bId = branchId ? parseInt(branchId) : undefined;
      const [summary, trend, byCourse] = await Promise.all([
        this.repo(c).getTagAttributionSummary(startDate, endDate, bId),
        this.repo(c).getTagAttributionTrend(startDate, endDate, bId),
        this.repo(c).getTagAttributionByCourse(startDate, endDate, bId),
      ]);
      return c.json({ success: true, summary, trend, byCourse });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * Arrivals through a tagged link, and how they compare with registrations.
   *
   * Its own endpoint rather than more fields on getTagAttribution: the two
   * answer different questions, are read on different screens, and a click has
   * no branch to filter by.
   */
  async getTagClicks(c: C) {
    try {
      const d = defaultDates();
      const { startDate = d.startDate, endDate = d.endDate, branchId } = c.req.query();
      const bId = branchId ? parseInt(branchId) : undefined;
      const [summary, trend, paths, funnel] = await Promise.all([
        this.repo(c).getTagClickSummary(startDate, endDate),
        this.repo(c).getTagClickTrend(startDate, endDate),
        this.repo(c).getTagClickPaths(startDate, endDate),
        this.repo(c).getTagFunnel(startDate, endDate, bId),
      ]);
      return c.json({ success: true, summary, trend, paths, funnel });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * The name list behind the tag report — its own endpoint rather than another
   * field on getTagAttribution, because the dashboard loads on every date
   * change and would otherwise drag a few thousand rows along each time to
   * render three charts that need none of them.
   */
  async getTagAttributionPeople(c: C) {
    try {
      const d = defaultDates();
      const { startDate = d.startDate, endDate = d.endDate, branchId, tag } = c.req.query();
      const bId = branchId ? parseInt(branchId) : undefined;
      let people = await this.repo(c).getTagAttributionPeople(startDate, endDate, bId);
      // Narrowing to one tag is done here so the caller can hand back exactly
      // what the operator asked for instead of a file they have to filter.
      if (tag) people = people.filter((p: any) => p.tag === tag);
      return c.json({ success: true, people });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

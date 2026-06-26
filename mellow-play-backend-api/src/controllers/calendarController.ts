import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { CalendarRepository } from '../repositories/calendarRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

export class CalendarController {
  private repo(c: C) { return new CalendarRepository(new ConfigService(c.env).db); }

  // ── Calendars ──────────────────────────────────────────────────────────────
  async getCalendars(c: C) {
    try { return c.json({ success: true, calendars: await this.repo(c).getCalendars() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async createCalendar(c: C) {
    try {
      const d = await c.req.json();
      if (!d.name) return c.json({ success: false, message: 'name required' }, 400);
      const id = await this.repo(c).createCalendar(d);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async updateCalendar(c: C) {
    try {
      await this.repo(c).updateCalendar(parseInt(c.req.param('id')), await c.req.json());
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async deleteCalendar(c: C) {
    try {
      await this.repo(c).deleteCalendar(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Slot Rules ─────────────────────────────────────────────────────────────
  async getSlotRules(c: C) {
    try {
      const { calendarId } = c.req.query();
      const rules = await this.repo(c).getSlotRules(calendarId ? parseInt(calendarId) : undefined);
      return c.json({ success: true, rules });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async createSlotRule(c: C) {
    try {
      const d = await c.req.json();
      if (!d.calendarId || !d.startTime || !d.endTime || !d.validFrom)
        return c.json({ success: false, message: 'calendarId, startTime, endTime, validFrom required' }, 400);
      const id = await this.repo(c).createSlotRule(d);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async updateSlotRule(c: C) {
    try {
      await this.repo(c).updateSlotRule(parseInt(c.req.param('id')), await c.req.json());
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async deleteSlotRule(c: C) {
    try {
      await this.repo(c).deleteSlotRule(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Available Slots ────────────────────────────────────────────────────────
  async getAvailableSlots(c: C) {
    try {
      const { calendarId, date, courseDuration } = c.req.query();
      if (!calendarId || !date) return c.json({ success: false, message: 'calendarId and date required' }, 400);
      const durMin = courseDuration ? Math.round(parseFloat(courseDuration) * 60) : undefined;
      const slots = await this.repo(c).getAvailableSlots(parseInt(calendarId), date, durMin);
      return c.json({ success: true, slots });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

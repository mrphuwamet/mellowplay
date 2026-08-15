import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { CalendarRepository } from '../repositories/calendarRepository';
import { resolveInviteBoostRuleId } from './inviteAccessController';

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

  async getUpcomingSlots(c: C) {
    try {
      const calendarId = c.req.query('calendarId');
      const branchId = c.req.query('branchId');
      if (!calendarId) return c.json({ success: false, message: 'calendarId required' }, 400);

      // An invite-link session (courseId + inviteSessionToken) unlocks the
      // extra invite_capacity on whichever round it's scoped to — resolved
      // here so an invited guest sees the real remaining count, not "full".
      const courseId = c.req.query('courseId');
      const inviteSessionToken = c.req.query('inviteSessionToken');
      const config = new ConfigService(c.env);
      const boostRuleId = await resolveInviteBoostRuleId(
        inviteSessionToken, courseId ? parseInt(courseId) : undefined, config.db, config.jwtSecret
      );

      // The CRM's edit-booking dialog passes the booking being edited so its
      // own seat doesn't count against the rounds shown (see the repository
      // comment). Display-only — booking creation still checks capacity.
      const excludeBookingIdRaw = c.req.query('excludeBookingId');
      const excludeBookingId = excludeBookingIdRaw && !isNaN(parseInt(excludeBookingIdRaw)) ? parseInt(excludeBookingIdRaw) : undefined;

      // 90 days (not 30) so an infrequent course (e.g. weekly) still has
      // enough runway to surface up to the ~10 upcoming rounds the consumer
      // app displays, instead of coming up short just because they're spread
      // out further than a month.
      const upcoming = await this.repo(c).getUpcomingSlots(parseInt(calendarId), 90, branchId ? parseInt(branchId) : undefined, boostRuleId, excludeBookingId);
      return c.json({ success: true, upcoming });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Available Slots for a date ─────────────────────────────────────────────
  async getAvailableSlots(c: C) {
    try {
      const { calendarId, date, courseDuration } = c.req.query();
      if (!calendarId || !date) return c.json({ success: false, message: 'calendarId and date required' }, 400);
      const durMin = courseDuration ? Math.round(parseFloat(courseDuration) * 60) : undefined;
      const slots = await this.repo(c).getAvailableSlots(parseInt(calendarId), date, durMin);
      return c.json({ success: true, slots });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Holidays ───────────────────────────────────────────────────────────────
  // ── Day labels ─────────────────────────────────────────────────────────
  // A note pinned to a whole date, alongside the per-round labels that already
  // existed. Same shape as the holiday endpoints below it.
  async getDayLabels(c: C) {
    try {
      const { calendarId } = c.req.query();
      if (!calendarId) return c.json({ success: false, message: 'calendarId required' }, 400);
      return c.json({ success: true, dayLabels: await this.repo(c).getDayLabels(parseInt(calendarId)) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async saveDayLabel(c: C) {
    try {
      const d = await c.req.json();
      const label = (d.label ?? '').trim();
      if (!d.calendarId || !d.specificDate || !label) {
        return c.json({ success: false, message: 'calendarId, specificDate and label are required' }, 400);
      }
      await this.repo(c).saveDayLabel(parseInt(d.calendarId), d.specificDate, label);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async deleteDayLabel(c: C) {
    try {
      await this.repo(c).deleteDayLabel(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async getHolidays(c: C) {
    try {
      const { calendarId } = c.req.query();
      if (!calendarId) return c.json({ success: false, message: 'calendarId required' }, 400);
      const holidays = await this.repo(c).getHolidays(parseInt(calendarId));
      return c.json({ success: true, holidays });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async createHoliday(c: C) {
    try {
      const d = await c.req.json();
      if (!d.calendarId || !d.date) return c.json({ success: false, message: 'calendarId and date required' }, 400);
      const id = await this.repo(c).createHoliday(d);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async deleteHoliday(c: C) {
    try {
      await this.repo(c).deleteHoliday(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

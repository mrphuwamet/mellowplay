import { CalendarRepository } from './calendarRepository';

/**
 * Seat capacity across everything that is still to happen — what the CRM's
 * "ภาพรวมการจอง" tab reads.
 *
 * Grouped by CALENDAR, not by course, and that is the whole reason this exists
 * as its own query rather than a loop over courses in the browser: seats belong
 * to a calendar slot, and several courses can share one calendar (that is
 * exactly how the Family Fact or Fake rounds are set up). Adding up each
 * course's view of the same slot would report seats that do not exist. Every
 * course sharing a calendar is listed against it instead.
 *
 * One round of a calendar = one row of Calendar_Slot_Rules resolved onto a
 * date. Capacity and booked counts come from the same code path the consumer
 * app books against (CalendarRepository.getUpcomingSlots), so this screen and
 * the booking form can never disagree about how many seats are left.
 */

export interface CapacityRound {
  date: string;
  startTime: string;
  endTime: string;
  label: string | null;
  capacity: number;
  booked: number;
  remaining: number;
  fillRate: number;
  daysAway: number;
}

export interface CapacityTeam {
  courseId: number;
  courseName: string;
  /** The round these numbers are for — team capacity resets each round. */
  round: string;
  fieldLabel: string;
  teamLabel: string;
  capacity: number;
  booked: number;
  remaining: number;
}

export class BookingCapacityRepository {
  private db: D1Database;
  private calendars: CalendarRepository;

  constructor(db: D1Database) {
    this.db = db;
    this.calendars = new CalendarRepository(db);
  }

  async getOverview(daysAhead = 30): Promise<any> {
    const { results: courseRows } = await this.db.prepare(`
      SELECT c.id, c.name, c.calendar_id, c.is_event, c.is_service, c.registration_form_id,
             cal.name AS calendar_name
      FROM Courses c
      JOIN Calendars cal ON cal.id = c.calendar_id
      WHERE c.calendar_id IS NOT NULL
        AND COALESCE(c.is_visible, 1) = 1
      ORDER BY c.name
    `).all<any>();

    const byCalendar = new Map<number, { calendarId: number; calendarName: string; courses: any[] }>();
    for (const row of courseRows as any[]) {
      if (!byCalendar.has(row.calendar_id)) {
        byCalendar.set(row.calendar_id, {
          calendarId: row.calendar_id,
          calendarName: row.calendar_name,
          courses: [],
        });
      }
      byCalendar.get(row.calendar_id)!.courses.push(row);
    }

    const todayMs = Date.now() + 7 * 60 * 60 * 1000; // Bangkok, same offset getUpcomingSlots uses
    const today = new Date(todayMs).toISOString().split('T')[0];

    const calendars: any[] = [];
    for (const group of byCalendar.values()) {
      const upcoming = await this.calendars.getUpcomingSlots(group.calendarId, daysAhead);

      const rounds: CapacityRound[] = [];
      for (const day of upcoming) {
        for (const slot of day.slots) {
          const capacity = slot.maxCapacity ?? 0;
          const booked = slot.booked ?? 0;
          rounds.push({
            date: day.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            label: slot.label ?? day.dayLabel ?? null,
            capacity,
            booked,
            remaining: Math.max(0, capacity - booked),
            fillRate: capacity > 0 ? booked / capacity : 0,
            daysAway: Math.round(
              (Date.parse(`${day.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
            ),
          });
        }
      }

      const seats = rounds.reduce((n, r) => n + r.capacity, 0);
      const booked = rounds.reduce((n, r) => n + r.booked, 0);
      calendars.push({
        calendarId: group.calendarId,
        calendarName: group.calendarName,
        courses: group.courses.map(c => ({ id: c.id, name: c.name, isEvent: !!c.is_event, isService: !!c.is_service })),
        seats,
        booked,
        remaining: Math.max(0, seats - booked),
        fillRate: seats > 0 ? booked / seats : 0,
        roundCount: rounds.length,
        fullRounds: rounds.filter(r => r.capacity > 0 && r.remaining === 0).length,
        rounds,
      });
    }

    // Every course inherits the rounds of the calendar it sits on. Passing
    // them in is what makes a team appear on a round nobody has booked yet —
    // deriving the round list from submissions instead meant an empty round
    // had no teams at all, which read as "this round has no teams" rather than
    // "every team is still open".
    const roundsByCourse = new Map<number, string[]>();
    for (const cal of calendars) {
      const keys = cal.rounds.map((r: CapacityRound) => `${r.date} ${r.startTime}`);
      for (const course of cal.courses) roundsByCourse.set(course.id, keys);
    }
    const teams = await this.getTeamCapacity(courseRows as any[], today, daysAhead, roundsByCourse);

    const seats = calendars.reduce((n, c) => n + c.seats, 0);
    const bookedTotal = calendars.reduce((n, c) => n + c.booked, 0);
    const allRounds = calendars.flatMap(c =>
      c.rounds.map((r: CapacityRound) => ({ ...r, calendarName: c.calendarName, courses: c.courses })));

    return {
      generatedAt: new Date().toISOString(),
      daysAhead,
      totals: {
        seats,
        booked: bookedTotal,
        remaining: Math.max(0, seats - bookedTotal),
        fillRate: seats > 0 ? bookedTotal / seats : 0,
        rounds: allRounds.length,
        fullRounds: allRounds.filter(r => r.capacity > 0 && r.remaining === 0).length,
        calendars: calendars.length,
        // How fast seats are actually going. A remaining count alone cannot say
        // whether 40 free seats is comfortable or a problem; a week of intake
        // is what makes it readable.
        bookedLast7Days: await this.countRecentBookings(7),
        bookedPrev7Days: await this.countRecentBookings(14, 7),
      },
      calendars,
      teams,
      // Two lists worth acting on, computed here rather than in the browser so
      // every viewer sorts them the same way.
      nearlyFull: allRounds
        .filter(r => r.capacity > 0 && r.remaining > 0 && r.fillRate >= 0.8)
        .sort((a, b) => b.fillRate - a.fillRate)
        .slice(0, 20),
      quietAndSoon: allRounds
        .filter(r => r.capacity > 0 && r.daysAway <= 7 && r.fillRate < 0.4)
        .sort((a, b) => a.daysAway - b.daysAway || a.fillRate - b.fillRate)
        .slice(0, 20),
    };
  }

  /** Bookings created in a window, for the intake-rate comparison. */
  private async countRecentBookings(daysBack: number, daysBackEnd = 0): Promise<number> {
    const row = await this.db.prepare(`
      SELECT COUNT(*) AS n FROM Bookings
      WHERE status != 'cancelled'
        AND created_at >= datetime('now', ?)
        AND created_at <  datetime('now', ?)
    `).bind(`-${daysBack} days`, `-${daysBackEnd} days`).first<{ n: number }>();
    return row?.n ?? 0;
  }

  /**
   * Remaining spots per team, summed across every upcoming round.
   *
   * One query per form rather than the one-per-round-per-course the capacity
   * dialog does: a dashboard covering a month of rounds would otherwise fire
   * dozens of requests to render a single card.
   */
  private async getTeamCapacity(
    courseRows: any[],
    today: string,
    daysAhead: number,
    roundsByCourse: Map<number, string[]>,
  ): Promise<CapacityTeam[]> {
    const withForms = courseRows.filter(c => c.registration_form_id);
    if (withForms.length === 0) return [];

    const endDate = new Date(Date.parse(`${today}T00:00:00Z`) + daysAhead * 86400000)
      .toISOString().split('T')[0];

    const out: CapacityTeam[] = [];
    const fieldCache = new Map<number, any[]>();

    for (const course of withForms) {
      let fields = fieldCache.get(course.registration_form_id);
      if (!fields) {
        const { results } = await this.db.prepare(
          `SELECT field_key, label, options_json FROM Registration_Form_Fields
           WHERE form_id = ? AND type = 'team_select'`
        ).bind(course.registration_form_id).all<any>();
        fields = results as any[];
        fieldCache.set(course.registration_form_id, fields);
      }
      if (fields.length === 0) continue;

      const { results: submissions } = await this.db.prepare(`
        SELECT fs.scheduled_at, fs.answers_json FROM Form_Submissions fs
        WHERE fs.course_id = ?
          AND SUBSTR(fs.scheduled_at, 1, 10) >= ?
          AND SUBSTR(fs.scheduled_at, 1, 10) <= ?
          AND EXISTS (SELECT 1 FROM Bookings b WHERE b.form_submission_id = fs.id AND b.status != 'cancelled')
      `).bind(course.id, today, endDate).all<any>();

      // Keyed by round as well as by team: a team's capacity resets every
      // round, so counting a whole month against one ceiling would report a
      // team as full when it is empty for the round anyone is booking.
      //
      // A submission's scheduled_at can carry seconds where the calendar's
      // round key does not, so both sides are cut to "YYYY-MM-DD HH:MM" before
      // they are compared — otherwise a round's own bookings would land under
      // a key nothing else uses and every team would look untouched.
      const counts = new Map<string, number>();
      for (const row of submissions as any[]) {
        let answers: Record<string, any> = {};
        try { answers = JSON.parse(row.answers_json || '{}'); } catch { continue; }
        const round = String(row.scheduled_at || '').slice(0, 16);
        for (const f of fields) {
          const chosen = answers[f.field_key];
          if (!chosen) continue;
          const key = `${round}::${f.field_key}::${chosen}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }

      for (const round of roundsByCourse.get(course.id) ?? []) {
        for (const f of fields) {
          let options: { label: string; capacity?: number }[] = [];
          try { options = f.options_json ? JSON.parse(f.options_json) : []; } catch { /* malformed options list just contributes nothing */ }
          for (const opt of options) {
            const booked = counts.get(`${round}::${f.field_key}::${opt.label}`) ?? 0;
            const capacity = opt.capacity ?? 0;
            out.push({
              courseId: course.id,
              courseName: course.name,
              round,
              fieldLabel: f.label,
              teamLabel: opt.label,
              capacity,
              booked,
              remaining: Math.max(0, capacity - booked),
            });
          }
        }
      }
    }
    return out;
  }
}

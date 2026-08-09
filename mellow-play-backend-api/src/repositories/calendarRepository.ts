// A booking occupies a seat if EITHER signal says so — status (confirmed/
// confirmed_paid/completed/awaiting_report) or payment_status (paid/prepaid,
// the latter being coupon-paid bookings) — plus a short grace window for a
// booking still mid-checkout, so two people can't grab the same last seat
// at once. Checking only one of the two fields previously undercounted
// occupied seats whenever they drifted out of sync with each other:
// coupon-paid bookings (status='confirmed', payment_status='prepaid') were
// never counted at all, and a booking manually corrected to confirmed_paid
// via the CRM's force-status tool without payment_status also being synced
// (see adminController.updateBookingStatus) stayed invisible to capacity
// too — a real customer's confirmed seat looked open to everyone else.
const OCCUPIES_SEAT_SQL = `
  b.status != 'cancelled'
  AND (
    b.status IN ('confirmed', 'confirmed_paid', 'completed', 'awaiting_report')
    OR b.payment_status IN ('paid', 'prepaid')
    OR ((b.status = 'pending_payment' OR b.payment_status = 'pending') AND (strftime('%s', 'now') - strftime('%s', b.created_at)) < 300)
  )
`;

export class CalendarRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  // ── Calendars ──────────────────────────────────────────────────────────────
  async getCalendars(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Calendars ORDER BY id').all();
    return results;
  }
  async createCalendar(d: any): Promise<number> {
    const r = await this.db.prepare(`
      INSERT INTO Calendars (name, description, color, type, branch_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(d.name, d.description ?? null, d.color ?? '#7c3aed', d.type ?? 'class', d.branchId ?? null).run();
    return r.meta.last_row_id as number;
  }
  async updateCalendar(id: number, d: any): Promise<void> {
    await this.db.prepare(`
      UPDATE Calendars SET name=?, description=?, color=?, type=?, is_active=? WHERE id=?
    `).bind(d.name, d.description ?? null, d.color ?? '#7c3aed', d.type ?? 'class', d.isActive ? 1 : 0, id).run();
  }
  async deleteCalendar(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Calendars WHERE id=?').bind(id).run();
  }

  // ── Slot Rules ─────────────────────────────────────────────────────────────
  async getSlotRules(calendarId?: number): Promise<any[]> {
    let sql = 'SELECT * FROM Calendar_Slot_Rules WHERE 1=1';
    const params: any[] = [];
    if (calendarId) { sql += ' AND calendar_id=?'; params.push(calendarId); }
    sql += ' ORDER BY day_of_week, start_time';
    const { results } = await this.db.prepare(sql).bind(...params).all();
    return results;
  }
  async createSlotRule(d: any): Promise<number> {
    const r = await this.db.prepare(`
      INSERT INTO Calendar_Slot_Rules (calendar_id, day_of_week, specific_date, start_time, end_time, max_capacity, invite_capacity, valid_from, valid_until, label)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(d.calendarId, d.dayOfWeek ?? null, d.specificDate ?? null, d.startTime, d.endTime,
            d.maxCapacity ?? 4, d.inviteCapacity ?? 0, d.validFrom, d.validUntil ?? null, d.label?.trim() || null).run();
    return r.meta.last_row_id as number;
  }
  async updateSlotRule(id: number, d: any): Promise<void> {
    await this.db.prepare(`
      UPDATE Calendar_Slot_Rules SET day_of_week=?, specific_date=?, start_time=?, end_time=?,
        max_capacity=?, invite_capacity=?, valid_from=?, valid_until=?, is_active=?, label=? WHERE id=?
    `).bind(d.dayOfWeek ?? null, d.specificDate ?? null, d.startTime, d.endTime,
            d.maxCapacity ?? 4, d.inviteCapacity ?? 0, d.validFrom, d.validUntil ?? null, d.isActive ? 1 : 0, d.label?.trim() || null, id).run();
  }
  async deleteSlotRule(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Calendar_Slot_Rules WHERE id=?').bind(id).run();
  }

  // ── Available Slots for a date ─────────────────────────────────────────────
  private async expirePendingBookings() {
    try {
      // Real cash-payment bookings are created with payment_status
      // 'pending_payment' (see adminController.createBooking), not the bare
      // 'pending' this query used to check exclusively — so it was matching
      // almost nothing in production and abandoned Beam checkouts never
      // actually auto-cancelled/released their seat. Checking status IN
      // ('pending', 'pending_payment') as well covers both spellings.
      await this.db.prepare(`
        UPDATE Bookings
        SET status = 'cancelled', payment_status = 'expired'
        WHERE (payment_status IN ('pending', 'pending_payment') OR status IN ('pending', 'pending_payment'))
          AND status != 'cancelled'
          AND created_at < datetime('now', '-15 minutes')
      `).run();
    } catch (e) {
      console.error('Failed to expire pending bookings:', e);
    }
  }

  async getAvailableSlots(calendarId: number, date: string, courseDurationMin?: number): Promise<any[]> {
    await this.expirePendingBookings();
    
    // Check if the requested date is a holiday
    const { results: holidays } = await this.db.prepare('SELECT * FROM Calendar_Holidays WHERE calendar_id=? AND date=?').bind(calendarId, date).all();
    if (holidays && holidays.length > 0) return [];

    const dow = new Date(date).getDay();
    const { results: rules } = await this.db.prepare(`
      SELECT * FROM Calendar_Slot_Rules
      WHERE calendar_id=? AND is_active=1
        AND valid_from <= ? AND (valid_until IS NULL OR valid_until >= ?)
        AND (day_of_week=? OR specific_date=?)
    `).bind(calendarId, date, date, dow, date).all();

    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const toStr = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

    const slots = [];
    for (const rule of rules as any[]) {
      const startMin = toMin(rule.start_time);
      const endMin = toMin(rule.end_time);
      const durMin = courseDurationMin && courseDurationMin > 0 ? courseDurationMin : (endMin - startMin);

      const subSlotTimes: { start: string; end: string }[] = [];
      for (let t = startMin; t + durMin <= endMin; t += durMin) {
        subSlotTimes.push({ start: toStr(t), end: toStr(t + durMin) });
      }
      if (subSlotTimes.length === 0) subSlotTimes.push({ start: rule.start_time, end: rule.end_time });

      for (const { start, end } of subSlotTimes) {
        const { results: bookings } = await this.db.prepare(`
          SELECT COUNT(*) as cnt FROM Bookings b
          JOIN Courses c ON b.course_id = c.id
          WHERE c.calendar_id=? AND SUBSTR(b.scheduled_at, 1, 10)=? AND SUBSTR(b.scheduled_at, 12, 5)=?
            AND ${OCCUPIES_SEAT_SQL}
        `).bind(calendarId, date, start).all();
        const booked = (bookings[0] as any)?.cnt ?? 0;
        slots.push({
          ruleId: rule.id,
          label: rule.label ?? null,
          startTime: start,
          endTime: end,
          maxCapacity: rule.max_capacity,
          booked,
          available: rule.max_capacity - booked,
        });
      }
    }
    return slots;
  }

  // boostRuleId — from resolveInviteBoostRuleId, an invite-link session's
  // scoped rule — adds that rule's invite_capacity on top of max_capacity
  // for whichever slots came from it. Every other rule (and every visitor
  // without a valid invite session) only ever sees max_capacity; the extra
  // pool stays invisible unless you're the one holding that exact link.
  async getUpcomingSlots(calendarId: number, daysAhead: number = 30, branchId?: number, boostRuleId?: number | null): Promise<any[]> {
    await this.expirePendingBookings();
    
    const today = new Date();
    // Use local time for Thai timezone if needed, but we'll just use standard ISO date 
    // Mellow Play operates in Thailand, so let's adjust by +7 hours to get the local date
    const localNow = new Date(today.getTime() + 7 * 60 * 60 * 1000);
    const startDateStr = localNow.toISOString().split('T')[0];
    
    const endDate = new Date(localNow.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const endDateStr = endDate.toISOString().split('T')[0];

    const bookingsQuery = `
        SELECT SUBSTR(b.scheduled_at, 1, 10) as slot_date, SUBSTR(b.scheduled_at, 12, 5) as slot_start_time, COUNT(*) as cnt 
        FROM Bookings b
        JOIN Courses c ON b.course_id = c.id
        WHERE c.calendar_id=? ${branchId ? `AND b.branch_id=${branchId}` : ''}
          AND SUBSTR(b.scheduled_at, 1, 10) >= ? AND SUBSTR(b.scheduled_at, 1, 10) <= ?
          AND ${OCCUPIES_SEAT_SQL}
        GROUP BY SUBSTR(b.scheduled_at, 1, 10), SUBSTR(b.scheduled_at, 12, 5)
    `;

    const [rulesRes, holidaysRes, bookingsRes] = await this.db.batch([
      this.db.prepare('SELECT * FROM Calendar_Slot_Rules WHERE calendar_id=? AND is_active=1').bind(calendarId),
      this.db.prepare('SELECT * FROM Calendar_Holidays WHERE calendar_id=? AND date >= ? AND date <= ?').bind(calendarId, startDateStr, endDateStr),
      this.db.prepare(bookingsQuery).bind(calendarId, startDateStr, endDateStr)
    ]);

    const rules = rulesRes.results as any[];
    const holidays = new Set((holidaysRes.results as any[]).map(h => h.date));
    const bookingMap = new Map();
    (bookingsRes.results as any[]).forEach(b => {
      bookingMap.set(`${b.slot_date}_${b.slot_start_time.substring(0,5)}`, b.cnt);
    });

    const upcoming = [];
    
    for (let i = 0; i < daysAhead; i++) {
      const current = new Date(localNow.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = current.toISOString().split('T')[0];
      
      if (holidays.has(dateStr)) continue;

      const dow = current.getDay();
      
      const daySlots = [];
      for (const rule of rules) {
        if (rule.valid_from && dateStr < rule.valid_from) continue;
        if (rule.valid_until && dateStr > rule.valid_until) continue;
        
        if (rule.day_of_week !== null && rule.day_of_week !== dow) continue;
        if (rule.specific_date !== null && rule.specific_date !== dateStr) continue;

        const startTime = rule.start_time.substring(0, 5);
        const booked = bookingMap.get(`${dateStr}_${startTime}`) || 0;
        const effectiveCapacity = rule.id === boostRuleId ? rule.max_capacity + (rule.invite_capacity || 0) : rule.max_capacity;
        daySlots.push({
          ruleId: rule.id,
          label: rule.label ?? null,
          startTime: startTime,
          endTime: rule.end_time.substring(0, 5),
          maxCapacity: effectiveCapacity,
          booked,
          available: Math.max(0, effectiveCapacity - booked),
        });
      }

      if (daySlots.length > 0) {
        daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
        upcoming.push({ date: dateStr, slots: daySlots });
      }
    }

    return upcoming;
  }

  // Single-slot capacity check used server-side at booking creation time —
  // getUpcomingSlots/getAvailableSlots only feed the UI, which a stale page,
  // a race between two simultaneous bookers, or a direct API call can all
  // bypass, so nothing previously stopped a booking past max_capacity.
  async getSlotAvailability(calendarId: number, slotDate: string, slotStartTime: string, branchId?: number, boostRuleId?: number | null): Promise<{ maxCapacity: number; booked: number; available: number } | null> {
    await this.expirePendingBookings();

    const dow = new Date(slotDate).getDay();
    const { results: rules } = await this.db.prepare(`
      SELECT * FROM Calendar_Slot_Rules
      WHERE calendar_id=? AND is_active=1
        AND valid_from <= ? AND (valid_until IS NULL OR valid_until >= ?)
        AND (day_of_week=? OR specific_date=?)
        AND SUBSTR(start_time, 1, 5) = ?
    `).bind(calendarId, slotDate, slotDate, dow, slotDate, slotStartTime).all();

    const rule = (rules as any[])[0];
    if (!rule) return null;

    const bookingsQuery = `
      SELECT COUNT(*) as cnt FROM Bookings b
      JOIN Courses c ON b.course_id = c.id
      WHERE c.calendar_id=? ${branchId ? 'AND b.branch_id=?' : ''}
        AND SUBSTR(b.scheduled_at, 1, 10)=? AND SUBSTR(b.scheduled_at, 12, 5)=?
        AND ${OCCUPIES_SEAT_SQL}
    `;
    const bindArgs = branchId ? [calendarId, branchId, slotDate, slotStartTime] : [calendarId, slotDate, slotStartTime];
    const { results: bookings } = await this.db.prepare(bookingsQuery).bind(...bindArgs).all();

    const booked = (bookings[0] as any)?.cnt ?? 0;
    // Same invite-capacity boost as getUpcomingSlots, but this is the one
    // that actually gates whether the booking is allowed to go through —
    // the display-only number above can't be trusted (stale page, forged
    // request), so this re-resolves it independently at creation time.
    const effectiveCapacity = rule.id === boostRuleId ? rule.max_capacity + (rule.invite_capacity || 0) : rule.max_capacity;
    return { maxCapacity: effectiveCapacity, booked, available: Math.max(0, effectiveCapacity - booked) };
  }

  // ── Holidays ───────────────────────────────────────────────────────────────
  async getHolidays(calendarId: number): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Calendar_Holidays WHERE calendar_id=? ORDER BY date').bind(calendarId).all();
    return results;
  }
  async createHoliday(d: any): Promise<number> {
    const r = await this.db.prepare(`
      INSERT INTO Calendar_Holidays (calendar_id, date, description)
      VALUES (?, ?, ?)
    `).bind(d.calendarId, d.date, d.description ?? null).run();
    return r.meta.last_row_id as number;
  }
  async deleteHoliday(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Calendar_Holidays WHERE id=?').bind(id).run();
  }
}

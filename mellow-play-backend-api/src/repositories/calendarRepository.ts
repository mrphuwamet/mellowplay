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
      INSERT INTO Calendar_Slot_Rules (calendar_id, day_of_week, specific_date, start_time, end_time, max_capacity, valid_from, valid_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(d.calendarId, d.dayOfWeek ?? null, d.specificDate ?? null, d.startTime, d.endTime,
            d.maxCapacity ?? 4, d.validFrom, d.validUntil ?? null).run();
    return r.meta.last_row_id as number;
  }
  async updateSlotRule(id: number, d: any): Promise<void> {
    await this.db.prepare(`
      UPDATE Calendar_Slot_Rules SET day_of_week=?, specific_date=?, start_time=?, end_time=?,
        max_capacity=?, valid_from=?, valid_until=?, is_active=? WHERE id=?
    `).bind(d.dayOfWeek ?? null, d.specificDate ?? null, d.startTime, d.endTime,
            d.maxCapacity ?? 4, d.validFrom, d.validUntil ?? null, d.isActive ? 1 : 0, id).run();
  }
  async deleteSlotRule(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Calendar_Slot_Rules WHERE id=?').bind(id).run();
  }

  // ── Available Slots for a date ─────────────────────────────────────────────
  async getAvailableSlots(calendarId: number, date: string, courseDurationMin?: number): Promise<any[]> {
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
          SELECT COUNT(*) as cnt FROM Bookings
          WHERE calendar_id=? AND slot_date=? AND slot_start_time=?
            AND payment_status != 'cancelled' AND status != 'cancelled'
        `).bind(calendarId, date, start).all();
        const booked = (bookings[0] as any)?.cnt ?? 0;
        slots.push({
          ruleId: rule.id,
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
}

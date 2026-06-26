export class QueueRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async getQueue(calendarId?: number, date?: string, startDate?: string, endDate?: string): Promise<any[]> {
    let sql = `
      SELECT q.*, cu.full_name AS staff_name, s.name AS service_name_ref
      FROM Service_Queue_Items q
      LEFT JOIN CRM_Users cu ON q.staff_id = cu.id
      LEFT JOIN Services s ON q.service_id = s.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (calendarId) { sql += ' AND q.calendar_id=?'; params.push(calendarId); }
    if (date)       { sql += ' AND q.slot_date=?';   params.push(date); }
    if (startDate)  { sql += ' AND q.slot_date>=?';  params.push(startDate); }
    if (endDate)    { sql += ' AND q.slot_date<=?';  params.push(endDate); }
    sql += ' ORDER BY q.slot_date ASC, q.queue_number ASC';
    const { results } = await this.db.prepare(sql).bind(...params).all();
    return results;
  }

  async updateQueueItem(id: number, d: { status?: string; staffId?: number | null; notes?: string | null; slotTime?: string | null; serviceId?: number | null; serviceName?: string | null; customerName?: string | null; customerPhone?: string | null }): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];
    if (d.status        !== undefined) { sets.push('status=?');         params.push(d.status); }
    if (d.staffId       !== undefined) { sets.push('staff_id=?');       params.push(d.staffId); }
    if (d.notes         !== undefined) { sets.push('notes=?');          params.push(d.notes); }
    if (d.slotTime      !== undefined) { sets.push('slot_time=?');      params.push(d.slotTime); }
    if (d.serviceId     !== undefined) { sets.push('service_id=?');     params.push(d.serviceId); }
    if (d.serviceName   !== undefined) { sets.push('service_name=?');   params.push(d.serviceName); }
    if (d.customerName  !== undefined) { sets.push('customer_name=?');  params.push(d.customerName); }
    if (d.customerPhone !== undefined) { sets.push('customer_phone=?'); params.push(d.customerPhone); }
    if (d.status === 'in_service') { sets.push('started_at=CURRENT_TIMESTAMP'); }
    if (d.status === 'completed')  { sets.push('completed_at=CURRENT_TIMESTAMP'); }
    if (sets.length === 0) return;
    params.push(id);
    await this.db.prepare(`UPDATE Service_Queue_Items SET ${sets.join(',')} WHERE id=?`).bind(...params).run();
  }

  async getNextQueueNumber(calendarId: number, date: string): Promise<number> {
    const row = await this.db.prepare(
      'SELECT MAX(queue_number) as max_num FROM Service_Queue_Items WHERE calendar_id=? AND slot_date=?'
    ).bind(calendarId, date).first() as any;
    return (row?.max_num ?? 0) + 1;
  }

  async createQueueItem(d: any): Promise<number> {
    const queueNum = await this.getNextQueueNumber(d.calendarId, d.slotDate);
    const r = await this.db.prepare(`
      INSERT INTO Service_Queue_Items
        (calendar_id, service_id, service_name, queue_number, slot_date, slot_time,
         customer_name, customer_phone, user_id, staff_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(d.calendarId, d.serviceId ?? null, d.serviceName ?? null, queueNum,
            d.slotDate, d.slotTime ?? null, d.customerName ?? null, d.customerPhone ?? null,
            d.userId ?? null, d.staffId ?? null, d.notes ?? null).run();
    return r.meta.last_row_id as number;
  }

  async updateQueueStatus(id: number, status: string): Promise<void> {
    const now = new Date().toISOString();
    let sql = 'UPDATE Service_Queue_Items SET status=?';
    const params: any[] = [status];
    if (status === 'in_service') { sql += ', started_at=?'; params.push(now); }
    if (status === 'completed')  { sql += ', completed_at=?'; params.push(now); }
    sql += ' WHERE id=?';
    params.push(id);
    await this.db.prepare(sql).bind(...params).run();
  }

  async assignStaff(id: number, staffId: number): Promise<void> {
    await this.db.prepare('UPDATE Service_Queue_Items SET staff_id=? WHERE id=?').bind(staffId, id).run();
  }

  async deleteQueueItem(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Service_Queue_Items WHERE id=?').bind(id).run();
  }
}

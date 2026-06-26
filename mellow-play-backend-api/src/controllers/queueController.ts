import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { QueueRepository } from '../repositories/queueRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

export class QueueController {
  private repo(c: C) { return new QueueRepository(new ConfigService(c.env).db); }

  async getQueue(c: C) {
    try {
      const { calendarId, date, startDate, endDate } = c.req.query();
      const items = await this.repo(c).getQueue(
        calendarId ? parseInt(calendarId) : undefined,
        date, startDate, endDate
      );
      return c.json({ success: true, items });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async createQueueItem(c: C) {
    try {
      const d = await c.req.json();
      if (!d.calendarId || !d.slotDate)
        return c.json({ success: false, message: 'calendarId and slotDate required' }, 400);
      const id = await this.repo(c).createQueueItem(d);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async updateQueueStatus(c: C) {
    try {
      const { status } = await c.req.json();
      if (!status) return c.json({ success: false, message: 'status required' }, 400);
      await this.repo(c).updateQueueStatus(parseInt(c.req.param('id')), status);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async updateQueueItem(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const d  = await c.req.json();
      await this.repo(c).updateQueueItem(id, {
        status:        d.status,
        staffId:       d.staffId,
        notes:         d.notes,
        slotTime:      d.slotTime,
        serviceId:     d.serviceId,
        serviceName:   d.serviceName,
        customerName:  d.customerName,
        customerPhone: d.customerPhone,
      });
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async assignStaff(c: C) {
    try {
      const { staffId } = await c.req.json();
      if (!staffId) return c.json({ success: false, message: 'staffId required' }, 400);
      await this.repo(c).assignStaff(parseInt(c.req.param('id')), staffId);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async deleteQueueItem(c: C) {
    try {
      await this.repo(c).deleteQueueItem(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

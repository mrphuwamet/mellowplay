import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { OrderRepository } from '../repositories/orderRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

export class OrderController {
  private repo(c: C) { return new OrderRepository(new ConfigService(c.env).db); }

  async getOrders(c: C) {
    try {
      const { date, status } = c.req.query();
      const orders = await this.repo(c).getOrders(date, status);
      return c.json({ success: true, orders });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async getOrderById(c: C) {
    try {
      const order = await this.repo(c).getOrderById(parseInt(c.req.param('id')));
      if (!order) return c.json({ success: false, message: 'Order not found' }, 404);
      return c.json({ success: true, order });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async createOrder(c: C) {
    try {
      const d = await c.req.json();
      if (!d.items || !Array.isArray(d.items) || d.items.length === 0)
        return c.json({ success: false, message: 'items required' }, 400);
      const id = await this.repo(c).createOrder(d);
      const order = await this.repo(c).getOrderById(id);
      return c.json({ success: true, id, order });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async updatePaymentStatus(c: C) {
    try {
      const { status, paymentMethod } = await c.req.json();
      if (!status) return c.json({ success: false, message: 'status required' }, 400);
      await this.repo(c).updatePaymentStatus(parseInt(c.req.param('id')), status, paymentMethod);
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async cancelOrder(c: C) {
    try {
      await this.repo(c).cancelOrder(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async deleteOrder(c: C) {
    try {
      await this.repo(c).deleteOrder(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

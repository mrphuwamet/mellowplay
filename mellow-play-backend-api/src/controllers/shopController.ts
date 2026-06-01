import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { ShopRepository } from '../repositories/shopRepository';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

export class ShopController {
  private repo(c: C) { return new ShopRepository(new ConfigService(c.env).db); }

  // ── Service Categories ─────────────────────────────────────────────────────
  async getServiceCategories(c: C) {
    try { return c.json({ success: true, categories: await this.repo(c).getServiceCategories() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async createServiceCategory(c: C) {
    try {
      const { name, color } = await c.req.json();
      if (!name) return c.json({ success: false, message: 'name required' }, 400);
      const id = await this.repo(c).createServiceCategory(name, color ?? '#7452d6');
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async updateServiceCategory(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const { name, color } = await c.req.json();
      await this.repo(c).updateServiceCategory(id, name, color ?? '#7452d6');
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async deleteServiceCategory(c: C) {
    try {
      await this.repo(c).deleteServiceCategory(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Services ───────────────────────────────────────────────────────────────
  async getServices(c: C) {
    try { return c.json({ success: true, services: await this.repo(c).getServices() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async createService(c: C) {
    try {
      const d = await c.req.json();
      if (!d.name) return c.json({ success: false, message: 'name required' }, 400);
      const id = await this.repo(c).createService(d);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async updateService(c: C) {
    try {
      await this.repo(c).updateService(parseInt(c.req.param('id')), await c.req.json());
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async deleteService(c: C) {
    try {
      await this.repo(c).deleteService(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Product Categories ─────────────────────────────────────────────────────
  async getProductCategories(c: C) {
    try { return c.json({ success: true, categories: await this.repo(c).getProductCategories() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async createProductCategory(c: C) {
    try {
      const { name, color } = await c.req.json();
      if (!name) return c.json({ success: false, message: 'name required' }, 400);
      const id = await this.repo(c).createProductCategory(name, color ?? '#7452d6');
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async updateProductCategory(c: C) {
    try {
      const id = parseInt(c.req.param('id'));
      const { name, color } = await c.req.json();
      await this.repo(c).updateProductCategory(id, name, color ?? '#7452d6');
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async deleteProductCategory(c: C) {
    try {
      await this.repo(c).deleteProductCategory(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Products ───────────────────────────────────────────────────────────────
  async getProducts(c: C) {
    try { return c.json({ success: true, products: await this.repo(c).getProducts() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async createProduct(c: C) {
    try {
      const d = await c.req.json();
      if (!d.name || !d.sku) return c.json({ success: false, message: 'name and sku required' }, 400);
      const id = await this.repo(c).createProduct(d);
      return c.json({ success: true, id });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async updateProduct(c: C) {
    try {
      await this.repo(c).updateProduct(parseInt(c.req.param('id')), await c.req.json());
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async deleteProduct(c: C) {
    try {
      await this.repo(c).deleteProduct(parseInt(c.req.param('id')));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // ── Stock ──────────────────────────────────────────────────────────────────
  async getStock(c: C) {
    try { return c.json({ success: true, stock: await this.repo(c).getStock() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async getStockTransactions(c: C) {
    try { return c.json({ success: true, transactions: await this.repo(c).getStockTransactions() }); }
    catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
  async adjustStock(c: C) {
    try {
      const d = await c.req.json();
      if (!d.productId || !d.type || !d.qty) return c.json({ success: false, message: 'productId, type, qty required' }, 400);
      const result = await this.repo(c).adjustStock(d);
      return c.json({ success: true, ...result });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

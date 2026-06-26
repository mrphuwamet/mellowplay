export class ShopRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  // ── Service Categories ─────────────────────────────────────────────────────
  async getServiceCategories(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Service_Categories ORDER BY id').all();
    return results;
  }
  async createServiceCategory(name: string, color: string): Promise<number> {
    const r = await this.db.prepare('INSERT INTO Service_Categories (name, color) VALUES (?, ?)').bind(name, color).run();
    return r.meta.last_row_id as number;
  }
  async updateServiceCategory(id: number, name: string, color: string): Promise<void> {
    await this.db.prepare('UPDATE Service_Categories SET name=?, color=? WHERE id=?').bind(name, color, id).run();
  }
  async deleteServiceCategory(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Service_Categories WHERE id=?').bind(id).run();
  }

  // ── Services ───────────────────────────────────────────────────────────────
  async getServices(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT s.*, sc.name AS category_name, sc.color AS category_color
      FROM Services s
      LEFT JOIN Service_Categories sc ON s.category_id = sc.id
      ORDER BY s.created_at DESC
    `).all();
    return results;
  }
  async createService(d: any): Promise<number> {
    const categoryId = d.category_id ?? d.categoryId ?? null;
    const durationMin = d.duration_min ?? d.durationMin ?? 30;
    const commissionType = d.commission_type ?? d.commissionType ?? 'percent';
    const commissionValue = d.commission_value ?? d.commissionValue ?? '';
    const r = await this.db.prepare(`
      INSERT INTO Services (name, category_id, description, price, duration_min, commission_type, commission_value, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(d.name, categoryId, d.description ?? null, d.price ?? 0, durationMin, commissionType, commissionValue, d.active ? 1 : 0).run();
    return r.meta.last_row_id as number;
  }
  async updateService(id: number, d: any): Promise<void> {
    const categoryId = d.category_id ?? d.categoryId ?? null;
    const durationMin = d.duration_min ?? d.durationMin ?? 30;
    const commissionType = d.commission_type ?? d.commissionType ?? 'percent';
    const commissionValue = d.commission_value ?? d.commissionValue ?? '';
    await this.db.prepare(`
      UPDATE Services SET name=?, category_id=?, description=?, price=?, duration_min=?, commission_type=?, commission_value=?, active=?
      WHERE id=?
    `).bind(d.name, categoryId, d.description ?? null, d.price ?? 0, durationMin, commissionType, commissionValue, d.active ? 1 : 0, id).run();
  }
  async deleteService(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Services WHERE id=?').bind(id).run();
  }

  // ── Product Categories ─────────────────────────────────────────────────────
  async getProductCategories(): Promise<any[]> {
    const { results } = await this.db.prepare('SELECT * FROM Product_Categories ORDER BY id').all();
    return results;
  }
  async createProductCategory(name: string, color: string): Promise<number> {
    const r = await this.db.prepare('INSERT INTO Product_Categories (name, color) VALUES (?, ?)').bind(name, color).run();
    return r.meta.last_row_id as number;
  }
  async updateProductCategory(id: number, name: string, color: string): Promise<void> {
    await this.db.prepare('UPDATE Product_Categories SET name=?, color=? WHERE id=?').bind(name, color, id).run();
  }
  async deleteProductCategory(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Product_Categories WHERE id=?').bind(id).run();
  }

  // ── Products ───────────────────────────────────────────────────────────────
  async getProducts(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT p.*, pc.name AS category_name, pc.color AS category_color
      FROM Products p
      LEFT JOIN Product_Categories pc ON p.category_id = pc.id
      ORDER BY p.created_at DESC
    `).all();
    return results;
  }
  async createProduct(d: any): Promise<number> {
    const r = await this.db.prepare(`
      INSERT INTO Products (sku, name, category_id, description, sell_price, cost_price, unit, min_stock, current_stock, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).bind(d.sku, d.name, d.categoryId ?? null, d.description ?? null, d.sellPrice, d.costPrice, d.unit, d.minStock, d.active ? 1 : 0).run();
    return r.meta.last_row_id as number;
  }
  async updateProduct(id: number, d: any): Promise<void> {
    await this.db.prepare(`
      UPDATE Products SET sku=?, name=?, category_id=?, description=?, sell_price=?, cost_price=?, unit=?, min_stock=?, active=?
      WHERE id=?
    `).bind(d.sku, d.name, d.categoryId ?? null, d.description ?? null, d.sellPrice, d.costPrice, d.unit, d.minStock, d.active ? 1 : 0, id).run();
  }
  async deleteProduct(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Products WHERE id=?').bind(id).run();
  }

  // ── Stock ──────────────────────────────────────────────────────────────────
  async getStock(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT p.id AS product_id, p.sku, p.name, p.unit,
             p.current_stock AS current_qty, p.min_stock AS min_qty,
             pc.name AS category_name
      FROM Products p
      LEFT JOIN Product_Categories pc ON p.category_id = pc.id
      WHERE p.active = 1 ORDER BY p.name
    `).all();
    return results;
  }
  async getStockTransactions(): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT st.*, p.name AS product_name, p.sku, p.unit
      FROM Stock_Transactions st
      JOIN Products p ON st.product_id = p.id
      ORDER BY st.created_at DESC
      LIMIT 200
    `).all();
    return results;
  }
  async adjustStock(d: { productId: number; type: string; qty: number; note: string; date: string; staffName?: string }): Promise<{ qtyAfter: number }> {
    const product = await this.db.prepare('SELECT current_stock, unit FROM Products WHERE id=?').bind(d.productId).first<any>();
    if (!product) throw new Error('Product not found');

    let qtyAfter = product.current_stock;
    if (d.type === 'in')     qtyAfter += d.qty;
    else if (d.type === 'out') qtyAfter = Math.max(0, qtyAfter - d.qty);
    else qtyAfter = d.qty; // adjust = set exact value

    await this.db.prepare('UPDATE Products SET current_stock=? WHERE id=?').bind(qtyAfter, d.productId).run();
    await this.db.prepare(`
      INSERT INTO Stock_Transactions (product_id, type, qty, qty_after, note, date, staff_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(d.productId, d.type, d.qty, qtyAfter, d.note ?? null, d.date, d.staffName ?? null).run();

    return { qtyAfter };
  }
}

export class OrderRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  private generateOrderNumber(): string {
    const now = new Date();
    const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `ORD-${ymd}-${rand}`;
  }

  async getOrders(date?: string, status?: string): Promise<any[]> {
    let sql = `
      SELECT o.*, u.first_name, u.last_name, cu.full_name AS created_by_name
      FROM Orders o
      LEFT JOIN Users u ON o.user_id = u.id
      LEFT JOIN CRM_Users cu ON o.created_by = cu.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (date) { sql += ' AND DATE(o.created_at)=?'; params.push(date); }
    if (status) { sql += ' AND o.payment_status=?'; params.push(status); }
    sql += ' ORDER BY o.created_at DESC';
    const { results } = await this.db.prepare(sql).bind(...params).all();
    return results;
  }

  async getOrderById(id: number): Promise<any> {
    const order = await this.db.prepare(`
      SELECT o.*, u.first_name, u.last_name, u.phone AS user_phone, cu.full_name AS created_by_name
      FROM Orders o
      LEFT JOIN Users u ON o.user_id = u.id
      LEFT JOIN CRM_Users cu ON o.created_by = cu.id
      WHERE o.id=?
    `).bind(id).first();
    if (!order) return null;
    const { results: items } = await this.db.prepare(`
      SELECT oi.*,
        COALESCE(p.name, s.name, c.name, pkg.name) AS item_ref_name
      FROM Order_Items oi
      LEFT JOIN Products p ON oi.item_type='product' AND oi.item_id=p.id
      LEFT JOIN Services s ON oi.item_type='service' AND oi.item_id=s.id
      LEFT JOIN Courses  c ON oi.item_type='class'   AND oi.item_id=c.id
      LEFT JOIN Packages pkg ON oi.item_type='package' AND oi.item_id=pkg.id
      WHERE oi.order_id=?
    `).bind(id).all();
    return { ...order, items };
  }

  async cancelOrder(id: number): Promise<void> {
    await this.db.prepare(`UPDATE Orders SET payment_status='cancelled' WHERE id=?`).bind(id).run();
  }

  async deleteOrder(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Orders WHERE id=?').bind(id).run();
  }

  async createOrder(d: any): Promise<number> {
    const orderNumber = this.generateOrderNumber();
    const subtotal = (d.items as any[]).reduce((s: number, i: any) => s + i.total, 0);
    const discountAmount = d.discountAmount ?? 0;
    const total = subtotal - discountAmount;

    const orderStmt = this.db.prepare(`
      INSERT INTO Orders (order_number, branch_id, user_id, customer_name, customer_phone,
        subtotal, discount_amount, coupon_code, total, payment_method, payment_status, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(orderNumber, d.branchId ?? null, d.userId ?? null, d.customerName ?? null,
            d.customerPhone ?? null, subtotal, discountAmount, d.couponCode ?? null,
            total, d.paymentMethod ?? 'cash', d.paymentStatus ?? 'paid',
            d.notes ?? null, d.createdBy ?? null);

    const r = await orderStmt.run();
    const orderId = r.meta.last_row_id as number;

    for (const item of d.items as any[]) {
      await this.db.prepare(`
        INSERT INTO Order_Items (order_id, item_type, item_id, item_name, unit_price, quantity, discount_amount, total, meta_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(orderId, item.itemType, item.itemId ?? null, item.itemName,
              item.unitPrice, item.quantity ?? 1, item.discountAmount ?? 0,
              item.total, item.meta ? JSON.stringify(item.meta) : null).run();

      // POSNew.tsx checkout used to be a bare ledger: selling a product never
      // moved stock, and selling a package never credited the buyer's
      // coupons (that logic only ever existed in the unreachable
      // posProcessPackageSale/adjustStock endpoints). Apply those side
      // effects here so a POS sale actually behaves like one.
      if (item.itemType === 'product' && item.itemId) {
        await this.applyStockSale(item.itemId, item.quantity ?? 1, orderNumber);
      } else if (item.itemType === 'package' && item.itemId && !d.isGuest && d.userId) {
        await this.creditPackageCoupons(item.itemId, d.userId);
      }
    }

    return orderId;
  }

  private async applyStockSale(productId: number, qty: number, orderNumber: string): Promise<void> {
    const product = await this.db.prepare('SELECT current_stock FROM Products WHERE id=?').bind(productId).first<any>();
    if (!product) return;
    const qtyAfter = Math.max(0, (product.current_stock ?? 0) - qty);
    await this.db.prepare('UPDATE Products SET current_stock=? WHERE id=?').bind(qtyAfter, productId).run();
    await this.db.prepare(`
      INSERT INTO Stock_Transactions (product_id, type, qty, qty_after, note, date)
      VALUES (?, 'out', ?, ?, ?, ?)
    `).bind(productId, qty, qtyAfter, `ขายที่ POS (${orderNumber})`, new Date().toISOString().slice(0, 10)).run();
  }

  private async creditPackageCoupons(packageId: number, userId: number): Promise<void> {
    const pkg = await this.db.prepare('SELECT * FROM Packages WHERE id=?').bind(packageId).first<any>();
    if (!pkg) return;
    const coupons: { typeId: string; quantity: number }[] = JSON.parse(pkg.coupons_json || '[]');
    const expiresAt = new Date(Date.now() + (pkg.premium_days || 30) * 86400000).toISOString().slice(0, 10);
    for (const coupon of coupons) {
      await this.db.prepare(`
        INSERT INTO User_Coupons (user_id, type_id, label, count, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(userId, coupon.typeId, pkg.name, coupon.quantity, expiresAt).run();
    }
  }

  async updatePaymentStatus(id: number, status: string, method?: string): Promise<void> {
    await this.db.prepare('UPDATE Orders SET payment_status=?, payment_method=COALESCE(?, payment_method) WHERE id=?')
      .bind(status, method ?? null, id).run();
  }
}

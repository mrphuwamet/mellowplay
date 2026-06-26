export class CourseMaterialRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async getMaterials(courseId: number): Promise<any[]> {
    const { results } = await this.db.prepare(`
      SELECT cm.*, p.name AS product_name, p.current_stock, p.unit AS product_unit
      FROM Course_Materials cm
      JOIN Products p ON cm.product_id = p.id
      WHERE cm.course_id = ?
      ORDER BY cm.id
    `).bind(courseId).all();
    return results;
  }

  async upsertMaterial(courseId: number, productId: number, quantity: number, unit?: string, note?: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO Course_Materials (course_id, product_id, quantity, unit, note)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(course_id, product_id) DO UPDATE SET
        quantity = excluded.quantity,
        unit     = excluded.unit,
        note     = excluded.note
    `).bind(courseId, productId, quantity, unit ?? null, note ?? null).run();
  }

  async deleteMaterial(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM Course_Materials WHERE id=?').bind(id).run();
  }

  // Reserve stock when booking is created
  async reserveStock(bookingId: number, courseId: number): Promise<void> {
    const materials = await this.getMaterials(courseId);
    for (const m of materials) {
      await this.db.prepare(`
        INSERT OR IGNORE INTO Stock_Reservations (booking_id, product_id, quantity)
        VALUES (?, ?, ?)
      `).bind(bookingId, m.product_id, m.quantity).run();
    }
  }

  // Deduct stock when class is completed
  async deductStock(bookingId: number): Promise<void> {
    const { results: reservations } = await this.db.prepare(`
      SELECT * FROM Stock_Reservations WHERE booking_id=? AND status='pending'
    `).bind(bookingId).all();

    for (const r of reservations as any[]) {
      // Query current stock first (D1 doesn't support subqueries in INSERT VALUES)
      const product = await this.db.prepare('SELECT current_stock FROM Products WHERE id=?')
        .bind(r.product_id).first<any>();
      if (!product) continue;

      const qtyAfter = Math.max(0, product.current_stock - r.quantity);

      await this.db.prepare('UPDATE Products SET current_stock=? WHERE id=?')
        .bind(qtyAfter, r.product_id).run();

      await this.db.prepare(`
        INSERT INTO Stock_Transactions (product_id, type, qty, qty_after, note, date, staff_name)
        VALUES (?, 'out', ?, ?, 'ตัดสต๊อกจากคลาสเรียน', date('now'), 'ระบบ')
      `).bind(r.product_id, r.quantity, qtyAfter).run();

      await this.db.prepare(`UPDATE Stock_Reservations SET status='deducted' WHERE id=?`)
        .bind(r.id).run();
    }
  }

  // Release stock when booking is cancelled
  async releaseStock(bookingId: number): Promise<void> {
    await this.db.prepare(`
      UPDATE Stock_Reservations SET status='released' WHERE booking_id=? AND status='pending'
    `).bind(bookingId).run();
  }
}

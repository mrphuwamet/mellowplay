import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { HRRepository } from '../repositories/hrRepository';

export class WebhookController {
  async handleBeamWebhook(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    try {
      const payload = await c.req.json();
      // Beam webhook payload structure usually contains payment status and referenceId
      // Ensure it's a valid webhook request
      if (!payload || !payload.order || !payload.order.referenceId) {
        return c.json({ success: false, message: 'Invalid payload' }, 400);
      }

      // The referenceId was set as `BK-${id}-${Date.now()}` in createBooking,
      // or `PKG-${purchaseId}-${Date.now()}` in hrController.purchasePackage.
      const referenceId = payload.order.referenceId;
      const parts = referenceId.split('-');
      if (parts.length < 2) {
        return c.json({ success: false, message: 'Invalid referenceId format' }, 400);
      }

      if (parts[0] === 'PKG') {
        return this.handlePackagePurchaseWebhook(c, payload, parts);
      }

      if (parts[0] !== 'BK') {
        return c.json({ success: false, message: 'Invalid referenceId format' }, 400);
      }

      const bookingId = parseInt(parts[1], 10);
      if (isNaN(bookingId)) {
        return c.json({ success: false, message: 'Invalid bookingId' }, 400);
      }

      // Payment Status (e.g., 'SUCCESS', 'FAILED')
      const status = payload.status || 'SUCCESS';
      // Extract payment method (e.g., PromptPay, Credit Card)
      const paymentMethod = payload.paymentMethod || 'Beam Checkout';

      const config = new ConfigService(c.env);

      // Verify booking exists
      const booking = await config.db.prepare('SELECT id, status, payment_status, beam_session_id FROM Bookings WHERE id = ?').bind(bookingId).first<{id:number, status:string, payment_status:string, beam_session_id:string}>();
      if (!booking) {
        return c.json({ success: false, message: 'Booking not found' }, 404);
      }

      if (status === 'SUCCESS' || status === 'COMPLETED') {
        const beamSessionId = booking.beam_session_id;
        
        let bookingsToUpdate = [bookingId];
        if (beamSessionId) {
           const { results } = await config.db.prepare('SELECT id FROM Bookings WHERE beam_session_id = ?').bind(beamSessionId).all<{id:number}>();
           bookingsToUpdate = results.map(r => r.id);
        }

        for (const bid of bookingsToUpdate) {
          // Update booking status
          await config.db.prepare(`
            UPDATE Bookings
            SET status = 'confirmed_paid', payment_status = 'paid', payment_method = ?
            WHERE id = ?
          `).bind(paymentMethod, bid).run();
  
          // Also add to transactions if not exists
          const tx = await config.db.prepare('SELECT id FROM Transactions WHERE booking_id = ?').bind(bid).first();
          if (!tx) {
            await config.db.prepare(`
              INSERT INTO Transactions (booking_id, amount, payment_method, status, created_at)
              VALUES (?, ?, ?, 'completed', CURRENT_TIMESTAMP)
            `).bind(bid, (payload.order.netAmount || 0) / bookingsToUpdate.length, paymentMethod).run();
          }
        }

        return c.json({ success: true, message: 'Webhook processed successfully' });
      } else {
        // Handle failed or other statuses
        return c.json({ success: true, message: `Ignored status ${status}` });
      }
    } catch (error) {
      console.error('Error processing beam webhook:', error);
      return c.json({ success: false, message: 'Internal Server Error' }, 500);
    }
  }

  private async handlePackagePurchaseWebhook(
    c: Context<{ Bindings: Bindings; Variables: Variables }>,
    payload: any,
    parts: string[]
  ) {
    try {
      const purchaseId = parseInt(parts[1], 10);
      if (isNaN(purchaseId)) return c.json({ success: false, message: 'Invalid purchaseId' }, 400);

      const status = payload.status || 'SUCCESS';
      const paymentMethod = payload.paymentMethod || 'Beam Checkout';
      const config = new ConfigService(c.env);
      const repo = new HRRepository(config.db);

      const purchase = await repo.getPackagePurchase(purchaseId);
      if (!purchase) return c.json({ success: false, message: 'Purchase not found' }, 404);

      if (status === 'SUCCESS' || status === 'COMPLETED') {
        if (purchase.status !== 'paid') {
          const pkg = await repo.getPackageById(purchase.package_id);
          if (pkg) await repo.creditPackageCoupons(pkg, purchase.child_id);

          await config.db.prepare(`
            UPDATE Package_Purchases SET status = 'paid', payment_method = ? WHERE id = ?
          `).bind(paymentMethod, purchaseId).run();

          await config.db.prepare(`
            INSERT INTO Transactions (branch_id, user_id, child_id, type, amount, payment_method, package_id)
            VALUES (1, ?, ?, 'package_sale', ?, ?, ?)
          `).bind(purchase.user_id, purchase.child_id, payload.order.netAmount ? payload.order.netAmount / 100 : purchase.amount, paymentMethod, purchase.package_id).run();
        }
        return c.json({ success: true, message: 'Package purchase webhook processed' });
      }

      return c.json({ success: true, message: `Ignored status ${status}` });
    } catch (error) {
      console.error('Error processing package purchase webhook:', error);
      return c.json({ success: false, message: 'Internal Server Error' }, 500);
    }
  }
}

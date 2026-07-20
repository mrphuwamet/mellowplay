import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { HRRepository } from '../repositories/hrRepository';
import { SystemLogger } from '../utils/logger';
import { sendAlert, sendNotification } from '../services/alertService';

// Beam's own docs (docs.beamcheckout.com/webhook) describe the webhook body
// as the same shape as GET /v1/api/charges/{chargeId} — a Charge object with
// `referenceId` and `status` at the TOP level (e.g. status "SUCCEEDED"), NOT
// nested under an `order` object the way the *request* we send to create a
// payment link is shaped. The original version of this handler assumed the
// webhook mirrored our own request payload (`payload.order.referenceId`,
// status "SUCCESS"/"COMPLETED") — neither matches Beam's real Charge object,
// so every real webhook was rejected by the initial validation before ever
// reaching the booking-update code. A paid booking would sit at
// pending_payment forever with the CRM never finding out.
//
// Rather than guess a second time, this reads from every plausible location
// AND always logs the raw payload — if some field still doesn't match, the
// next real payment gives us the actual shape to fix definitively instead of
// re-guessing blind.
function extractReferenceId(payload: any): string | null {
  return payload?.referenceId
    || payload?.order?.referenceId
    || payload?.charge?.referenceId
    || payload?.data?.referenceId
    || null;
}

// A charge Beam sends us can legitimately have no referenceId at all — e.g.
// a Bolt card-terminal sale rung up directly at a till, or a sale from a
// different outlet on the same Beam account — since referenceId is only set
// when *we* create the payment link for a booking. That's distinct from an
// actually-unrecognized payload shape (Beam changing/adding an event type
// we've never seen). Tell them apart by whether the field is present at all
// (even as "") vs genuinely absent everywhere we look.
function hasReferenceIdField(payload: any): boolean {
  return payload?.referenceId !== undefined
    || payload?.order?.referenceId !== undefined
    || payload?.charge?.referenceId !== undefined
    || payload?.data?.referenceId !== undefined;
}

function extractStatus(eventHeader: string | null, payload: any): string {
  // The x-beam-event header (e.g. "charge.succeeded") is the primary signal
  // per Beam's docs; the body's own status field is a secondary check in
  // case the header is absent for some event source.
  if (eventHeader && /succeeded|success|completed|paid/i.test(eventHeader)) return 'SUCCEEDED';
  if (eventHeader && /fail|declin|cancel|expir/i.test(eventHeader)) return 'FAILED';
  const raw = payload?.status || payload?.chargeStatus || payload?.charge?.status || payload?.data?.status || '';
  return String(raw).toUpperCase();
}

function extractAmount(payload: any): number {
  const raw = payload?.amount ?? payload?.order?.netAmount ?? payload?.charge?.amount ?? payload?.data?.amount ?? 0;
  return Number(raw) || 0;
}

// Beam's real charge.succeeded body carries paymentMethod as a nested object
// ({paymentMethodType, card: {...}, ...}), never a plain string — binding
// that object straight into a D1 query throws D1_TYPE_ERROR and aborts the
// whole booking-confirmation flow before the success notification below
// ever runs. Always reduce it to a short display string instead.
function extractPaymentMethodLabel(payload: any): string {
  const pm = payload?.paymentMethod || payload?.charge?.paymentMethod;
  if (typeof pm === 'string' && pm) return pm;
  const type = pm?.paymentMethodType || pm?.type;
  if (!type) return 'Beam Checkout';
  const brand = pm?.card?.brand;
  return brand ? `${type} (${brand})` : type;
}

const SUCCESS_STATUSES = new Set(['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'PAID']);

export class WebhookController {
  async handleBeamWebhook(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const config = new ConfigService(c.env);
    const logger = new SystemLogger(config.db);
    let payload: any;

    try {
      payload = await c.req.json();
    } catch (err) {
      await logger.error('beam-webhook', 'Failed to parse webhook body as JSON');
      return c.json({ success: false, message: 'Invalid JSON' }, 400);
    }

    // Always logged, success or failure — this is the only real record of
    // what Beam actually sends, since their dashboard doesn't surface it to us.
    const eventHeader = c.req.header('x-beam-event') || null;
    await logger.info('beam-webhook', `event=${eventHeader ?? '(none)'} payload=${JSON.stringify(payload).slice(0, 2000)}`);

    try {
      const referenceId = extractReferenceId(payload);
      if (!referenceId) {
        if (hasReferenceIdField(payload)) {
          // A recognized Beam event that just isn't ours — a Bolt terminal
          // sale at another outlet, a walk-in charge rung up directly on
          // the Beam dashboard, etc. Expected and will keep happening as
          // the in-person POS terminal sees more use, so it's routine, not
          // an error worth paging anyone for.
          await logger.info('beam-webhook', `Non-booking charge acknowledged (event=${eventHeader ?? '(none)'}, referenceId empty)`);
          if (eventHeader === 'charge.succeeded') {
            const amountThb = (extractAmount(payload) / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            await sendNotification(config.db, 'ชำระเงินสำเร็จ (นอกระบบจอง)', {
              'ร้าน/Merchant': payload?.merchant?.name || payload?.merchantId || '-',
              'ยอดชำระ': `${amountThb} บาท`,
              'ช่องทางชำระ': extractPaymentMethodLabel(payload),
              'ที่มา': payload?.source || '-',
              'เวลาชำระ': new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
            });
          }
          return c.json({ success: true, message: 'Acknowledged (non-booking charge)' });
        }

        await logger.warn('beam-webhook', `No referenceId field found anywhere in webhook payload (event=${eventHeader ?? '(none)'})`);
        await sendAlert(config.db, 'Beam Webhook: unrecognized payload shape', {
          event: eventHeader || '(none)', payloadPreview: JSON.stringify(payload).slice(0, 500),
        });
        // Ack with 200 regardless — a non-2xx response makes most payment
        // gateways retry the same webhook repeatedly, which won't fix a
        // shape mismatch and just adds noise. The alert above is what
        // actually gets someone to look at it.
        return c.json({ success: true, message: 'Acknowledged (unrecognized payload)' });
      }

      const parts = referenceId.split('-');
      if (parts.length < 2) {
        await logger.warn('beam-webhook', `Malformed referenceId: ${referenceId}`);
        return c.json({ success: true, message: 'Acknowledged (malformed referenceId)' });
      }

      if (parts[0] === 'PKG') {
        return this.handlePackagePurchaseWebhook(c, payload, parts, eventHeader, logger);
      }

      if (parts[0] !== 'BK') {
        await logger.warn('beam-webhook', `Unknown referenceId prefix: ${referenceId}`);
        return c.json({ success: true, message: 'Acknowledged (unknown referenceId prefix)' });
      }

      const bookingId = parseInt(parts[1], 10);
      if (isNaN(bookingId)) {
        await logger.warn('beam-webhook', `Non-numeric bookingId in referenceId: ${referenceId}`);
        return c.json({ success: true, message: 'Acknowledged (invalid bookingId)' });
      }

      const status = extractStatus(eventHeader, payload);
      const paymentMethod = extractPaymentMethodLabel(payload);

      const booking = await config.db.prepare(
        'SELECT id, status, payment_status, beam_session_id FROM Bookings WHERE id = ?'
      ).bind(bookingId).first<{ id: number; status: string; payment_status: string; beam_session_id: string }>();

      if (!booking) {
        await logger.warn('beam-webhook', `Booking not found for id ${bookingId} (referenceId=${referenceId})`);
        return c.json({ success: true, message: 'Acknowledged (booking not found)' });
      }

      if (SUCCESS_STATUSES.has(status)) {
        const beamSessionId = booking.beam_session_id;

        let bookingsToUpdate = [bookingId];
        if (beamSessionId) {
          const { results } = await config.db.prepare('SELECT id FROM Bookings WHERE beam_session_id = ?').bind(beamSessionId).all<{ id: number }>();
          bookingsToUpdate = results.map(r => r.id);
        }

        const totalAmount = extractAmount(payload);

        for (const bid of bookingsToUpdate) {
          await config.db.prepare(`
            UPDATE Bookings
            SET status = 'confirmed_paid', payment_status = 'paid', payment_method = ?
            WHERE id = ?
          `).bind(paymentMethod, bid).run();

          const tx = await config.db.prepare('SELECT id FROM Transactions WHERE booking_id = ?').bind(bid).first();
          if (!tx) {
            await config.db.prepare(`
              INSERT INTO Transactions (booking_id, amount, payment_method, status, created_at)
              VALUES (?, ?, ?, 'completed', CURRENT_TIMESTAMP)
            `).bind(bid, totalAmount / bookingsToUpdate.length, paymentMethod).run();
          }
        }

        await logger.info('beam-webhook', `Confirmed payment for booking(s) ${bookingsToUpdate.join(', ')} (status=${status})`);

        try {
          const { results: bookingDetails } = await config.db.prepare(`
            SELECT b.scheduled_at, co.name as course_name, COALESCE(hp.nickname, '(ลูกค้าทั่วไป)') as child_nickname
            FROM Bookings b
            JOIN Courses co ON b.course_id = co.id
            LEFT JOIN Children c ON b.child_id = c.id AND b.child_id != 0
            LEFT JOIN HD_Profiles hp ON c.hd_profile_id = hp.id
            WHERE b.id IN (${bookingsToUpdate.join(',')})
          `).all();
          const rows = bookingDetails as any[];
          const childNames = rows.map(r => r.child_nickname).filter(Boolean).join(', ') || '-';
          // Beam amounts are in satang (hundredths of THB) — see the
          // netAmount computed in adminController.createBooking.
          const amountThb = (totalAmount / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          await sendNotification(config.db, 'การจองสำเร็จ (ชำระเงินแล้ว)', {
            'คลาส': rows[0]?.course_name ?? '-',
            'เด็ก': childNames,
            'วันเวลา': rows[0]?.scheduled_at ?? '-',
            'ยอดชำระ': `${amountThb} บาท`,
            'ช่องทางชำระ': paymentMethod,
            'เวลาชำระ': new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
            'รหัสจอง': bookingsToUpdate.join(', '),
          });
        } catch { /* notification must never block webhook processing */ }

        return c.json({ success: true, message: 'Webhook processed successfully' });
      }

      await logger.info('beam-webhook', `Non-success status for booking ${bookingId}: ${status}`);
      return c.json({ success: true, message: `Ignored status ${status}` });
    } catch (error: any) {
      await logger.error('beam-webhook', error);
      // Still 200 — see the no-2xx-causes-retries note above. The error is
      // already logged/alerted for manual follow-up.
      return c.json({ success: true, message: 'Acknowledged (error logged)' });
    }
  }

  private async handlePackagePurchaseWebhook(
    c: Context<{ Bindings: Bindings; Variables: Variables }>,
    payload: any,
    parts: string[],
    eventHeader: string | null,
    logger: SystemLogger
  ) {
    const config = new ConfigService(c.env);
    try {
      const purchaseId = parseInt(parts[1], 10);
      if (isNaN(purchaseId)) return c.json({ success: true, message: 'Acknowledged (invalid purchaseId)' });

      const status = extractStatus(eventHeader, payload);
      const paymentMethod = extractPaymentMethodLabel(payload);
      const repo = new HRRepository(config.db);

      const purchase = await repo.getPackagePurchase(purchaseId);
      if (!purchase) {
        await logger.warn('beam-webhook', `Package purchase not found for id ${purchaseId}`);
        return c.json({ success: true, message: 'Acknowledged (purchase not found)' });
      }

      if (SUCCESS_STATUSES.has(status)) {
        if (purchase.status !== 'paid') {
          const pkg = await repo.getPackageById(purchase.package_id);
          if (pkg) await repo.creditPackageCoupons(pkg, purchase.child_id);

          await config.db.prepare(`
            UPDATE Package_Purchases SET status = 'paid', payment_method = ? WHERE id = ?
          `).bind(paymentMethod, purchaseId).run();

          const amount = extractAmount(payload);
          await config.db.prepare(`
            INSERT INTO Transactions (branch_id, user_id, child_id, type, amount, payment_method, package_id)
            VALUES (1, ?, ?, 'package_sale', ?, ?, ?)
          `).bind(purchase.user_id, purchase.child_id, amount ? amount / 100 : purchase.amount, paymentMethod, purchase.package_id).run();
        }
        return c.json({ success: true, message: 'Package purchase webhook processed' });
      }

      return c.json({ success: true, message: `Ignored status ${status}` });
    } catch (error: any) {
      await logger.error('beam-webhook', error);
      return c.json({ success: true, message: 'Acknowledged (error logged)' });
    }
  }
}

import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { SystemLogger } from '../utils/logger';
import { sendSurveyReceipt } from '../services/surveyReceiptService';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * The counter's side of a survey that charges.
 *
 * A bank transfer has no webhook. Somebody looks at a slip and says yes or
 * no, and until they do the money is a claim rather than a fact. These are
 * the endpoints that queue those claims up and settle them.
 *
 * Verification is deliberately the only thing that marks a submission paid.
 * A slip upload does not, and neither will a verification API when one is
 * added — it will call verify() with verifiedBy 'auto', so there stays one
 * place where "this is paid" is written and one place that logs it.
 */
export class SurveyPaymentController {
  /** Everything waiting to be looked at, newest last so the queue reads as a queue. */
  async list(c: C) {
    try {
      const config = new ConfigService(c.env);
      const status = c.req.query('status') || 'submitted';
      const formId = c.req.query('formId');

      const where: string[] = ['s.payment_status IS NOT NULL'];
      const binds: any[] = [];
      if (status !== 'all') { where.push('s.payment_status = ?'); binds.push(status); }
      if (formId) { where.push('s.form_id = ?'); binds.push(parseInt(formId)); }

      const { results } = await config.db.prepare(`
        SELECT s.id, s.form_id, f.name AS form_name, s.respondent_name, s.respondent_phone,
               s.amount, s.payment_status, s.payment_method, s.slip_url, s.slip_ref,
               s.slip_uploaded_at, s.payment_verified_at, s.payment_verified_by, s.payment_note,
               s.created_at
        FROM Survey_Submissions s
        JOIN Survey_Forms f ON f.id = s.form_id
        WHERE ${where.join(' AND ')}
        ORDER BY s.slip_uploaded_at ASC, s.created_at ASC
        LIMIT 500
      `).bind(...binds).all();

      return c.json({ success: true, submissions: results });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /** The money is real. This is the only place that says so. */
  async verify(c: C) {
    const config = new ConfigService(c.env);
    const logger = new SystemLogger(config.db);
    try {
      const id = parseInt(c.req.param('id'));
      const body = await c.req.json().catch(() => ({}));
      const by = String(body.verifiedBy || c.get('jwtPayload')?.name || 'staff').slice(0, 60);
      const slipRef = body.slipRef ? String(body.slipRef).slice(0, 120) : null;

      const submission = await config.db.prepare(
        `SELECT s.id, s.form_id, s.amount, s.payment_status, s.respondent_name, s.respondent_phone,
                f.name AS form_name
         FROM Survey_Submissions s JOIN Survey_Forms f ON f.id = s.form_id WHERE s.id = ?`
      ).bind(id).first() as any;
      if (!submission) return c.json({ success: false, message: 'ไม่พบรายการนี้' }, 404);
      if (submission.payment_status === 'verified') {
        // Saying so beats a second Transactions row and a second email.
        return c.json({ success: true, message: 'รายการนี้ยืนยันไปแล้ว', alreadyVerified: true });
      }

      // A reference is optional when a person is doing the looking, but if one
      // is given it must be new. The unique index is what actually enforces
      // this; catching it here turns a 500 into a sentence staff can act on.
      if (slipRef) {
        const clash = await config.db.prepare(
          'SELECT id FROM Survey_Submissions WHERE slip_ref = ? AND id != ?'
        ).bind(slipRef, id).first() as any;
        if (clash) {
          return c.json({
            success: false,
            message: `สลิปนี้ถูกใช้ยืนยันรายการ #${clash.id} ไปแล้ว`,
          }, 409);
        }
      }

      await config.db.prepare(`
        UPDATE Survey_Submissions
        SET payment_status = 'verified', payment_verified_at = datetime('now'),
            payment_verified_by = ?, slip_ref = COALESCE(?, slip_ref), payment_note = NULL
        WHERE id = ?
      `).bind(by, slipRef, id).run();

      // Money that reached the bank has to reach the table the revenue
      // dashboard reads, or the business cannot see it.
      await config.db.prepare(`
        INSERT INTO Transactions (branch_id, user_id, child_id, type, amount, payment_method)
        VALUES (1, NULL, NULL, 'survey_payment', ?, 'transfer')
      `).bind(Number(submission.amount) || 0).run();

      const emailed = (await sendSurveyReceipt(config, id, 'verified')).sent;
      await logger.info('survey-payment', `#${id} verified by ${by} (${submission.amount} THB), receipt=${emailed}`);

      return c.json({ success: true, emailed });
    } catch (e: any) {
      await logger.error('survey-payment', e);
      return c.json({ success: false, message: e.message }, 500);
    }
  }

  /**
   * Not a verdict on the person — a slip that could not be read, an amount
   * that did not match. The note is written to be shown to them so they can
   * send another one, which is why rejecting leaves the row re-uploadable.
   */
  async reject(c: C) {
    try {
      const config = new ConfigService(c.env);
      const id = parseInt(c.req.param('id'));
      const body = await c.req.json().catch(() => ({}));
      const note = String(body.note || 'สลิปไม่ถูกต้อง กรุณาแนบใหม่อีกครั้ง').slice(0, 300);
      const by = String(body.verifiedBy || c.get('jwtPayload')?.name || 'staff').slice(0, 60);

      const submission = await config.db.prepare(
        'SELECT id, payment_status FROM Survey_Submissions WHERE id = ?'
      ).bind(id).first() as any;
      if (!submission) return c.json({ success: false, message: 'ไม่พบรายการนี้' }, 404);
      if (submission.payment_status === 'verified') {
        return c.json({ success: false, message: 'รายการนี้ยืนยันการชำระเงินไปแล้ว ไม่สามารถปฏิเสธได้' }, 409);
      }

      await config.db.prepare(`
        UPDATE Survey_Submissions
        SET payment_status = 'rejected', payment_note = ?, payment_verified_by = ?
        WHERE id = ?
      `).bind(note, by, id).run();

      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

}

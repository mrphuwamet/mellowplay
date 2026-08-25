import { Context } from 'hono';
import { Bindings, Variables } from '../types/env';
import { ConfigService } from '../services/configService';
import { CheckinRepository } from '../repositories/checkinRepository';
import { AuthService } from '../services/authService';
import { awardParticipation, revokeParticipation } from '../services/stampService';
import { autoIssue as autoIssueCertificate, revokeAutoIssued as revokeAutoIssuedCertificate } from '../services/certificateService';
import { markNoShow, clearNoShow } from '../services/attendanceService';

type C = Context<{ Bindings: Bindings; Variables: Variables }>;

// True when the caller is CRM staff or holds a check-in access link — the two
// audiences that work the door and need the parent's contact details. Anyone
// else (a parent opening the QR link from their email, or whoever they
// forwarded it to) is not one of them. Returns false rather than throwing on a
// bad token: an unreadable token is simply not staff.
async function isStaffRequest(c: C): Promise<boolean> {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return false;
  try {
    const payload = await AuthService.verifyToken(token, new ConfigService(c.env).jwtSecret);
    return payload?.type === 'admin' || payload?.type === 'checkin_access';
  } catch {
    return false;
  }
}

export class CheckinController {
  private repo(c: C) { return new CheckinRepository(new ConfigService(c.env).db); }

  async getActions(c: C) {
    try {
      const courseId = parseInt(c.req.param('id'));
      return c.json({ success: true, actions: await this.repo(c).getActionsForCourse(courseId) });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async saveActions(c: C) {
    try {
      const courseId = parseInt(c.req.param('id'));
      const { actions } = await c.req.json();
      if (!Array.isArray(actions)) return c.json({ success: false, message: 'actions must be an array' }, 400);
      await this.repo(c).saveActionsForCourse(courseId, actions.filter(a => a?.label?.trim()));
      return c.json({ success: true });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  // Scanned by the in-CRM camera scanner — token comes straight off the QR,
  // no other auth on the attendee's side needed since the token itself is
  // the unguessable credential (same trust model as a password-reset link).
  async lookup(c: C) {
    try {
      const token = c.req.param('token');
      const result = await this.repo(c).lookupByToken(token);
      if (!result) return c.json({ success: false, message: 'ไม่พบข้อมูลการจองสำหรับ QR นี้' }, 404);

      // This route is reachable without a login so the QR button in a
      // confirmation email works (the token is the credential). Staff scanning
      // at the door need the parent's name and phone to sort out a mismatch;
      // the emailed page shows none of it, and an emailed link gets forwarded
      // — so whoever merely holds the token gets the booking, not the family's
      // contact details.
      //
      // The token is verified here rather than read off the context: this is
      // in ADMIN_PUBLIC_ROUTES now, and requireCrmAuth returns early on those
      // without ever setting crmUser, so trusting the context would strip the
      // fields from the scanner too.
      if (!(await isStaffRequest(c))) {
        const { parent_first_name, parent_last_name, parent_phone, ...publicBooking } = result;
        return c.json({ success: true, booking: publicBooking });
      }
      return c.json({ success: true, booking: result });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * "Has this family filled the survey in yet?" for the check-in card.
   *
   * Every name the booking knows is asked about — the account holder, the
   * child on the seat, and each person the registration form names — because
   * whoever answers a survey at the venue is any one of them, not reliably
   * the account the seat was booked under.
   *
   * Staff-only: it reports one family's answers across every form, which is
   * more than the token alone should unlock. The scanner passes its PIN
   * session, same as toggling an action.
   */
  async surveyHistory(c: C) {
    try {
      if (!(await isStaffRequest(c))) {
        return c.json({ success: false, message: 'ต้องเข้าสู่ระบบเจ้าหน้าที่' }, 403);
      }
      const bookingId = parseInt(c.req.param('bookingId'));
      if (!bookingId) return c.json({ success: false, message: 'bookingId is required' }, 400);

      const config = new ConfigService(c.env);
      const booking = await config.db.prepare(`
        SELECT b.id, b.form_submission_id, u.first_name, u.last_name, u.display_name, u.phone,
               ch.name AS child_name, ch.nickname AS child_nickname
          FROM Bookings b
          LEFT JOIN Children ch ON ch.id = b.child_id
          LEFT JOIN Users u ON u.id = ch.parent_id
         WHERE b.id = ?
      `).bind(bookingId).first<any>();
      if (!booking) return c.json({ success: false, message: 'ไม่พบการจอง' }, 404);

      const names: string[] = [
        [booking.first_name, booking.last_name].filter(Boolean).join(' '),
        booking.display_name,
        booking.child_name,
        booking.child_nickname,
      ].filter(Boolean);

      // The registration form's own people are the real attendees — the seat's
      // system child is often a placeholder. __realname carries the full name
      // behind a picker's display text (see the CRM booking list).
      if (booking.form_submission_id) {
        const sub = await config.db.prepare(
          'SELECT answers_json FROM Form_Submissions WHERE id = ?'
        ).bind(booking.form_submission_id).first<{ answers_json: string }>();
        try {
          const answers = JSON.parse(sub?.answers_json || '{}');
          for (const [key, value] of Object.entries(answers)) {
            if (typeof value !== 'string' || !value.trim()) continue;
            if (!key.endsWith('__realname') && !/^[0-9a-f-]{8,}$/i.test(key)) continue;
            names.push(value);
            // A picker's display text is often "เลโอ (ปัณณพัฒน์ เย็นฉ่ำ)" — the
            // name inside the brackets is what someone types into a form.
            const inner = value.match(/\(([^)]+)\)/);
            if (inner) names.push(inner[1]);
            names.push(value.replace(/\s*\([^)]*\)\s*/g, ' ').trim());
          }
        } catch { /* malformed answers just narrow the search */ }
      }

      const submissions = await this.repo(c).findSurveyHistory(names, [booking.phone || '']);
      return c.json({ success: true, submissions, matchedOn: { names: Array.from(new Set(names)) } });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async searchByPhone(c: C) {
    try {
      const phone = c.req.param('phone');
      const bookings = await this.repo(c).searchByPhone(phone);
      return c.json({ success: true, bookings });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * The rounds running on a day, for the scanner to be pointed at one.
   *
   * Without this the scanner is purely reactive — it knows whatever was just
   * scanned and nothing about the session being run, so it can never answer the
   * question staff actually keep asking, which is who has NOT arrived.
   */
  async rounds(c: C) {
    try {
      const db = new ConfigService(c.env).db;
      // Bangkok, not UTC: a round at 9am here must not be listed under
      // yesterday because the server thinks it is still 02:00.
      const date = c.req.query('date')
        || (await db.prepare("SELECT DATE('now','+7 hours') AS d").first<any>())?.d;

      const { results } = await db.prepare(`
        SELECT b.course_id, b.slot_date, SUBSTR(b.slot_start_time, 1, 5) AS slot_start_time,
               co.name AS course_name,
               COUNT(*) AS booked,
               SUM(CASE WHEN EXISTS (
                 SELECT 1 FROM Booking_Checkin_Log l WHERE l.booking_id = b.id
               ) THEN 1 ELSE 0 END) AS arrived
          FROM Bookings b
          JOIN Courses co ON co.id = b.course_id
         WHERE b.slot_date = ? AND b.status != 'cancelled'
         GROUP BY b.course_id, b.slot_date, SUBSTR(b.slot_start_time, 1, 5)
         ORDER BY slot_start_time, co.name
      `).bind(date).all<any>();

      return c.json({ success: true, date, rounds: results });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /** Mark a set of bookings as no-shows, or take the mark back. */
  async setNoShow(c: C) {
    try {
      const db = new ConfigService(c.env).db;
      const body = await c.req.json();
      const ids: number[] = Array.isArray(body.booking_ids) ? body.booking_ids.map(Number) : [];
      if (ids.length === 0) return c.json({ success: false, message: 'ยังไม่ได้เลือกรายการ' }, 400);

      const actorId = c.get('crmUser')?.userId ?? null;
      const res = body.clear === true
        ? await clearNoShow(db, ids)
        : await markNoShow(db, ids, actorId);

      return c.json({ success: true, changed: res.changed, skipped: ids.length - res.changed });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  /**
   * A round's attendance, and whether closing it off makes sense.
   *
   * `suggest` is false when nobody was ticked in at all — that means the round
   * was never run through the scanner, NOT that nobody came. Marking a whole
   * round absent on that basis would take away everyone's certificate.
   */
  async roundAttendance(c: C) {
    try {
      const db = new ConfigService(c.env).db;
      const courseId = parseInt(c.req.query('course_id') || '');
      const slotDate = c.req.query('slot_date') || '';
      const slotStart = c.req.query('slot_start_time') || '';
      if (!courseId || !slotDate) return c.json({ success: false, message: 'ต้องระบุรอบ' }, 400);

      const { results } = await db.prepare(`
        SELECT b.id, b.qr_token, b.status, b.slot_start_time,
               COALESCE(NULLIF(hp.nickname, ''), hp.name) AS who,
               (SELECT COUNT(*) FROM Booking_Checkin_Log l WHERE l.booking_id = b.id) AS ticks
          FROM Bookings b
          LEFT JOIN Children ch ON ch.id = b.child_id
          LEFT JOIN HD_Profiles hp ON hp.id = ch.hd_profile_id
         WHERE b.course_id = ? AND b.slot_date = ?
           AND (? = '' OR SUBSTR(b.slot_start_time, 1, 5) = SUBSTR(?, 1, 5))
           AND b.status != 'cancelled'
         ORDER BY who
      `).bind(courseId, slotDate, slotStart, slotStart).all<any>();

      const rows = results as any[];
      const arrived = rows.filter(r => Number(r.ticks) > 0);
      const missing = rows.filter(r => Number(r.ticks) === 0 && r.status !== 'no_show');

      return c.json({
        success: true,
        bookings: rows,
        arrived: arrived.length,
        total: rows.length,
        missing: missing.map(r => ({ id: r.id, who: r.who })),
        suggest: arrived.length > 0 && missing.length > 0,
      });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }

  async toggleAction(c: C) {
    try {
      const bookingId = parseInt(c.req.param('bookingId'));
      const actionId = parseInt(c.req.param('actionId'));
      const checkedByCrmUserId = c.get('crmUser')?.userId ?? null;
      const checked = await this.repo(c).toggleAction(bookingId, actionId, checkedByCrmUserId);

      // Someone standing at the door being ticked in is stronger evidence than
      // a button pressed at six o'clock. Arriving forty minutes late is the
      // ordinary case, not an edge one, so the scan simply undoes the mark.
      if (checked) await clearNoShow(new ConfigService(c.env).db, [bookingId]);

      // Turning up is what earns the stamp, and the first ticked item at the
      // door is the moment we know they turned up. Unticking the last one undoes
      // it — a mis-scan should not leave a memento behind. A stamp granted by
      // hand or at "class finished" is left alone (see revokeParticipation).
      const db = new ConfigService(c.env).db;
      const remaining = await db.prepare(
        'SELECT COUNT(*) AS n FROM Booking_Checkin_Log WHERE booking_id = ?'
      ).bind(bookingId).first<any>();

      if (checked) {
        await awardParticipation(db, { bookingId, source: 'checkin', actorId: checkedByCrmUserId });
        // Only for items set to hand out certificates at the door — see
        // Courses.certificate_auto.
        await autoIssueCertificate(db, { bookingId, moment: 'checkin', actorId: checkedByCrmUserId });
      } else if ((remaining?.n ?? 0) === 0) {
        await revokeParticipation(db, { bookingId, actorId: checkedByCrmUserId, source: 'checkin' });
        await revokeAutoIssuedCertificate(db, { bookingId, source: 'checkin' });
      }

      return c.json({ success: true, checked });
    } catch (e: any) { return c.json({ success: false, message: e.message }, 500); }
  }
}

import { computeStampExpiry } from '../utils/stampExpiry';

/**
 * Stamps, points and medals — all awarded through here.
 *
 * A stamp is now a memento of joining one item: one per booking, wearing that
 * item's artwork, numbered by which visit it was. Points are the spendable
 * half and live in Reward_Points, so redeeming a reward no longer erases a
 * child's collection.
 *
 * Three things trigger an award — checking in at the door, marking the class
 * finished, and a staff member granting one by hand — and they can all happen
 * for the same booking. That is why every entry point lands here and why the
 * write is idempotent: the unique index on (child_id, booking_id) means a
 * second attempt is a no-op rather than a duplicate.
 */

export type StampSource = 'checkin' | 'completion' | 'manual';

export interface AwardResult {
  awarded: boolean;      // false = already had one, nothing changed
  stampId?: number;
  visitNumber?: number;
  pointsAwarded?: number;
  badgeTier?: number | null;
}

interface BookingRow {
  id: number;
  child_id: number;
  course_id: number;
  calendar_id: number | null;
  slot_date: string | null;
  slot_start_time: string | null;
}

/**
 * Which artwork this booking's stamp should wear.
 *
 * Most specific binding wins: the exact round, then the calendar the round
 * belongs to, then the item. A competition can therefore give each round its
 * own stamp while every other round falls back to the item's design, without
 * anyone having to bind every round by hand.
 */
export async function resolveStampDesignId(
  db: D1Database,
  opts: { courseId?: number | null; calendarId?: number | null; slotRuleId?: number | null },
): Promise<number | null> {
  const scopes: [string, number][] = [];
  if (opts.slotRuleId) scopes.push(['slot_rule', opts.slotRuleId]);
  if (opts.calendarId) scopes.push(['calendar', opts.calendarId]);
  if (opts.courseId) scopes.push(['course', opts.courseId]);

  for (const [scope, refId] of scopes) {
    const row = await db.prepare(`
      SELECT b.design_id FROM Stamp_Design_Bindings b
      JOIN Stamp_Designs d ON d.id = b.design_id AND d.is_active = 1
      WHERE b.scope = ? AND b.ref_id = ?
    `).bind(scope, refId).first<any>();
    if (row?.design_id) return row.design_id;
  }
  return null; // falls back to Stamp_Image_Ranges, then to a CI colour
}

/**
 * The round a booking sits in, if its calendar has one matching rule. Used only
 * to pick artwork, so a miss is harmless — the calendar-level design applies.
 */
async function findSlotRuleId(db: D1Database, booking: BookingRow): Promise<number | null> {
  if (!booking.calendar_id || !booking.slot_start_time) return null;
  const row = await db.prepare(`
    SELECT id FROM Calendar_Slot_Rules
    WHERE calendar_id = ? AND start_time = ?
      AND (specific_date IS NULL OR specific_date = ?)
    ORDER BY specific_date DESC
    LIMIT 1
  `).bind(booking.calendar_id, booking.slot_start_time, booking.slot_date).first<any>();
  return row?.id ?? null;
}

export async function creditPoints(
  db: D1Database,
  args: {
    childId: number; delta: number; reason: string;
    bookingId?: number | null; courseId?: number | null; redemptionId?: number | null;
    note?: string | null; expiresAt?: string | null; actorId?: number | null;
  },
): Promise<void> {
  await db.prepare(`
    INSERT INTO Reward_Points (child_id, delta, reason, booking_id, course_id, redemption_id, note, expires_at, created_by_crm_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    args.childId, args.delta, args.reason,
    args.bookingId ?? null, args.courseId ?? null, args.redemptionId ?? null,
    args.note ?? null, args.expiresAt ?? null, args.actorId ?? null,
  ).run();
}

/** Spendable balance: everything earned minus everything spent, expiry applied. */
export async function getPointsBalance(db: D1Database, childId: number): Promise<number> {
  const row = await db.prepare(`
    SELECT COALESCE(SUM(delta), 0) AS balance FROM Reward_Points
    WHERE child_id = ? AND (delta < 0 OR expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  `).bind(childId).first<any>();
  return row?.balance ?? 0;
}

/**
 * Grants a medal. Idempotent per (child, booking, tier) so the participation
 * grant can fire from check-in and from "class finished" without doubling up.
 */
export async function awardBadge(
  db: D1Database,
  args: {
    childId: number; tier: number; courseId?: number | null; bookingId?: number | null;
    source?: 'participation' | 'manual'; note?: string | null; actorId?: number | null;
  },
): Promise<boolean> {
  if (args.bookingId) {
    const existing = await db.prepare(
      'SELECT id FROM Child_Badges WHERE child_id = ? AND booking_id = ? AND tier = ? AND revoked_at IS NULL'
    ).bind(args.childId, args.bookingId, args.tier).first();
    if (existing) return false;
  }
  await db.prepare(`
    INSERT INTO Child_Badges (child_id, tier, course_id, booking_id, note, source, awarded_by_crm_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    args.childId, args.tier, args.courseId ?? null, args.bookingId ?? null,
    args.note ?? null, args.source ?? 'manual', args.actorId ?? null,
  ).run();
  return true;
}

/**
 * The award path. Records the stamp, credits the item's points, and hands out
 * the participation medal when the item grants one.
 *
 * Returns awarded: false when this booking already has a live stamp — the
 * caller should treat that as success, not as an error.
 */
export async function awardParticipation(
  db: D1Database,
  args: { bookingId: number; source: StampSource; actorId?: number | null; note?: string | null },
): Promise<AwardResult> {
  const booking = await db.prepare(
    'SELECT id, child_id, course_id, calendar_id, slot_date, slot_start_time FROM Bookings WHERE id = ?'
  ).bind(args.bookingId).first<BookingRow>();
  if (!booking?.child_id || !booking?.course_id) return { awarded: false };

  const existing = await db.prepare(
    'SELECT id, visit_number FROM Stamps WHERE child_id = ? AND booking_id = ? AND revoked_at IS NULL'
  ).bind(booking.child_id, booking.id).first<any>();
  if (existing) return { awarded: false, stampId: existing.id, visitNumber: existing.visit_number };

  const course = await db.prepare(
    'SELECT stamps_on_completion, stamp_expiry_months, participation_badge_tier FROM Courses WHERE id = ?'
  ).bind(booking.course_id).first<any>();

  const slotRuleId = await findSlotRuleId(db, booking);
  const designId = await resolveStampDesignId(db, {
    courseId: booking.course_id, calendarId: booking.calendar_id, slotRuleId,
  });

  // "Your 3rd time at this item." Counted once and stored, so a later
  // correction elsewhere in the history cannot renumber someone's stamps.
  const priorRow = await db.prepare(
    'SELECT COUNT(*) AS n FROM Stamps WHERE child_id = ? AND course_id = ? AND revoked_at IS NULL'
  ).bind(booking.child_id, booking.course_id).first<any>();
  const visitNumber = (priorRow?.n ?? 0) + 1;

  const expiryMonths = course?.stamp_expiry_months ?? 12;
  const expiresAt = computeStampExpiry(new Date(), expiryMonths).toISOString();

  const inserted = await db.prepare(`
    INSERT INTO Stamps (child_id, booking_id, course_id, calendar_id, slot_rule_id,
                        design_id, visit_number, source, granted_by_crm_user_id, note, expires_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')
  `).bind(
    booking.child_id, booking.id, booking.course_id, booking.calendar_id ?? null, slotRuleId,
    designId, visitNumber, args.source, args.actorId ?? null, args.note ?? null, expiresAt,
  ).run();

  // Points are the item's own setting — a class worth 3 points still gives 3,
  // it just gives one stamp for the collection.
  const points = course?.stamps_on_completion ?? 0;
  if (points > 0) {
    await creditPoints(db, {
      childId: booking.child_id, delta: points, reason: 'attend',
      bookingId: booking.id, courseId: booking.course_id, expiresAt,
    });
  }

  const tier = course?.participation_badge_tier ?? null;
  if (tier) {
    await awardBadge(db, {
      childId: booking.child_id, tier, courseId: booking.course_id,
      bookingId: booking.id, source: 'participation',
    });
  }

  return {
    awarded: true,
    stampId: Number(inserted.meta?.last_row_id ?? 0),
    visitNumber,
    pointsAwarded: points,
    badgeTier: tier,
  };
}

/**
 * Undoes an award — a mis-scan at the door, or a booking that turned out not to
 * have happened. The rows are revoked rather than deleted so the history stays
 * readable, and the points are taken back with an offsetting entry.
 */
export async function revokeParticipation(
  db: D1Database,
  args: { bookingId: number; actorId?: number | null; source?: StampSource },
): Promise<boolean> {
  const stamp = await db.prepare(
    'SELECT id, child_id, course_id, source FROM Stamps WHERE booking_id = ? AND revoked_at IS NULL'
  ).bind(args.bookingId).first<any>();
  if (!stamp) return false;
  // An unticked check-in must not wipe a stamp a staff member granted by hand.
  if (args.source && stamp.source !== args.source) return false;

  await db.prepare('UPDATE Stamps SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').bind(stamp.id).run();

  const earned = await db.prepare(
    "SELECT COALESCE(SUM(delta), 0) AS n FROM Reward_Points WHERE booking_id = ? AND reason = 'attend'"
  ).bind(args.bookingId).first<any>();
  if ((earned?.n ?? 0) > 0) {
    await creditPoints(db, {
      childId: stamp.child_id, delta: -earned.n, reason: 'manual',
      bookingId: args.bookingId, courseId: stamp.course_id,
      note: 'ยกเลิกการเข้าร่วม', actorId: args.actorId ?? null,
    });
  }

  await db.prepare(
    "UPDATE Child_Badges SET revoked_at = CURRENT_TIMESTAMP WHERE booking_id = ? AND source = 'participation' AND revoked_at IS NULL"
  ).bind(args.bookingId).run();

  return true;
}

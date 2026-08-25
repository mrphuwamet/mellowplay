/**
 * "Did not turn up" — recorded, and kept apart from "cancelled".
 *
 * A cancellation is a decision someone communicated: the seat goes back and the
 * coupon is refunded. A no-show is an absence noticed afterwards: the seat was
 * taken, the money was paid, and nothing is given back. Running the two through
 * one status would quietly refund a coupon to everyone who simply did not
 * arrive.
 *
 * That distinction is why the 29 places asking `status != 'cancelled'` mostly
 * need no change at all: they are asking "was this seat used", and for a
 * no-show the answer is still yes. Only the places asking "was this person
 * actually here" — certificates, stamps, medals — have to exclude them, and
 * they all go through the helper below rather than each writing the test.
 */

/** Statuses meaning the person was not at the activity. */
export const ABSENT_STATUSES = ['cancelled', 'no_show'] as const;

export const isAbsent = (status?: string | null): boolean =>
  ABSENT_STATUSES.includes(String(status ?? '') as any);

/** SQL fragment for "actually attended", for the reward paths. */
export const ATTENDED_SQL = "status NOT IN ('cancelled', 'no_show')";

export interface MarkResult { changed: number }

/**
 * Mark bookings as no-shows.
 *
 * Only touches live bookings: marking a cancellation as a no-show would
 * overwrite the more specific fact with a vaguer one, and re-marking an
 * existing no-show would move its timestamp for no reason.
 */
export async function markNoShow(
  db: D1Database,
  bookingIds: number[],
  actorId: number | null,
): Promise<MarkResult> {
  let changed = 0;
  for (const id of bookingIds) {
    const res = await db.prepare(`
      UPDATE Bookings
         SET status = 'no_show',
             no_show_at = datetime('now'),
             no_show_by_crm_user_id = ?
       WHERE id = ? AND status NOT IN ('cancelled', 'no_show')
    `).bind(actorId, id).run();
    changed += Number(res.meta.changes || 0);
  }
  return { changed };
}

/**
 * Undo it, back to a paid booking.
 *
 * Needed because the ordinary case is someone arriving forty minutes late,
 * after the round was closed off. Without this the only way back is the Super
 * Admin force-status tool, which should not be part of a normal evening.
 */
export async function clearNoShow(
  db: D1Database,
  bookingIds: number[],
): Promise<MarkResult> {
  let changed = 0;
  for (const id of bookingIds) {
    const res = await db.prepare(`
      UPDATE Bookings
         SET status = 'confirmed_paid', no_show_at = NULL, no_show_by_crm_user_id = NULL
       WHERE id = ? AND status = 'no_show'
    `).bind(id).run();
    changed += Number(res.meta.changes || 0);
  }
  return { changed };
}

/**
 * How often this child has failed to turn up lately.
 *
 * Shown before the event rather than after — a count that only appears in a
 * report nobody opens changes nothing, while "ไม่มา 3 จาก 5 ครั้งล่าสุด" on the
 * check-in card is something staff can act on.
 */
export async function noShowHistory(
  db: D1Database,
  childId: number,
  limit = 5,
): Promise<{ missed: number; of: number }> {
  const { results } = await db.prepare(`
    SELECT status FROM Bookings
     WHERE child_id = ? AND status != 'cancelled' AND scheduled_at < datetime('now')
     ORDER BY scheduled_at DESC LIMIT ?
  `).bind(childId, limit).all<{ status: string }>();
  const rows = results as any[];
  return { missed: rows.filter(r => r.status === 'no_show').length, of: rows.length };
}

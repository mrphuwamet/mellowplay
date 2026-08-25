/**
 * The QR standing at the door, and what it tells the answers about themselves.
 *
 * One code per round rather than one per person: at a venue there is a single
 * sheet of paper on a table and everyone scans it. That is the whole reason a
 * per-booking link was the wrong shape.
 *
 * What it buys is the thing name-matching keeps getting wrong. A survey answered
 * through a round link records the round it was given in, and — when the person
 * is signed in and holds a booking for that round — the booking itself. No
 * guessing from a nickname, a different spelling, or which of two siblings.
 */

// Ambiguous characters left out: these get read off a printed sheet.
const TOKEN_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const generateRoundToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, b => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('');
};

export interface RoundLink {
  id: number;
  token: string;
  session_id: number;
  course_id: number;
  slot_date: string;
  slot_start_time: string | null;
  label: string | null;
  revoked_at: string | null;
}

export async function findRoundLink(db: D1Database, token: string): Promise<any | null> {
  return await db.prepare(`
    SELECT l.*, s.slug AS session_slug, s.name AS session_name, s.is_active AS session_active,
           co.name AS course_name,
           COALESCE(NULLIF(co.location_label, ''), co.location) AS course_location
      FROM Round_Survey_Links l
      JOIN Survey_Sessions s ON s.id = l.session_id
      JOIN Courses co ON co.id = l.course_id
     WHERE l.token = ? AND l.revoked_at IS NULL
  `).bind(token).first();
}

/**
 * Which booking on this round belongs to this signed-in account.
 *
 * Only ever one lookup, and only for someone already authenticated — the link
 * itself is public and must not become a way to ask who is booked on a round.
 *
 * When a parent has several children in the same round there is no way to tell
 * from the account alone which one the answers are about, so nothing is
 * attached rather than attaching the wrong one; the name match stays the
 * fallback exactly as before.
 */
export async function bookingForRound(
  db: D1Database,
  link: { course_id: number; slot_date: string; slot_start_time: string | null },
  userId: number,
): Promise<number | null> {
  const { results } = await db.prepare(`
    SELECT b.id FROM Bookings b
      JOIN Children ch ON ch.id = b.child_id
     WHERE ch.parent_id = ?
       AND b.course_id = ? AND b.slot_date = ?
       AND (? IS NULL OR SUBSTR(b.slot_start_time, 1, 5) = SUBSTR(?, 1, 5))
       AND b.status NOT IN ('cancelled')
     LIMIT 2
  `).bind(
    userId, link.course_id, link.slot_date,
    link.slot_start_time, link.slot_start_time,
  ).all<{ id: number }>();

  const rows = results as any[];
  return rows.length === 1 ? Number(rows[0].id) : null;
}

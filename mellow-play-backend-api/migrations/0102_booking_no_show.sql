-- Tell "did not turn up" apart from "told us they were not coming".
--
-- Applied by hand (never `d1 migrations apply` — d1_migrations is stale at
-- 0066):
--   npx wrangler d1 execute mellow_play_db_dev --remote --file migrations/0102_booking_no_show.sql
--   npx wrangler d1 execute mellow_play_db     --remote --file migrations/0102_booking_no_show.sql
--
-- Until now a no-show sat at 'confirmed_paid' forever, indistinguishable from
-- someone who attended. Bookings.status carries no CHECK constraint, so the new
-- value 'no_show' needs no table rebuild — only this timestamp.
--
-- Deliberately NOT reusing cancelled_at. A cancellation is a decision someone
-- communicated; a no-show is an absence we noticed afterwards. Sharing a column
-- would make the two indistinguishable again, one layer down.
--
-- No backfill. Every booking that ever went unattended is currently unmarked,
-- and guessing which of 435 confirmed_paid rows were absences would invent
-- history rather than record it.
ALTER TABLE Bookings ADD COLUMN no_show_at DATETIME;

-- Who marked it, so a disputed absence can be asked about.
ALTER TABLE Bookings ADD COLUMN no_show_by_crm_user_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_bookings_no_show ON Bookings(status, slot_date);

-- Rounds and calendars a staff member is watching on the booking dashboard.
--
-- Per CRM user, not shared: "the rounds I most want filled" is a working list
-- for whoever is chasing them this week, and one person clearing their stars
-- must not clear everyone else's.
--
-- The target is stored as a plain key rather than a foreign key because a
-- round is not a row anywhere: it is a Calendar_Slot_Rule resolved onto a date
-- ("<calendar_id>|<YYYY-MM-DD> <HH:MM>"). A calendar watch stores just
-- "<calendar_id>". Nothing else joins on this, so a stale key after a schedule
-- change costs a dead star, not a broken query — and the dashboard drops keys
-- it no longer finds among the upcoming rounds.
CREATE TABLE IF NOT EXISTS Crm_Booking_Watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crm_user_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('round', 'calendar')),
  target_key TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_watchlist_unique
  ON Crm_Booking_Watchlist(crm_user_id, kind, target_key);

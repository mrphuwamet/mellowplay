-- An album covers a SET of rounds, not one.
--
-- 0109 gave albums a date and 0110 added a start time, which together name
-- exactly one round. But a shoot usually spans several: the photographer covers
-- both of Saturday's rounds, or the whole weekend, and one album is what
-- families should open. Two columns cannot say that.
--
-- So the rounds move to their own rows. The old columns go with them rather
-- than staying behind as a "primary round": one fact in two places is how the
-- picker, the card and the query end up disagreeing, and anything that wants a
-- single date can take MIN(slot_date) from here.
--
-- Safe to restructure rather than deprecate because both databases hold zero
-- albums — the feature shipped today. The backfill below is therefore a no-op
-- in practice, and written anyway so this migration is correct wherever it runs.

CREATE TABLE IF NOT EXISTS Event_Album_Rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL REFERENCES Event_Albums(id) ON DELETE CASCADE,
  slot_date TEXT NOT NULL,
  -- NULL means the whole day: a course whose rounds have no start time, and the
  -- staff choice "this date, every round of it".
  slot_start_time TEXT,
  -- An album listing the same round twice is a double-click, never an
  -- intention. NULLs compare as distinct in SQLite, so the whole-day row and a
  -- specific-time row can coexist for one date, which is what we want.
  UNIQUE(album_id, slot_date, slot_start_time)
);

CREATE INDEX IF NOT EXISTS idx_event_album_rounds_album
  ON Event_Album_Rounds(album_id, slot_date, slot_start_time);

INSERT OR IGNORE INTO Event_Album_Rounds (album_id, slot_date, slot_start_time)
SELECT id, slot_date, slot_start_time
  FROM Event_Albums
 WHERE slot_date IS NOT NULL;

ALTER TABLE Event_Albums DROP COLUMN slot_start_time;
ALTER TABLE Event_Albums DROP COLUMN slot_date;

-- One QR at the door, pointing at the round it is standing in.
--
-- Applied by hand (never `d1 migrations apply` — d1_migrations is stale at
-- 0066):
--   npx wrangler d1 execute mellow_play_db_dev --remote --file migrations/0103_round_survey_links.sql
--   npx wrangler d1 execute mellow_play_db     --remote --file migrations/0103_round_survey_links.sql
--
-- Survey_Sessions already is "one shareable link carrying several forms in
-- order", so nothing here rebuilds that. What was missing is WHICH ROUND a
-- sitting belongs to: today the check-in card has to match answers to people by
-- NAME, which breaks on a nickname, a different spelling, or two siblings.
--
-- A row per QR printed, rather than the round encoded in the URL: a token can be
-- revoked when a sheet of paper walks off, and a parent cannot edit the date in
-- the address bar and file their answers against a round they did not attend.
CREATE TABLE IF NOT EXISTS Round_Survey_Links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  session_id INTEGER NOT NULL REFERENCES Survey_Sessions(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES Courses(id) ON DELETE CASCADE,
  slot_date TEXT NOT NULL,
  -- HH:MM. Null means the whole day, for an event with no fixed rounds.
  slot_start_time TEXT,
  label TEXT,
  created_by_crm_user_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_round_link_token ON Round_Survey_Links(token);
CREATE INDEX IF NOT EXISTS idx_round_link_round ON Round_Survey_Links(course_id, slot_date);

-- Where an answer was given. Written from the link, not typed by the
-- respondent, so it cannot disagree with the round they were actually in.
--
-- booking_id is the prize: filled in when the person is signed in and holds a
-- booking for that round, which replaces matching by name entirely. NULL for a
-- guest, and the name match stays as the fallback for those.
ALTER TABLE Survey_Submissions ADD COLUMN course_id INTEGER;
ALTER TABLE Survey_Submissions ADD COLUMN slot_date TEXT;
ALTER TABLE Survey_Submissions ADD COLUMN slot_start_time TEXT;
ALTER TABLE Survey_Submissions ADD COLUMN booking_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_survey_sub_round ON Survey_Submissions(course_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_survey_sub_booking ON Survey_Submissions(booking_id);

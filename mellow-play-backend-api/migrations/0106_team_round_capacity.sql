-- A team can hold a different number of people in one round than in another.
--
-- Applied by hand (never `d1 migrations apply` — d1_migrations is stale at
-- 0066):
--   npx wrangler d1 execute mellow_play_db_dev --remote --file migrations/0106_team_round_capacity.sql
--   npx wrangler d1 execute mellow_play_db     --remote --file migrations/0106_team_round_capacity.sql
--
-- Until now a team's capacity lived in the form field's options_json, which is
-- one number for every round the form is ever used in. Real events do not work
-- that way: a Saturday morning round takes six per team and the afternoon one
-- takes ten, and the only way to express that was a second form.
--
-- An OVERRIDE table, not a replacement. A round with no row here uses the
-- number on the form, so nothing existing changes and nothing has to be
-- backfilled — and the form still answers "what is the usual size".
CREATE TABLE IF NOT EXISTS Form_Team_Round_Capacity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id INTEGER NOT NULL REFERENCES Registration_Forms(id) ON DELETE CASCADE,
  -- Which team_select field, since a form may hold more than one.
  field_key TEXT NOT NULL,
  course_id INTEGER NOT NULL REFERENCES Courses(id) ON DELETE CASCADE,
  slot_date TEXT NOT NULL,
  -- HH:MM. The round is identified the same way bookings identify theirs.
  slot_start_time TEXT NOT NULL,
  team_label TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- One number per team per round. Setting it twice edits it rather than
-- stacking a second row that nobody could tell apart from the first.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_round_capacity
  ON Form_Team_Round_Capacity(form_id, field_key, course_id, slot_date, slot_start_time, team_label);

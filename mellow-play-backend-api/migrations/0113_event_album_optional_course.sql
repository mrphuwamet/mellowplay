-- An album does not have to belong to one activity.
--
-- Several activities run at once in the same hall, and the photographer covers
-- the room, not a timetable. Forcing every album onto one course_id meant
-- picking whichever activity was least wrong and hiding the album from
-- everyone who came for the others.
--
-- So course_id becomes optional. It still means what it meant when set —
-- "the families who booked this can see it" — and NULL means the album is not
-- about one activity: it is announced as news and open to anyone signed in.
-- The unlisted share link works either way.
--
-- ── READ THIS BEFORE CHANGING ANY PARENT TABLE ──────────────────────────────
--
-- SQLite cannot relax NOT NULL in place, so the table has to be rebuilt. The
-- obvious rebuild — new table, copy, DROP TABLE, rename — DESTROYS DATA here,
-- and did: with foreign keys on (D1's default), DROP TABLE performs an implicit
-- delete of every row, which fires ON DELETE CASCADE on the children. Running
-- exactly that took 122 Event_Album_Photos and 2 Event_Album_Rounds rows with
-- it on production. PRAGMA defer_foreign_keys does not help — it defers the
-- CHECKING of constraints, not the cascade actions themselves.
--
-- The children are therefore parked in temporary tables first and put back
-- afterwards. Explicit, and it does not depend on being able to turn foreign
-- keys off, which a D1 migration cannot do.

CREATE TEMP TABLE IF NOT EXISTS _keep_photos AS SELECT * FROM Event_Album_Photos;
CREATE TEMP TABLE IF NOT EXISTS _keep_rounds AS SELECT * FROM Event_Album_Rounds;

CREATE TABLE Event_Albums_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  -- NULL = not tied to one activity. See above.
  course_id INTEGER REFERENCES Courses(id),
  drive_folder_id TEXT,
  cover_photo_url TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  -- The news post created when the album was published with "สร้างโพสข่าวสาร".
  news_feed_id INTEGER REFERENCES News_Feed(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- The unlisted share link. The token itself is the permission to view.
  share_token TEXT
);

INSERT INTO Event_Albums_new
  (id, name, description, course_id, drive_folder_id, cover_photo_url,
   is_published, news_feed_id, created_at, updated_at, share_token)
SELECT
   id, name, description, course_id, drive_folder_id, cover_photo_url,
   is_published, news_feed_id, created_at, updated_at, share_token
  FROM Event_Albums;

DROP TABLE Event_Albums;
ALTER TABLE Event_Albums_new RENAME TO Event_Albums;

-- Whatever the cascade took, put back.
INSERT OR IGNORE INTO Event_Album_Photos SELECT * FROM _keep_photos;
INSERT OR IGNORE INTO Event_Album_Rounds SELECT * FROM _keep_rounds;
DROP TABLE _keep_photos;
DROP TABLE _keep_rounds;

CREATE INDEX IF NOT EXISTS idx_event_albums_course
  ON Event_Albums(course_id, is_published);
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_albums_share_token
  ON Event_Albums(share_token) WHERE share_token IS NOT NULL;

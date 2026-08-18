-- Click-throughs on a tagged link.
--
-- Tag reporting so far started at the registration: a sponsor's ?tag= is
-- stamped on the booking, and the report counts bookings. That answers "how
-- many people signed up through this campaign" and cannot answer "how many
-- people it brought to the door" — a campaign sending a thousand visitors who
-- do not register looks identical to one nobody clicked.
--
-- One row per arrival carrying a tag. Not per page view: the tag rides in the
-- URL of the shared link, so an arrival with ?tag= in it IS the click.
CREATE TABLE IF NOT EXISTS Tag_Clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag TEXT NOT NULL,
  -- Where the link pointed. A sponsor sharing three different pages under one
  -- tag wants to know which of them people actually opened.
  path TEXT,
  -- The browser's own session id (same one Site_Visits uses), so repeat
  -- arrivals from one person can be told from a thousand separate people.
  session_id TEXT,
  referrer TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tag_clicks_tag ON Tag_Clicks(tag, created_at);
CREATE INDEX IF NOT EXISTS idx_tag_clicks_created ON Tag_Clicks(created_at);

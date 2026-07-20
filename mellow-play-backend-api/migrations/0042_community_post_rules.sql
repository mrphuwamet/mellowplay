ALTER TABLE Users ADD COLUMN is_community_admin INTEGER DEFAULT 0;

ALTER TABLE Community_Posts ADD COLUMN post_type TEXT DEFAULT 'text';
ALTER TABLE Community_Posts ADD COLUMN location_name TEXT;
ALTER TABLE Community_Posts ADD COLUMN location_lat REAL;
ALTER TABLE Community_Posts ADD COLUMN location_lng REAL;
ALTER TABLE Community_Posts ADD COLUMN google_place_id TEXT;

CREATE TABLE Community_Poll_Options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES Community_Posts(id),
  option_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE Community_Poll_Votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  option_id INTEGER NOT NULL REFERENCES Community_Poll_Options(id),
  user_id INTEGER NOT NULL REFERENCES Users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(option_id, user_id)
);

CREATE INDEX idx_community_poll_options_post_id ON Community_Poll_Options(post_id);

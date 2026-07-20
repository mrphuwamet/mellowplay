-- Community feature: user-authored posts on Home, with likes and comments.
-- Deliberately mirrors News_Feed_Likes/News_Feed_Comments's shape (see
-- migrations/0001_init.sql) but Community_Posts has its own author (user_id)
-- unlike News_Feed, which is CRM-staff-authored only.

CREATE TABLE Community_Posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES Users(id),
  content TEXT NOT NULL,
  image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Community_Post_Likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES Community_Posts(id),
  user_id INTEGER NOT NULL REFERENCES Users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id)
);

CREATE TABLE Community_Post_Comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES Community_Posts(id),
  user_id INTEGER NOT NULL REFERENCES Users(id),
  comment_text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_community_posts_created_at ON Community_Posts(created_at DESC);
CREATE INDEX idx_community_post_comments_post_id ON Community_Post_Comments(post_id);

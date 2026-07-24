-- Report/flag moderation for community posts (report-then-review, per
-- 2026-07-24 product decision — not pre-publish review). A post stays live
-- the moment it's created; members can flag one, and CRM staff review
-- flagged posts and hide or delete them. A report on its own never hides
-- anything automatically.
CREATE TABLE Community_Post_Reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES Community_Posts(id),
  reporter_user_id INTEGER NOT NULL REFERENCES Users(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | dismissed | actioned
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, reporter_user_id)
);

-- Lets staff hide a reported post from the public feed without hard-deleting
-- it (keeps content around in case of an appeal), separate from the post's
-- own author deleting it outright.
ALTER TABLE Community_Posts ADD COLUMN is_hidden BOOLEAN DEFAULT 0;

CREATE INDEX idx_community_post_reports_post_id ON Community_Post_Reports(post_id);
CREATE INDEX idx_community_post_reports_status ON Community_Post_Reports(status);

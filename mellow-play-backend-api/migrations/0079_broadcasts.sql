-- Marketing broadcasts — one campaign, many recipients, sent in the
-- background rather than in the request that started it.
--
-- Sending happens on the existing cron: a Worker request has a wall-clock and
-- subrequest ceiling, so a click that tries to mail a thousand people either
-- times out halfway or silently drops the tail. Queueing the recipients and
-- draining them a batch at a time also means a send survives a deploy, and
-- lets the CRM show real progress instead of a spinner.
CREATE TABLE Broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                  -- internal label, never shown to recipients
  channel TEXT NOT NULL CHECK(channel IN ('email','sms','both')),
  subject TEXT,                        -- email only
  body_html TEXT,                      -- email only
  sms_message TEXT,                    -- sms only
  -- How the recipient list was built, kept for the record: staff need to be
  -- able to answer "who did this go to?" months later, and the audience query
  -- can return different people by then.
  audience_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sending','sent','cancelled')),
  total_recipients INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  finished_at DATETIME
);

-- The queue. One row per person per channel, frozen at launch time: the
-- audience is resolved once so that editing a course or a consent flag
-- mid-send cannot change who is left to receive it.
CREATE TABLE Broadcast_Recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  broadcast_id INTEGER NOT NULL REFERENCES Broadcasts(id) ON DELETE CASCADE,
  user_id INTEGER,
  name TEXT,
  email TEXT,
  phone TEXT,
  channel TEXT NOT NULL CHECK(channel IN ('email','sms')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','skipped')),
  detail TEXT,
  sent_at DATETIME
);
CREATE INDEX idx_broadcast_recipients_queue ON Broadcast_Recipients(broadcast_id, status);

-- Unsubscribe.
--
-- A per-user token rather than the user id: an id in a URL lets anyone
-- unsubscribe anyone by counting upwards, and the link travels in plain email
-- through servers we do not control. The token is stable per user so every
-- broadcast can carry the same link without minting rows on each send.
ALTER TABLE Users ADD COLUMN unsubscribe_token TEXT;
CREATE UNIQUE INDEX idx_users_unsubscribe_token ON Users(unsubscribe_token) WHERE unsubscribe_token IS NOT NULL;

-- Where the unsubscribe page lives, so the backend can build the link without
-- the consumer app's URL being hardcoded in application code.
INSERT OR IGNORE INTO System_Settings (key, value, description) VALUES
  ('broadcast_batch_size', '40', 'จำนวนอีเมล/SMS ที่ทยอยส่งต่อรอบ cron'),
  ('consumer_app_url', 'https://mellowplay.co', 'URL แอปลูกค้า ใช้สร้างลิงก์ยกเลิกรับข่าวสาร');

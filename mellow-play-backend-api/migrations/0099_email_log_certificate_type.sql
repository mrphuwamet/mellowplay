-- Let Email_Logs record a certificate send.
--
-- Applied by hand (never `d1 migrations apply` — d1_migrations is stale at
-- 0066):
--   npx wrangler d1 execute mellow_play_db_dev --remote --file migrations/0099_email_log_certificate_type.sql
--   npx wrangler d1 execute mellow_play_db     --remote --file migrations/0099_email_log_certificate_type.sql
--
-- `type` carries a CHECK constraint, and SQLite cannot alter one — the table has
-- to be rebuilt. Same manoeuvre as migration 0072 did for this table's sibling.
-- Every column, index and comment is carried over unchanged; the only
-- difference is 'certificate' in the allowed list.
--
-- Ordering matters: the copy happens before the drop, and the indexes are
-- recreated after the rename, or a failure midway leaves the log unreadable.

CREATE TABLE Email_Logs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER,
  course_id INTEGER,
  -- 'welcome'     — sent once when an account is created
  -- 'broadcast'   — a marketing send from the CRM's broadcast screen
  -- 'certificate' — a link to an e-certificate that was issued
  type TEXT NOT NULL CHECK(type IN ('booking_success','reminder','otp','password_reset','welcome','broadcast','certificate')),
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT,
  status TEXT NOT NULL CHECK(status IN ('sent','failed')),
  provider_message_id TEXT,
  provider_detail TEXT,
  sent_by INTEGER,
  -- Which broadcast produced this row, so the send screen can show its own
  -- delivery result without scanning the whole log.
  broadcast_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO Email_Logs_new
  (id, booking_id, course_id, type, email, subject, body_html, status,
   provider_message_id, provider_detail, sent_by, broadcast_id, created_at)
SELECT
   id, booking_id, course_id, type, email, subject, body_html, status,
   provider_message_id, provider_detail, sent_by, broadcast_id, created_at
FROM Email_Logs;

DROP TABLE Email_Logs;
ALTER TABLE Email_Logs_new RENAME TO Email_Logs;

CREATE INDEX IF NOT EXISTS idx_email_logs_booking   ON Email_Logs(booking_id, type);
CREATE INDEX IF NOT EXISTS idx_email_logs_course    ON Email_Logs(course_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_email     ON Email_Logs(email, created_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_created   ON Email_Logs(created_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_broadcast ON Email_Logs(broadcast_id);

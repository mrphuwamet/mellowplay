-- A survey receipt had nowhere to be recorded.
--
-- Email_Logs constrains `type` with a CHECK, and SQLite cannot alter one, so
-- the table is rebuilt — the same reason migration 0072 rebuilt Sms_Logs. The
-- new type is 'survey_receipt', and a new column says which submission it was
-- for, so a receipt can be traced back to the registration that earned it.
--
-- Until this existed the survey receipt sent nothing to the log at all: when
-- it failed, it failed invisibly, which is the one thing a mail that says
-- "your registration is confirmed" must never do.

CREATE TABLE Email_Logs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER,
  course_id INTEGER,
  -- 'welcome'        — sent once when an account is created
  -- 'broadcast'      — a marketing send from the CRM's broadcast screen
  -- 'certificate'    — a link to an e-certificate that was issued
  -- 'survey_receipt' — a paid survey's "we have your slip" / "payment confirmed"
  type TEXT NOT NULL CHECK(type IN ('booking_success','reminder','otp','password_reset','welcome','broadcast','certificate','survey_receipt')),
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT,
  status TEXT NOT NULL CHECK(status IN ('sent','failed')),
  provider_message_id TEXT,
  provider_detail TEXT,
  sent_by INTEGER,
  broadcast_id INTEGER,
  -- Which registration this receipt belongs to. Null for every other type.
  survey_submission_id INTEGER,
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

CREATE INDEX idx_email_logs_booking   ON Email_Logs(booking_id, type);
CREATE INDEX idx_email_logs_course    ON Email_Logs(course_id, type, created_at);
CREATE INDEX idx_email_logs_email     ON Email_Logs(email, created_at);
CREATE INDEX idx_email_logs_created   ON Email_Logs(created_at);
CREATE INDEX idx_email_logs_broadcast ON Email_Logs(broadcast_id);
CREATE INDEX idx_email_logs_survey    ON Email_Logs(survey_submission_id);

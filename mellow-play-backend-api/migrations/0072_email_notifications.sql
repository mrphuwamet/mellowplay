-- Email confirmation alongside SMS, mirroring the per-course columns added in
-- 0067_sms_notifications.sql.
--
-- Two independent flags rather than one "channel" column: a course can send
-- both, or neither, and the SMS side keeps working untouched if email is never
-- turned on.
ALTER TABLE Courses ADD COLUMN email_success_enabled INTEGER DEFAULT 0;
ALTER TABLE Courses ADD COLUMN email_success_subject TEXT;
ALTER TABLE Courses ADD COLUMN email_success_template TEXT;

-- A separate table instead of widening Sms_Logs: that table declares
-- `phone TEXT NOT NULL` and CHECK(type IN (...)), and SQLite/D1 can alter
-- neither without rebuilding the table and copying every row.
--
-- booking_id is nullable here (Sms_Logs requires it) because account-signup
-- and password-reset codes are sent with no booking to attach them to.
--
-- body_html is nullable and deliberately left NULL for the 'otp' and
-- 'password_reset' types — those bodies contain a live one-time code, and a
-- log table is the wrong place to keep one.
CREATE TABLE Email_Logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER,
  course_id INTEGER,
  type TEXT NOT NULL CHECK(type IN ('booking_success','reminder','otp','password_reset')),
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT,
  status TEXT NOT NULL CHECK(status IN ('sent','failed')),
  provider_message_id TEXT,
  provider_detail TEXT,
  sent_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_email_logs_booking ON Email_Logs(booking_id, type);
CREATE INDEX idx_email_logs_course ON Email_Logs(course_id, type, created_at);
CREATE INDEX idx_email_logs_email ON Email_Logs(email, created_at);

-- Users.email is user-typed and has never been verified (only phone has
-- phone_verified), so today a hard bounce is indistinguishable from a typo.
-- Cloudflare scales the account's daily send quota on deliverability, which
-- makes bounces cost real sending capacity — this column lets the signup
-- email-OTP flow record that an address actually received mail.
ALTER TABLE Users ADD COLUMN email_verified INTEGER DEFAULT 0;

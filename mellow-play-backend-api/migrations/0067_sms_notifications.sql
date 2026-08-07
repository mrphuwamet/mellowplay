-- Per-course SMS on booking success, plus a log table backing manual
-- advance-reminder sends and retroactive resend of confirmations that never
-- went out (or failed) at booking time.
ALTER TABLE Courses ADD COLUMN sms_success_enabled INTEGER DEFAULT 0;
ALTER TABLE Courses ADD COLUMN sms_success_template TEXT;
ALTER TABLE Courses ADD COLUMN sms_reminder_template TEXT;

CREATE TABLE Sms_Logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  course_id INTEGER,
  type TEXT NOT NULL CHECK(type IN ('booking_success','reminder')),
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sent','failed')),
  provider_detail TEXT,
  sent_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_sms_logs_booking ON Sms_Logs(booking_id, type);
CREATE INDEX idx_sms_logs_course ON Sms_Logs(course_id, type, created_at);

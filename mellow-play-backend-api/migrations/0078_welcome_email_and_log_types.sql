-- Two new kinds of mail — a welcome message on signup, and marketing
-- broadcasts — plus the settings the welcome mail is authored in.
--
-- Email_Logs.type and Sms_Logs.type are CHECK constraints, and SQLite cannot
-- alter a CHECK in place: the only way is to rebuild the table and copy the
-- rows. Both tables are rebuilt below. Neither is referenced by a foreign key
-- from anywhere else and neither declares one itself, so the rebuild is a
-- straight copy with no ordering hazard.

-- ── Email_Logs ───────────────────────────────────────────────────────────────
CREATE TABLE Email_Logs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER,
  course_id INTEGER,
  -- 'welcome'   — sent once when an account is created
  -- 'broadcast' — a marketing send from the CRM's broadcast screen
  type TEXT NOT NULL CHECK(type IN ('booking_success','reminder','otp','password_reset','welcome','broadcast')),
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
INSERT INTO Email_Logs_new (id, booking_id, course_id, type, email, subject, body_html, status, provider_message_id, provider_detail, sent_by, created_at)
  SELECT id, booking_id, course_id, type, email, subject, body_html, status, provider_message_id, provider_detail, sent_by, created_at FROM Email_Logs;
DROP TABLE Email_Logs;
ALTER TABLE Email_Logs_new RENAME TO Email_Logs;
CREATE INDEX idx_email_logs_booking ON Email_Logs(booking_id, type);
CREATE INDEX idx_email_logs_course ON Email_Logs(course_id, type, created_at);
CREATE INDEX idx_email_logs_email ON Email_Logs(email, created_at);
CREATE INDEX idx_email_logs_created ON Email_Logs(created_at);
CREATE INDEX idx_email_logs_broadcast ON Email_Logs(broadcast_id);

-- ── Sms_Logs ─────────────────────────────────────────────────────────────────
-- booking_id becomes nullable for the same reason Email_Logs' already is: a
-- broadcast has no booking to hang off.
CREATE TABLE Sms_Logs_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER,
  course_id INTEGER,
  type TEXT NOT NULL CHECK(type IN ('booking_success','reminder','broadcast')),
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sent','failed')),
  provider_detail TEXT,
  sent_by INTEGER,
  broadcast_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO Sms_Logs_new (id, booking_id, course_id, type, phone, message, status, provider_detail, sent_by, created_at)
  SELECT id, booking_id, course_id, type, phone, message, status, provider_detail, sent_by, created_at FROM Sms_Logs;
DROP TABLE Sms_Logs;
ALTER TABLE Sms_Logs_new RENAME TO Sms_Logs;
CREATE INDEX idx_sms_logs_booking ON Sms_Logs(booking_id, type);
CREATE INDEX idx_sms_logs_course ON Sms_Logs(course_id, type, created_at);
CREATE INDEX idx_sms_logs_created ON Sms_Logs(created_at);
CREATE INDEX idx_sms_logs_broadcast ON Sms_Logs(broadcast_id);

-- ── Welcome email settings ───────────────────────────────────────────────────
-- Off by default: turning it on starts mailing every new signup, which is the
-- kind of thing that should be a deliberate act after someone has written the
-- body and sent themselves a test.
INSERT OR IGNORE INTO System_Settings (key, value, description) VALUES
  ('welcome_email_enabled', '0', 'ส่งอีเมลต้อนรับเมื่อสมัครสมาชิก'),
  ('welcome_email_subject', 'ยินดีต้อนรับสู่ Mellow Play', 'หัวเรื่องอีเมลต้อนรับ'),
  ('welcome_email_template',
   '<p>สวัสดีคุณ {{name}}</p><p>ยินดีต้อนรับสู่ Mellow Play — บัญชีของคุณพร้อมใช้งานแล้ว</p><p>เริ่มต้นได้เลยที่แอปของเรา</p>',
   'เนื้อหาอีเมลต้อนรับ (HTML, ใช้ตัวแปร {{name}} {{email}} {{phone}})');

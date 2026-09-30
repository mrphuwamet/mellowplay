-- Consent documents, and every version of them ever published.
--
-- Consent was being collected as a checkbox labelled "รับทราบ". That records
-- that a box was ticked and nothing else: not what was agreed to, not which
-- wording was on screen at the time. The moment the wording is edited, every
-- consent already collected becomes unprovable — the text someone agreed to no
-- longer exists anywhere.
--
-- So a document is split in two. Consent_Documents is the current wording,
-- which staff edit freely. Consent_Document_Versions is the archive: one
-- immutable row per published version, never updated and never deleted. A
-- consent answer records the version number it was given against, so the exact
-- words a parent read can be produced years later.
--
-- Separate documents rather than one long policy, because PDPA consent is per
-- purpose: agreeing to be filmed is not agreeing to have a phone number kept,
-- and bundling the two into one tick is the thing the law is pointed at.
-- Filming is also optional in a way registration data is not, which is why
-- each document carries its own is_required_default.
CREATE TABLE IF NOT EXISTS Consent_Documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Stable slug. Forms and the public page address a document by this, so
  -- renaming the title never breaks a form that points at it.
  doc_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  -- The one line shown beside the tick box. The full text is a tap away; this
  -- is what someone reads if they read nothing else, so it has to say what is
  -- being agreed to on its own.
  summary TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  -- Bumped when summary or body_html changes, and only then. A new version
  -- means "this is different from what people already agreed to", so a title
  -- tidied up or a reorder must not raise it — inflating the number would ask
  -- families to consent again to wording that never changed.
  version INTEGER NOT NULL DEFAULT 1,
  -- Whether staff may still attach this to a form. Retiring a document must
  -- not delete it: forms already submitted point at its versions.
  is_active INTEGER NOT NULL DEFAULT 1,
  -- Whether it appears on the public policy page. A document can be used in a
  -- form without being published as a standing policy, and the privacy notice
  -- is published without being a tick box anywhere.
  show_on_policy_page INTEGER NOT NULL DEFAULT 1,
  -- Ticking it is a condition of submitting the form. Defaults off: consent
  -- that cannot be refused is not consent, and only the documents describing
  -- data the service genuinely cannot run without should ever set this.
  is_required_default INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- The archive. Written on publish, never updated. This is the table that
-- answers "what exactly did this family agree to, on this date".
CREATE TABLE IF NOT EXISTS Consent_Document_Versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES Consent_Documents(id),
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Who published it, for the same reason the version exists at all.
  published_by_crm_user_id INTEGER REFERENCES CRM_Users(id),
  UNIQUE(document_id, version)
);
CREATE INDEX IF NOT EXISTS idx_consent_versions_doc
  ON Consent_Document_Versions(document_id, version);

-- Two starter documents, as drafts of the wording rather than as legal text:
-- they are marked with a line saying so, because wording that has not been
-- read by whoever is accountable for it should not be able to reach a parent
-- by accident.
INSERT OR IGNORE INTO Consent_Documents
  (doc_key, title, summary, body_html, version, is_active, show_on_policy_page, is_required_default, display_order)
VALUES
  ('personal-data',
   'การเก็บและใช้ข้อมูลส่วนบุคคล',
   'ข้าพเจ้ายินยอมให้ Mellow Play เก็บและใช้ข้อมูลส่วนบุคคลของข้าพเจ้าและบุตรหลาน เพื่อการลงทะเบียนและการติดต่อเกี่ยวกับกิจกรรม',
   '<p><strong>ร่างข้อความ — โปรดให้ผู้รับผิดชอบตรวจสอบก่อนใช้งานจริง</strong></p><p>Mellow Play เก็บรวบรวมข้อมูลส่วนบุคคลของท่านและบุตรหลาน ได้แก่ ชื่อ-นามสกุล วันเกิด เบอร์โทรศัพท์ และอีเมล เพื่อวัตถุประสงค์ดังนี้</p><ul><li>ลงทะเบียนและยืนยันการเข้าร่วมคลาสเรียนและกิจกรรม</li><li>ติดต่อกลับเรื่องการจอง การเปลี่ยนแปลงรอบ และเรื่องเร่งด่วนระหว่างกิจกรรม</li><li>ออกเกียรติบัตรและบันทึกพัฒนาการของผู้เข้าร่วม</li></ul><p>ข้อมูลจะถูกเก็บไว้ตลอดระยะเวลาที่ท่านเป็นสมาชิก และลบเมื่อท่านขอให้ลบ ท่านมีสิทธิขอเข้าถึง แก้ไข หรือถอนความยินยอมได้ตลอดเวลา โดยติดต่อเจ้าหน้าที่</p>',
   1, 1, 1, 1, 1),
  ('photography',
   'การถ่ายภาพ บันทึกวีดิทัศน์ และการเผยแพร่',
   'ข้าพเจ้ายินยอมให้บันทึกภาพนิ่งและภาพเคลื่อนไหวของบุตรหลานระหว่างกิจกรรม และนำไปเผยแพร่เพื่อประชาสัมพันธ์',
   '<p><strong>ร่างข้อความ — โปรดให้ผู้รับผิดชอบตรวจสอบก่อนใช้งานจริง</strong></p><p>ระหว่างกิจกรรม อาจมีการบันทึกภาพนิ่งและภาพเคลื่อนไหวซึ่งปรากฏภาพของบุตรหลานของท่าน โดยอาจนำไปใช้เพื่อ</p><ul><li>เผยแพร่ในอัลบั้มภาพกิจกรรมสำหรับครอบครัวที่เข้าร่วม</li><li>ประชาสัมพันธ์กิจกรรมผ่านช่องทางออนไลน์ของ Mellow Play</li><li>ออกอากาศในรายการโทรทัศน์ที่ร่วมผลิต (หากมี จะแจ้งชื่อรายการก่อนถ่ายทำ)</li></ul><p><strong>ความยินยอมนี้ไม่บังคับ</strong> ท่านเข้าร่วมกิจกรรมได้ตามปกติแม้ไม่ยินยอม และถอนความยินยอมได้ภายหลังโดยติดต่อเจ้าหน้าที่ ภาพที่เผยแพร่ไปแล้วจะถูกนำออกเท่าที่ทำได้</p>',
   1, 1, 1, 0, 2);

-- Version 1 of each, so the archive is complete from the start rather than
-- beginning at whatever the first edit happens to be.
INSERT OR IGNORE INTO Consent_Document_Versions (document_id, version, title, summary, body_html)
  SELECT id, version, title, summary, body_html FROM Consent_Documents;

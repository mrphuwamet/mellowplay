-- E-certificates: a design library, and a record of who was given what.
--
-- Applied by hand (never `d1 migrations apply` — d1_migrations is stale at
-- 0066):
--   npx wrangler d1 execute mellow_play_db_dev --remote --file migrations/0098_certificates.sql
--   npx wrangler d1 execute mellow_play_db     --remote --file migrations/0098_certificates.sql

-- ── The design ─────────────────────────────────────────────────────────────
-- The layout is JSON, not code, so changing a certificate never means a deploy
-- — the same reason heat positions and stamp designs are data.
--
-- Field coordinates are stored as PERCENTAGES of the page, not millimetres: the
-- same layout then prints correctly at A4, A5 or anything else, and the design
-- canvas can be any size on screen without a conversion step that has to agree
-- in two places.
CREATE TABLE IF NOT EXISTS Certificate_Templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  background_url TEXT,
  -- Millimetres, for the print stylesheet's @page rule.
  page_width REAL NOT NULL DEFAULT 297,
  page_height REAL NOT NULL DEFAULT 210,
  fields_json TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Which design a course (or one specific round) uses. Same generic shape as
-- Stamp_Design_Bindings, so a new binding level later costs a row rather than
-- a schema change.
CREATE TABLE IF NOT EXISTS Certificate_Template_Bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL,            -- 'course' | 'calendar'
  ref_id INTEGER NOT NULL,
  template_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES Certificate_Templates(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cert_binding_scope
  ON Certificate_Template_Bindings(scope, ref_id);

-- ── The issued certificate ─────────────────────────────────────────────────
-- recipient_name, course_name and event_date are SNAPSHOTS, copied at issue
-- time rather than joined live. Correcting a child's nickname six months from
-- now must not rewrite a certificate already in a family's hands — the same
-- principle as a stamp freezing its design and a bracket entry freezing its
-- label.
--
-- template_id is kept for reprinting, but the words on the page do not depend
-- on the template still existing or still saying the same thing.
CREATE TABLE IF NOT EXISTS Certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER,
  booking_id INTEGER,
  child_id INTEGER,
  user_id INTEGER,
  recipient_name TEXT NOT NULL,
  course_name TEXT,
  event_date TEXT,
  -- Human-facing running number, e.g. MP-2026-0001. Printed on the page.
  serial TEXT,
  -- What the QR points at. Random, never sequential: a guessable code turns one
  -- shared certificate into a directory of everyone at the event.
  public_code TEXT NOT NULL,
  issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  issued_by_crm_user_id INTEGER,
  revoked_at DATETIME,
  revoke_reason TEXT,
  FOREIGN KEY (template_id) REFERENCES Certificate_Templates(id) ON DELETE SET NULL,
  FOREIGN KEY (booking_id) REFERENCES Bookings(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_public_code
  ON Certificates(public_code);

-- One live certificate per booking, which is what makes "issue for this whole
-- round" safe to press twice. A revoked one steps aside so a corrected
-- certificate can be issued in its place.
CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_one_per_booking
  ON Certificates(booking_id) WHERE booking_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_certificates_child ON Certificates(child_id);
CREATE INDEX IF NOT EXISTS idx_certificates_user  ON Certificates(user_id);

-- ── A design to start from ────────────────────────────────────────────────
-- Seeded so the feature is usable before anyone uploads artwork: a plain A4
-- landscape with the four fields every certificate has. Percentages, so it
-- lands correctly whatever the page size is set to.
INSERT INTO Certificate_Templates (name, page_width, page_height, fields_json)
SELECT 'เกียรติบัตรมาตรฐาน', 297, 210, '[
  {"id":"t1","type":"text","value":"เกียรติบัตรฉบับนี้ให้ไว้เพื่อแสดงว่า","x":10,"y":30,"w":80,"align":"center","fontSize":18,"fontWeight":400,"color":"#62687d"},
  {"id":"f1","type":"field","value":"recipient_name","x":10,"y":38,"w":80,"align":"center","fontSize":44,"fontWeight":700,"color":"#172038"},
  {"id":"t2","type":"text","value":"ได้เข้าร่วมกิจกรรม","x":10,"y":54,"w":80,"align":"center","fontSize":18,"fontWeight":400,"color":"#62687d"},
  {"id":"f2","type":"field","value":"course_name","x":10,"y":60,"w":80,"align":"center","fontSize":26,"fontWeight":600,"color":"#5b3fd1"},
  {"id":"f3","type":"field","value":"event_date","x":10,"y":72,"w":80,"align":"center","fontSize":15,"fontWeight":400,"color":"#62687d"},
  {"id":"q1","type":"qr","value":"","x":84,"y":80,"w":11,"fontSize":12,"color":"#172038"},
  {"id":"f4","type":"field","value":"serial","x":5,"y":90,"w":30,"align":"left","fontSize":10,"fontWeight":400,"color":"#8d93a6"}
]'
WHERE NOT EXISTS (SELECT 1 FROM Certificate_Templates);

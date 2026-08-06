-- "Invite-only extra capacity" — a round can reserve extra seats that never
-- show up in public availability (Calendar_Slot_Rules.invite_capacity), only
-- reachable by whoever holds a PIN-protected link scoped to that exact
-- course + round. Same token+PIN-hash shape as Checkin_Access_Links
-- (migration 0063), scoped by course_id + calendar_slot_rule_id instead of
-- being global — course_id lets the consumer app deep-link straight into
-- that course's booking flow after the PIN succeeds.
ALTER TABLE Calendar_Slot_Rules ADD COLUMN invite_capacity INTEGER DEFAULT 0;

CREATE TABLE Invite_Access_Links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  label TEXT,
  pin_hash TEXT NOT NULL,
  course_id INTEGER NOT NULL REFERENCES Courses(id),
  calendar_slot_rule_id INTEGER NOT NULL REFERENCES Calendar_Slot_Rules(id),
  expires_at DATETIME,
  is_revoked BOOLEAN DEFAULT 0,
  created_by_crm_user_id INTEGER REFERENCES CRM_Users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_invite_access_links_rule ON Invite_Access_Links(calendar_slot_rule_id);

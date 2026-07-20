-- Calendar types (e.g. "ปฏิทินคลาสเรียน", "ปฏิทินทำผม")
CREATE TABLE IF NOT EXISTS Calendars (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT,
  color       TEXT    DEFAULT '#7c3aed',
  type        TEXT    DEFAULT 'class', -- 'class' | 'service' | 'other'
  branch_id   INTEGER,
  is_active   INTEGER DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id) REFERENCES Branches(id)
);

-- Recurring slot rules per calendar
CREATE TABLE IF NOT EXISTS Calendar_Slot_Rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id   INTEGER NOT NULL,
  day_of_week   INTEGER,  -- 0=Sun … 6=Sat, NULL = specific date only
  specific_date TEXT,     -- YYYY-MM-DD (used when day_of_week IS NULL)
  start_time    TEXT NOT NULL, -- HH:MM
  end_time      TEXT NOT NULL, -- HH:MM
  max_capacity  INTEGER DEFAULT 4,
  valid_from    TEXT NOT NULL, -- YYYY-MM-DD
  valid_until   TEXT,          -- YYYY-MM-DD, NULL = no end
  is_active     INTEGER DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (calendar_id) REFERENCES Calendars(id) ON DELETE CASCADE
);

-- Seed default calendars
INSERT OR IGNORE INTO Calendars (id, name, description, color, type) VALUES
(1, 'ปฏิทินคลาสเรียน', 'สำหรับจองคลาสเรียนทั่วไป', '#7c3aed', 'class'),
(2, 'ปฏิทินบริการ',     'สำหรับจองคิวบริการหน้าร้าน', '#0284c7', 'service');

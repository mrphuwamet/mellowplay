CREATE TABLE IF NOT EXISTS Calendar_Holidays (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id   INTEGER NOT NULL,
  date          TEXT NOT NULL, -- YYYY-MM-DD
  description   TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (calendar_id) REFERENCES Calendars(id) ON DELETE CASCADE
);

-- A label for a whole DAY, not just one round.
--
-- Calendar_Slot_Rules.label already names an individual round ("รอบถ่ายรายการ"),
-- but there was nowhere to say something about the day itself — "วันเปิดรับ
-- รอบพิเศษ", "ปิดรับสมัครวันนี้" — so staff were forced to repeat it on every
-- round of that day, or leave it out entirely.
--
-- Keyed to a specific date rather than a weekday: a day label describes an
-- occasion, and an occasion happens on a date. A rule that repeats every
-- Thursday is a schedule, not an occasion, and already has its own label.
CREATE TABLE Calendar_Day_Labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id INTEGER NOT NULL REFERENCES Calendars(id) ON DELETE CASCADE,
  specific_date TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- One label per day per calendar: two labels on the same date would have no
  -- defined order on screen, and staff would not be able to tell which of the
  -- two they were editing.
  UNIQUE(calendar_id, specific_date)
);
CREATE INDEX idx_calendar_day_labels ON Calendar_Day_Labels(calendar_id, specific_date);

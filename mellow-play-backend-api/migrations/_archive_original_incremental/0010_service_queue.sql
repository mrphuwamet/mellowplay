CREATE TABLE IF NOT EXISTS Service_Queue_Items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  calendar_id    INTEGER,
  service_id     INTEGER,
  service_name   TEXT,
  queue_number   INTEGER NOT NULL,
  slot_date      TEXT    NOT NULL,  -- YYYY-MM-DD
  slot_time      TEXT,              -- HH:MM
  customer_name  TEXT,
  customer_phone TEXT,
  user_id        INTEGER,           -- NULL = guest
  staff_id       INTEGER,           -- assigned staff
  status         TEXT    DEFAULT 'waiting', -- 'waiting' | 'in_service' | 'completed' | 'cancelled'
  notes          TEXT,
  started_at     DATETIME,
  completed_at   DATETIME,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (calendar_id) REFERENCES Calendars(id),
  FOREIGN KEY (service_id)  REFERENCES Services(id),
  FOREIGN KEY (user_id)     REFERENCES Users(id),
  FOREIGN KEY (staff_id)    REFERENCES CRM_Users(id)
);

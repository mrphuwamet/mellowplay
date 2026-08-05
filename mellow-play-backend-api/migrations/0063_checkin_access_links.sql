CREATE TABLE Checkin_Access_Links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  label TEXT,
  pin_hash TEXT NOT NULL,
  expires_at DATETIME,
  is_revoked BOOLEAN DEFAULT 0,
  created_by_crm_user_id INTEGER REFERENCES CRM_Users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

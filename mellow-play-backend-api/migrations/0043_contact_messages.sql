CREATE TABLE Contact_Messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES Users(id),
  category TEXT NOT NULL DEFAULT 'feedback',
  message TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contact_messages_user_id ON Contact_Messages(user_id);

-- Materials required per course session
CREATE TABLE IF NOT EXISTS Course_Materials (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id  INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity   REAL    NOT NULL DEFAULT 1,
  unit       TEXT,
  note       TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id)  REFERENCES Courses(id)  ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES Products(id) ON DELETE CASCADE,
  UNIQUE(course_id, product_id)
);

-- Stock reservation for pending bookings
CREATE TABLE IF NOT EXISTS Stock_Reservations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id  INTEGER NOT NULL UNIQUE,
  product_id  INTEGER NOT NULL,
  quantity    REAL    NOT NULL,
  status      TEXT    DEFAULT 'pending', -- 'pending' | 'deducted' | 'released'
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES Bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES Products(id)
);

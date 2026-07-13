-- POS Orders
CREATE TABLE IF NOT EXISTS Orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number    TEXT    UNIQUE NOT NULL,
  branch_id       INTEGER,
  user_id         INTEGER,      -- NULL = guest
  customer_name   TEXT,
  customer_phone  TEXT,
  subtotal        REAL    DEFAULT 0,
  discount_amount REAL    DEFAULT 0,
  coupon_code     TEXT,
  total           REAL    DEFAULT 0,
  payment_method  TEXT,         -- 'cash' | 'transfer' | 'credit_card' | 'later'
  payment_status  TEXT    DEFAULT 'pending', -- 'pending' | 'paid' | 'cancelled'
  notes           TEXT,
  created_by      INTEGER,      -- CRM_Users.id
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id)  REFERENCES Branches(id),
  FOREIGN KEY (user_id)    REFERENCES Users(id),
  FOREIGN KEY (created_by) REFERENCES CRM_Users(id)
);

-- Order line items
CREATE TABLE IF NOT EXISTS Order_Items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL,
  item_type       TEXT    NOT NULL, -- 'class' | 'service' | 'product' | 'package'
  item_id         INTEGER,
  item_name       TEXT    NOT NULL,
  unit_price      REAL    NOT NULL,
  quantity        INTEGER DEFAULT 1,
  discount_amount REAL    DEFAULT 0,
  total           REAL    NOT NULL,
  meta_json       TEXT,             -- { booking_id, queue_id, ... }
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES Orders(id) ON DELETE CASCADE
);

-- Update Bookings: add calendar + payment fields
ALTER TABLE Bookings ADD COLUMN calendar_id     INTEGER;
ALTER TABLE Bookings ADD COLUMN slot_date       TEXT;
ALTER TABLE Bookings ADD COLUMN slot_start_time TEXT;
ALTER TABLE Bookings ADD COLUMN payment_status  TEXT DEFAULT 'prepaid';
ALTER TABLE Bookings ADD COLUMN order_id        INTEGER;
ALTER TABLE Bookings ADD COLUMN notes           TEXT;

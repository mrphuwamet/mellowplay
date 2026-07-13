-- ─── Packages ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Packages (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  name                     TEXT    NOT NULL,
  description              TEXT,
  price                    REAL    NOT NULL DEFAULT 0,
  coupons_json             TEXT    DEFAULT '[]',
  premium_days             INTEGER DEFAULT 0,
  seller_commission_type   TEXT    DEFAULT 'percent',
  seller_commission_value  REAL    DEFAULT 0,
  active                   INTEGER DEFAULT 1,
  created_at               DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Campaign Bonuses ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Campaign_Bonuses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  description   TEXT,
  type          TEXT    NOT NULL,  -- 'sales' | 'teaching_hours'
  target_value  REAL    NOT NULL DEFAULT 0,
  bonus_type    TEXT    NOT NULL DEFAULT 'fixed',  -- 'fixed' | 'percent'
  bonus_value   REAL    NOT NULL DEFAULT 0,
  month         INTEGER NOT NULL,
  year          INTEGER NOT NULL,
  for_roles_json TEXT   DEFAULT '[]',
  status        TEXT    DEFAULT 'active',  -- 'draft' | 'active' | 'ended'
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Diligence Rules ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Diligence_Rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  description     TEXT,
  conditions_json TEXT    DEFAULT '[]',
  bonus_amount    REAL    NOT NULL DEFAULT 0,
  for_roles_json  TEXT    DEFAULT '[]',
  active          INTEGER DEFAULT 1,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Service Categories ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Service_Categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  color      TEXT DEFAULT '#7452d6',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Services ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Services (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL,
  category_id       INTEGER,
  description       TEXT,
  price             REAL    NOT NULL DEFAULT 0,
  duration_min      INTEGER DEFAULT 30,
  commission_type   TEXT    DEFAULT 'percent',
  commission_value  TEXT    DEFAULT '',
  active            INTEGER DEFAULT 1,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES Service_Categories(id)
);

-- ─── Product Categories ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Product_Categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  color      TEXT DEFAULT '#7452d6',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Products ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sku           TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  category_id   INTEGER,
  description   TEXT,
  sell_price    REAL    NOT NULL DEFAULT 0,
  cost_price    REAL    NOT NULL DEFAULT 0,
  unit          TEXT    DEFAULT 'ชิ้น',
  min_stock     INTEGER DEFAULT 5,
  current_stock INTEGER DEFAULT 0,
  active        INTEGER DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES Product_Categories(id)
);

-- ─── Stock Transactions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Stock_Transactions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id   INTEGER NOT NULL,
  type         TEXT    NOT NULL,  -- 'in' | 'out' | 'adjust'
  qty          INTEGER NOT NULL,
  qty_after    INTEGER NOT NULL,
  note         TEXT,
  date         TEXT    NOT NULL,
  staff_id     INTEGER,
  staff_name   TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES Products(id)
);

-- ─── Attendance Records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Attendance_Records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  crm_user_id INTEGER NOT NULL,
  date        TEXT    NOT NULL,
  check_in    TEXT,
  check_out   TEXT,
  note        TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(crm_user_id, date),
  FOREIGN KEY (crm_user_id) REFERENCES CRM_Users(id)
);

-- ─── Leave Requests ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Leave_Requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  crm_user_id    INTEGER NOT NULL,
  type           TEXT    NOT NULL,  -- 'annual' | 'sick' | 'personal'
  start_date     TEXT    NOT NULL,
  end_date       TEXT    NOT NULL,
  days           INTEGER NOT NULL DEFAULT 1,
  reason         TEXT,
  status         TEXT    DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  approver_note  TEXT,
  is_paid        INTEGER DEFAULT 0,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (crm_user_id) REFERENCES CRM_Users(id)
);

-- ─── Leave Policies ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Leave_Policies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_type TEXT    NOT NULL UNIQUE,  -- 'monthly' | 'daily'
  annual_days   INTEGER DEFAULT 10,
  sick_days     INTEGER DEFAULT 30,
  personal_days INTEGER DEFAULT 3,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default leave policies
INSERT OR IGNORE INTO Leave_Policies (employee_type, annual_days, sick_days, personal_days)
VALUES ('monthly', 10, 30, 3);

INSERT OR IGNORE INTO Leave_Policies (employee_type, annual_days, sick_days, personal_days)
VALUES ('daily', 6, 30, 3);

-- Seed default service categories
INSERT OR IGNORE INTO Service_Categories (id, name, color) VALUES (1, 'ตัดผม / เสริมสวย', '#7c3aed');
INSERT OR IGNORE INTO Service_Categories (id, name, color) VALUES (2, 'นวดและผ่อนคลาย',   '#0284c7');
INSERT OR IGNORE INTO Service_Categories (id, name, color) VALUES (3, 'ดูแลผิวพรรณ',       '#059669');
INSERT OR IGNORE INTO Service_Categories (id, name, color) VALUES (4, 'อื่นๆ',             '#9ca3af');

-- Seed default product categories
INSERT OR IGNORE INTO Product_Categories (id, name, color) VALUES (1, 'ผลิตภัณฑ์เส้นผม', '#7c3aed');
INSERT OR IGNORE INTO Product_Categories (id, name, color) VALUES (2, 'ผลิตภัณฑ์ผิว',    '#0284c7');
INSERT OR IGNORE INTO Product_Categories (id, name, color) VALUES (3, 'อุปกรณ์ช่าง',      '#059669');
INSERT OR IGNORE INTO Product_Categories (id, name, color) VALUES (4, 'ของใช้ทั่วไป',     '#9ca3af');

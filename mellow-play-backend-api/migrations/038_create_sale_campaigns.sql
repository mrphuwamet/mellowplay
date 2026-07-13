CREATE TABLE Sale_Campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    discount_amount REAL DEFAULT 0,
    discount_percent REAL DEFAULT 0,
    valid_from DATETIME,
    valid_until DATETIME,
    applicable_course_ids JSON DEFAULT '[]',
    applicable_service_ids JSON DEFAULT '[]',
    consumer_label TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

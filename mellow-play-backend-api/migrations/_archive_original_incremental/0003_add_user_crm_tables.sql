-- Migration 003: Add CRM children and user coupons tables
-- Run: wrangler d1 execute <DB_NAME> --file=migrations/003_add_user_crm_tables.sql

CREATE TABLE IF NOT EXISTS User_CRM_Children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    nickname TEXT,
    gender TEXT,
    date_of_birth DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS User_Coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type_id TEXT NOT NULL,
    label TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    expires_at DATE NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

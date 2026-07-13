CREATE TABLE IF NOT EXISTS Expense_Advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crm_user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (crm_user_id) REFERENCES CRM_Users(id)
);

CREATE TABLE IF NOT EXISTS Payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crm_user_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    incentive REAL DEFAULT 0,
    ot_hours REAL DEFAULT 0,
    ot_rate REAL DEFAULT 150,
    expense REAL DEFAULT 0,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    paid_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (crm_user_id) REFERENCES CRM_Users(id)
);

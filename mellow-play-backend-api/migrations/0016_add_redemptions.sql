CREATE TABLE Redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    reward_name TEXT NOT NULL,
    stamp_cost INTEGER NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'claimed'
    claim_code TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    claimed_at DATETIME,
    FOREIGN KEY (child_id) REFERENCES Children(id)
);

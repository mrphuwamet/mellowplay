-- Seed Data (Minimal) for Mellow Play Application

-- 1. Branches
INSERT OR IGNORE INTO Branches (id, name, location, default_capacity) VALUES
(1, 'Mellow Play x Milk at Central Chidlom', 'ชั้น 5 โซนเด็ก, Central Chidlom', 4);

-- 2. CRM Users
INSERT OR IGNORE INTO CRM_Users (id, email, password_hash, full_name, role, branch_id) VALUES
(1, 'admin@mellowplay.co', 'c775e7b757ede630cd0aa1113bd102661ab38829ca52a6422ab782862f268646', 'Super Admin', 'super_admin', NULL);

-- Seed Data (Minimal) for Mellow Play Application

-- 1. Branches
INSERT OR IGNORE INTO Branches (id, name, location, default_capacity) VALUES
(1, 'Mellow Play x Milk at Central Chidlom', 'ชั้น 5 โซนเด็ก, Central Chidlom', 4);

-- 2. CRM Users
-- อีเมล: admin@mellowplay.co
-- รหัสผ่าน: password123
--
-- The hash below is SHA-256 of exactly the password documented above, which is
-- what AuthService.verifyPassword computes. The value that used to be here
-- (c775e7b7...) was not the hash of 'password123', so seeding a fresh or local
-- database produced an account nobody could log into — the documented password
-- was rejected and the real one was unknown.
--
-- Changing this file cannot affect an already-seeded database: every statement
-- is INSERT OR IGNORE, so an existing CRM_Users row with id 1 is left alone.
--
-- NOTE: migrations/0001_init.sql:1031 inserts this same row (with the old,
-- unusable hash). On any database built by running migrations — which is every
-- database — that insert happens first and this one is ignored. Fixing the
-- credential there is a separate decision: see the discussion of why a
-- password-resetting migration must not be added, since it would also run
-- against production.
INSERT OR IGNORE INTO CRM_Users (id, email, password_hash, full_name, role, branch_id) VALUES
(1, 'admin@mellowplay.co', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Super Admin', 'super_admin', NULL);

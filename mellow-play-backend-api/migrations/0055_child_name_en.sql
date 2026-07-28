-- Child registration/CRM now collects an English name alongside the Thai
-- one, mirroring Users.first_name_en/last_name_en (migration 0054). Nullable,
-- no backfill — existing children are left blank and filled in later by the
-- parent (consumer Settings) or staff (CRM UserManagement).
ALTER TABLE HD_Profiles ADD COLUMN name_en TEXT;
ALTER TABLE User_CRM_Children ADD COLUMN full_name_en TEXT;

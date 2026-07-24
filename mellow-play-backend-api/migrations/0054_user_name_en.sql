-- Parent registration now collects an English name alongside the Thai one
-- (Users.first_name/last_name are Thai). Nullable, no backfill for existing
-- rows — per 2026-07-24 product decision, existing users are left blank and
-- fill it in later themselves (consumer Settings) or have staff fill it in
-- (CRM UserManagement).
ALTER TABLE Users ADD COLUMN first_name_en TEXT;
ALTER TABLE Users ADD COLUMN last_name_en TEXT;

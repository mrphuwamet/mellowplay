-- CRM-driven account ban — a staff action that blocks a consumer account
-- from logging in and, for an already-issued (30-day) JWT, from using any
-- profiles/journey endpoint until unbanned.
ALTER TABLE Users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Users ADD COLUMN banned_at DATETIME;
ALTER TABLE Users ADD COLUMN ban_reason TEXT;

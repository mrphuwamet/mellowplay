-- Add new fields to Users
ALTER TABLE Users ADD COLUMN line_id TEXT;
ALTER TABLE Users ADD COLUMN pdpa_consent BOOLEAN DEFAULT 0;
ALTER TABLE Users ADD COLUMN marketing_consent BOOLEAN DEFAULT 0;

-- Add new fields to HD_Profiles
ALTER TABLE HD_Profiles ADD COLUMN nickname TEXT;
ALTER TABLE HD_Profiles ADD COLUMN gender TEXT;

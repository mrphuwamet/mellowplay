-- Migration 001: Add single-tier course fields
-- Run: wrangler d1 execute <DB_NAME> --file=migrations/001_add_single_tier_course_fields.sql

ALTER TABLE Courses ADD COLUMN description_en TEXT;
ALTER TABLE Courses ADD COLUMN age_min REAL DEFAULT 3;
ALTER TABLE Courses ADD COLUMN age_max REAL DEFAULT 9;
ALTER TABLE Courses ADD COLUMN duration TEXT DEFAULT '01:00';
ALTER TABLE Courses ADD COLUMN original_price REAL DEFAULT 0;
ALTER TABLE Courses ADD COLUMN premium_price REAL DEFAULT 0;
ALTER TABLE Courses ADD COLUMN coupon_count INTEGER DEFAULT 1;
ALTER TABLE Courses ADD COLUMN achievement_skills_json TEXT;
ALTER TABLE Courses ADD COLUMN metrics_json TEXT;

-- Back-fill new columns from legacy data where available
UPDATE Courses SET
  original_price   = COALESCE(original_price_little_junior, original_price_junior, 0),
  premium_price    = COALESCE(premium_price_little_junior, premium_price_junior, 0),
  coupon_count     = COALESCE(coupon_little_junior, coupon_junior, 1),
  duration         = COALESCE(duration_little_junior, duration_junior, '01:00'),
  achievement_skills_json = COALESCE(achievement_skills_little_junior_json, achievement_skills_junior_json),
  metrics_json     = COALESCE(metrics_little_junior_json, metrics_junior_json),
  age_min          = CASE WHEN is_little_junior_enabled = 1 THEN 3 ELSE 6 END,
  age_max          = CASE WHEN is_junior_enabled = 1 THEN 9 ELSE 5 END
WHERE original_price IS NULL OR original_price = 0;

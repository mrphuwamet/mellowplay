-- Migration 004: Ensure all single-tier course columns exist
-- Safe to run even if migrations 001-002 were already applied.
-- Requires SQLite 3.37+ (D1 uses 3.44+) for ADD COLUMN IF NOT EXISTS.

-- From migration 001
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS description_en TEXT;
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS age_min REAL DEFAULT 3;
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS age_max REAL DEFAULT 9;
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS duration TEXT DEFAULT '01:00';
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS original_price REAL DEFAULT 0;
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS premium_price REAL DEFAULT 0;
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS coupon_count INTEGER DEFAULT 1;
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS achievement_skills_json TEXT;
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS metrics_json TEXT;

-- From migration 002
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS coupon_requirements_json TEXT;

-- Other columns referenced in INSERT/UPDATE queries
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS name_en TEXT;
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS images_json TEXT;
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE Courses ADD COLUMN IF NOT EXISTS teacher_guide_url TEXT;

-- Back-fill duration and prices for rows that have legacy data but empty new fields
UPDATE Courses SET
  duration     = COALESCE(NULLIF(duration, ''), duration_little_junior, duration_junior, '01:00'),
  original_price  = COALESCE(NULLIF(original_price, 0), original_price_little_junior, original_price_junior, 0),
  premium_price   = COALESCE(NULLIF(premium_price, 0), premium_price_little_junior, premium_price_junior, 0),
  coupon_count    = COALESCE(NULLIF(coupon_count, 0), coupon_little_junior, coupon_junior, 1),
  age_min      = COALESCE(NULLIF(age_min, 0), CASE WHEN is_little_junior_enabled = 1 THEN 3 ELSE 6 END),
  age_max      = COALESCE(NULLIF(age_max, 0), CASE WHEN is_junior_enabled = 1 THEN 9 ELSE 5 END)
WHERE duration IS NULL OR duration = '' OR original_price IS NULL OR original_price = 0;

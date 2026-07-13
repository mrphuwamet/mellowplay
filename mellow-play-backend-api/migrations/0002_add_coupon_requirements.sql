-- Migration 002: Add multi-type coupon requirements
-- Run: wrangler d1 execute <DB_NAME> --file=migrations/002_add_coupon_requirements.sql

ALTER TABLE Courses ADD COLUMN coupon_requirements_json TEXT;

-- Back-fill: convert existing coupon_count → blue coupon requirement
UPDATE Courses
SET coupon_requirements_json = json_array(
  json_object('typeId', 'blue', 'label', 'คูปองสีฟ้า', 'count', COALESCE(coupon_count, 1))
)
WHERE coupon_requirements_json IS NULL AND COALESCE(coupon_count, 0) > 0;

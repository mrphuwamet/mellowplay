-- Migration 029: Map string coupon types to dynamic CouponTypes

-- 1. Insert missing CouponTypes for 'blue', 'yellow', 'red' if they don't exist.
-- We will assign them new IDs safely.
INSERT INTO CouponTypes (id, name, color) 
SELECT 3, 'คูปองสีฟ้า', '#2196f3' 
WHERE NOT EXISTS (SELECT 1 FROM CouponTypes WHERE id = 3);

INSERT INTO CouponTypes (id, name, color) 
SELECT 4, 'คูปองสีเหลือง', '#ffb300' 
WHERE NOT EXISTS (SELECT 1 FROM CouponTypes WHERE id = 4);

INSERT INTO CouponTypes (id, name, color) 
SELECT 5, 'คูปองสีแดง', '#f44336' 
WHERE NOT EXISTS (SELECT 1 FROM CouponTypes WHERE id = 5);

-- 2. Update existing User_Coupons to point to these new IDs.
-- Note: User_Coupons.type_id was TEXT, we will update it to store the numeric ID as a string,
-- or we can just update the string value to '3', '4', '5'.
UPDATE User_Coupons SET type_id = '3' WHERE type_id = 'blue';
UPDATE User_Coupons SET type_id = '4' WHERE type_id = 'yellow';
UPDATE User_Coupons SET type_id = '5' WHERE type_id = 'red';

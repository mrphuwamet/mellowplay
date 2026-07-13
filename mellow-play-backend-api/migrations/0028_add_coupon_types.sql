-- Migration 028: Add dynamic coupon system
-- Run: wrangler d1 execute <DB_NAME> --file=migrations/028_add_coupon_types.sql

-- 1. Create CouponTypes table
CREATE TABLE IF NOT EXISTS CouponTypes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#A78BFA',
    icon_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create ChildCoupons table to track how many of each coupon a child has
CREATE TABLE IF NOT EXISTS ChildCoupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    coupon_type_id INTEGER NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (child_id) REFERENCES Children(id) ON DELETE CASCADE,
    FOREIGN KEY (coupon_type_id) REFERENCES CouponTypes(id) ON DELETE CASCADE,
    UNIQUE(child_id, coupon_type_id)
);

-- 3. Create CourseCoupons table to link courses with accepted coupons
CREATE TABLE IF NOT EXISTS CourseCoupons (
    course_id INTEGER NOT NULL,
    coupon_type_id INTEGER NOT NULL,
    quantity_required INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (course_id, coupon_type_id),
    FOREIGN KEY (course_id) REFERENCES Courses(id) ON DELETE CASCADE,
    FOREIGN KEY (coupon_type_id) REFERENCES CouponTypes(id) ON DELETE CASCADE
);

-- 4. Insert default coupon types to migrate existing balances
INSERT INTO CouponTypes (id, name, color) VALUES (1, 'Junior Coupon', '#3B82F6');
INSERT INTO CouponTypes (id, name, color) VALUES (2, 'Little Junior Coupon', '#10B981');

-- 5. Migrate existing balances (assuming Member_Coupons table has junior_balance and little_junior_balance)
INSERT INTO ChildCoupons (child_id, coupon_type_id, balance)
SELECT child_id, 1, junior_balance
FROM Member_Coupons WHERE junior_balance > 0;

INSERT INTO ChildCoupons (child_id, coupon_type_id, balance)
SELECT child_id, 2, little_junior_balance
FROM Member_Coupons WHERE little_junior_balance > 0;

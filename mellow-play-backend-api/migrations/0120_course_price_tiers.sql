-- Per-seat pricing for one booking: "first person 500, everyone after 350".
--
-- A table rather than columns on Courses, for two reasons. Courses already
-- carries original_price/premium_price three times over (plain, little_junior,
-- junior) and a per-seat column set would multiply that again. And a ladder
-- grows: "third child free" is one more row here and a schema change there.
--
-- This is NOT a discount and deliberately does not live in Sale_Campaigns.
-- 350 is the regular price of a second seat, it has no end date, and it must
-- still stack with a real campaign or promo code rather than compete with the
-- single best-campaign pick in createBooking.
CREATE TABLE IF NOT EXISTS Course_Price_Tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    -- NULL means the tier applies whatever age bracket the booking is for;
    -- a value ('little_junior' / 'junior') narrows it to that bracket, the
    -- same way Courses holds a separate price per bracket.
    age_group TEXT,
    -- The seat this price starts applying at, 1-based. Rows are read as a
    -- ladder: from_seat 1 -> 500 and from_seat 2 -> 350 means seat 1 costs
    -- 500 and every seat from the second onwards costs 350.
    from_seat INTEGER NOT NULL,
    price REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES Courses(id)
);

-- One price per (course, bracket, seat): a second row for the same seat would
-- make the ladder ambiguous, and an ambiguous price is the one thing this
-- table must never produce.
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_price_tiers_unique
    ON Course_Price_Tiers (course_id, COALESCE(age_group, ''), from_seat);

CREATE INDEX IF NOT EXISTS idx_course_price_tiers_course
    ON Course_Price_Tiers (course_id);

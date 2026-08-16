-- Stamps become a collection, and medals become a thing you can win.
--
-- Until now a stamp was two things at once: a memento of a class and the
-- currency you spent on rewards. Redeeming marked rows 'used' and the app
-- greyed them out, so a child's collection decayed every time they claimed a
-- prize. Worse, a stamp's artwork was chosen by *how many* you had (stamps
-- #1-10 use image A) rather than by *what you joined*, so nothing on the page
-- said which event a stamp came from.
--
-- This splits the two jobs:
--   Stamps        -> a permanent record of joining. One per booking, carrying
--                    the artwork of the item it came from and which visit it
--                    was (#1, #2, ...).
--   Reward_Points -> the spendable balance. Redemption moves points; the
--                    collection is never touched.
--   Child_Badges  -> medals อันดับ 1/2/3, won at competitions, or granted
--                    automatically for turning up when the item says so.

-- ── Stamp design library ──────────────────────────────────────────────────────
-- A named, reusable artwork. Kept separate from the binding below so one design
-- can serve several items, and so the CRM has something to list.
CREATE TABLE IF NOT EXISTS Stamp_Designs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    image_url TEXT,
    -- Used when there is no image (and behind a transparent PNG).
    accent_color TEXT DEFAULT '#7452d6',
    -- Whether the app prints "#3" on the stamp to say it was the 3rd visit.
    show_visit_number INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Which design applies to what. One generic table rather than a column on each
-- of Courses/Calendars/Calendar_Slot_Rules, so binding at a new level later
-- costs a row instead of a schema change.
--
-- Resolved most-specific-first at award time:
--   slot_rule -> calendar -> course -> Stamp_Image_Ranges (legacy) -> CI colour
CREATE TABLE IF NOT EXISTS Stamp_Design_Bindings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,          -- 'course' | 'calendar' | 'slot_rule'
    ref_id INTEGER NOT NULL,
    design_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scope, ref_id),
    FOREIGN KEY (design_id) REFERENCES Stamp_Designs(id) ON DELETE CASCADE
);

-- ── Badges ────────────────────────────────────────────────────────────────────
-- The artwork for each rank. course_id NULL is the default set used everywhere;
-- a row with a course_id gives one item its own medals.
CREATE TABLE IF NOT EXISTS Badge_Designs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tier INTEGER NOT NULL,        -- 1 = ทอง, 2 = เงิน, 3 = ทองแดง
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    accent_color TEXT,
    course_id INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tier, course_id),
    FOREIGN KEY (course_id) REFERENCES Courses(id) ON DELETE CASCADE
);

-- The three defaults, so medals render before anyone uploads anything.
INSERT OR IGNORE INTO Badge_Designs (tier, name, description, accent_color, course_id) VALUES
  (1, 'อันดับ 1', 'ชนะเลิศ',    '#f2b418', NULL),
  (2, 'อันดับ 2', 'รองอันดับ 1', '#a8b3c1', NULL),
  (3, 'อันดับ 3', 'รองอันดับ 2', '#c98a5e', NULL);

-- A medal a child actually holds. booking_id ties it to the round it was won
-- in, so winning the same competition twice gives two medals.
CREATE TABLE IF NOT EXISTS Child_Badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    tier INTEGER NOT NULL,
    course_id INTEGER,
    booking_id INTEGER,
    note TEXT,
    source TEXT DEFAULT 'manual',  -- 'participation' | 'manual'
    awarded_by_crm_user_id INTEGER,
    awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    FOREIGN KEY (child_id) REFERENCES Children(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES Courses(id),
    FOREIGN KEY (booking_id) REFERENCES Bookings(id)
);

-- One medal of a given rank per booking — re-running the participation grant
-- (check in, then mark completed) must not hand out a second bronze.
CREATE UNIQUE INDEX IF NOT EXISTS idx_child_badges_unique
  ON Child_Badges(child_id, booking_id, tier)
  WHERE booking_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_child_badges_child ON Child_Badges(child_id, revoked_at);

-- ── Reward points ─────────────────────────────────────────────────────────────
-- The spendable half of the old Stamps table. A ledger rather than a balance
-- column so expiry, refunds and manual adjustments all leave a trace, the same
-- reason Stamps was one-row-per-stamp to begin with.
CREATE TABLE IF NOT EXISTS Reward_Points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    delta INTEGER NOT NULL,        -- + earned, - spent
    reason TEXT,                   -- 'attend' | 'redeem' | 'manual' | 'backfill'
    booking_id INTEGER,
    course_id INTEGER,
    redemption_id INTEGER,
    note TEXT,
    created_by_crm_user_id INTEGER,
    expires_at DATETIME,           -- NULL = never
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (child_id) REFERENCES Children(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES Bookings(id),
    FOREIGN KEY (course_id) REFERENCES Courses(id),
    FOREIGN KEY (redemption_id) REFERENCES Redemptions(id)
);

CREATE INDEX IF NOT EXISTS idx_reward_points_child ON Reward_Points(child_id, expires_at);

-- ── Stamps gains the collection fields ────────────────────────────────────────
-- design_id and visit_number are frozen on the row on purpose: re-uploading an
-- item's artwork next year must not repaint what a child already earned.
ALTER TABLE Stamps ADD COLUMN design_id INTEGER;
ALTER TABLE Stamps ADD COLUMN calendar_id INTEGER;
ALTER TABLE Stamps ADD COLUMN slot_rule_id INTEGER;
ALTER TABLE Stamps ADD COLUMN visit_number INTEGER;
ALTER TABLE Stamps ADD COLUMN source TEXT;         -- 'checkin' | 'completion' | 'manual'
ALTER TABLE Stamps ADD COLUMN granted_by_crm_user_id INTEGER;
ALTER TABLE Stamps ADD COLUMN note TEXT;
ALTER TABLE Stamps ADD COLUMN revoked_at DATETIME;

-- Ordinary items grant this rank just for showing up (3 = ทองแดง per the
-- brief). NULL = competition only, awarded by hand in the CRM.
ALTER TABLE Courses ADD COLUMN participation_badge_tier INTEGER;

-- ── Backfill ──────────────────────────────────────────────────────────────────
-- Every stamp still spendable today becomes a point, keeping its expiry date.
-- 'used'/'expired' rows contribute nothing — they were already gone.
INSERT INTO Reward_Points (child_id, delta, reason, booking_id, course_id, expires_at, created_at)
SELECT child_id, 1, 'backfill', booking_id, course_id, expires_at, earned_at
FROM Stamps
WHERE status = 'available';

-- The collection keeps one stamp per attended booking. Courses that awarded
-- several stamps at once produced duplicates; the extras are revoked rather
-- than deleted — their value already survives as points above, and the row is
-- still there to read.
UPDATE Stamps SET revoked_at = CURRENT_TIMESTAMP
WHERE booking_id IS NOT NULL
  AND id NOT IN (
    SELECT MIN(id) FROM Stamps WHERE booking_id IS NOT NULL GROUP BY child_id, booking_id
  );

-- Old rows predate the per-item artwork, so they keep resolving through
-- Stamp_Image_Ranges (design_id stays NULL) and are numbered by their order
-- within each course.
UPDATE Stamps SET source = 'completion' WHERE source IS NULL;

UPDATE Stamps SET visit_number = (
  SELECT COUNT(*) FROM Stamps s2
  WHERE s2.child_id = Stamps.child_id
    AND s2.course_id IS NOT NULL AND s2.course_id = Stamps.course_id
    AND s2.revoked_at IS NULL
    AND (s2.earned_at < Stamps.earned_at OR (s2.earned_at = Stamps.earned_at AND s2.id <= Stamps.id))
)
WHERE revoked_at IS NULL AND course_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stamps_one_per_booking
  ON Stamps(child_id, booking_id)
  WHERE booking_id IS NOT NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stamps_child_course ON Stamps(child_id, course_id, revoked_at);

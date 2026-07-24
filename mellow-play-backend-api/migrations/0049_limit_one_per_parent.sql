-- Per-course/event opt-in: block a second booking from a DIFFERENT child of
-- the same parent, not just the same child again (which allow_repeat=0
-- already covers). For a capacity-limited event meant to be "1 seat per
-- family" — e.g. Family Day — a parent with 3 kids shouldn't be able to
-- register each of them separately.
ALTER TABLE Courses ADD COLUMN limit_one_per_parent BOOLEAN DEFAULT 0;

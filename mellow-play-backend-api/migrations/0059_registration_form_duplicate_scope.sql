-- Refines the registration form's duplicate-prevention condition from a
-- plain on/off boolean into a scope choice: block a repeat submission
-- within the same course overall ('course'), or only within the same
-- specific scheduled round/session ('round') — e.g. a form might be fine
-- with the same child registering for a different date of the same class,
-- but not the same date/time twice. NULL/'none' means the condition is off.
-- prevent_duplicate_per_member is left in place unused rather than dropped
-- (same reasoning as migration 0050: SQLite/D1 can't cheaply drop a column,
-- and no real data has ever depended on it).
ALTER TABLE Registration_Forms ADD COLUMN duplicate_check_scope TEXT;

-- Needed for 'round' scope: which specific scheduled round a submission
-- belongs to, so the dedupe check (built in a later pass, alongside the
-- consumer booking integration) can compare against the right slice of
-- past submissions instead of just "this course, ever."
ALTER TABLE Form_Submissions ADD COLUMN scheduled_at TEXT;

-- When a class or event was last edited.
--
-- Courses only ever recorded created_at, so the management list had no way to
-- answer "what changed recently" — which is the question staff ask when a
-- price or a schedule looks wrong and nobody remembers touching it.
--
-- Existing rows are backfilled from created_at rather than left NULL: an empty
-- column reads as "never edited", which is a claim this table cannot support
-- for anything edited before today. Created-and-never-edited is the honest
-- default for a row we have no edit history for.
ALTER TABLE Courses ADD COLUMN updated_at DATETIME;

UPDATE Courses SET updated_at = created_at WHERE updated_at IS NULL;

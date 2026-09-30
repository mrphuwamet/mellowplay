-- A class that is not listed anywhere but still opens for anyone holding its
-- link — the "Private Class" staff asked for.
--
-- Migration 0074 gave a course is_visible, which is a single yes/no: a hidden
-- course is dropped from getAllCourses, and since every consumer screen
-- (including the class detail page and the booking flow) resolves a class by
-- searching that one list, hiding it also makes it unreachable. There was no
-- way to run a class for an invited group only.
--
-- visibility is the real state, in three values:
--   public    listed in the app, opens for anyone            (today's default)
--   unlisted  in no list, opens for anyone holding the link  (the new one)
--   hidden    in no list, opens for nobody                   (today's hidden)
--
-- is_visible stays, and keeps its exact old meaning: "does this appear in a
-- list". Both of the new non-public states set it to 0, so every listing query
-- already written — getAllCourses, the booking capacity overview, anything
-- added later that copies the pattern — keeps a private class out without
-- being touched. What separates unlisted from hidden is only ever read on the
-- single-course path (GET /api/v1/courses/:id), which is the one route allowed
-- to serve a class that no list will admit to having.
ALTER TABLE Courses ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';

-- Anything staff had already hidden keeps behaving exactly as it did. Nothing
-- becomes reachable as a side effect of this migration; turning a hidden class
-- into a private one is a deliberate act in the CRM.
UPDATE Courses SET visibility = 'hidden' WHERE COALESCE(is_visible, 1) = 0;

-- The single-course lookup filters on this, and the CRM list groups by it.
CREATE INDEX IF NOT EXISTS idx_courses_visibility ON Courses(visibility);

-- A class is addressed by a code in its URL, not by its row id.
--
-- The id is a counter. For a listed class that is harmless; for the private
-- class added in 0117 it undoes the whole thing, because /class/12 announces
-- that /class/11 and /class/13 exist and a private class stays private only
-- until someone counts. public_code replaces it: a readable slug from the
-- class's own name, then ten characters no one walks through.
--
-- The slug half is not decoration. A path of pure gibberish is the shape a
-- link shortener and a phishing kit share, so it reads as suspicious to a mail
-- filter and to the parent deciding whether to tap it; /class/baby-rider-k7m2qp9xrt
-- says what it is and still cannot be guessed. See src/utils/courseCode.ts.
--
-- Only the code opens a private class. A listed one answers to both its code
-- and its old numeric id, so every link already shared or bookmarked keeps
-- working — see AdminRepository.getCourseByIdForPublic.
ALTER TABLE Courses ADD COLUMN public_code TEXT;

-- Partial, so the rows still waiting for a code do not collide on NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_public_code
  ON Courses(public_code) WHERE public_code IS NOT NULL;

-- Every course that exists today. Computed outside SQL: SQLite can neither
-- slugify a name nor reach a CSPRNG, and a code from random() is a code that
-- can be predicted. Guarded on IS NULL so re-running this cannot reissue a
-- code that links already point at.
UPDATE Courses SET public_code = 'my-fantasy-globe-ub77ex22mn' WHERE id = 1 AND public_code IS NULL;
UPDATE Courses SET public_code = 'family-fact-or-fake-2fydv54gy9' WHERE id = 2 AND public_code IS NULL;
UPDATE Courses SET public_code = 'baby-quest-6-12-8dmeg2wrj5' WHERE id = 3 AND public_code IS NULL;
UPDATE Courses SET public_code = 'baby-express-1-3-ss93c3pah6' WHERE id = 4 AND public_code IS NULL;
UPDATE Courses SET public_code = 'baby-shopper-3-5-wwbk6ntw35' WHERE id = 5 AND public_code IS NULL;
UPDATE Courses SET public_code = 'baby-rider-2-5-4-k2bn98x79u' WHERE id = 7 AND public_code IS NULL;
UPDATE Courses SET public_code = 'baby-rider-5-6-7qdq73ws9e' WHERE id = 8 AND public_code IS NULL;
UPDATE Courses SET public_code = 'baby-build-3-4-cqpyy9yfys' WHERE id = 9 AND public_code IS NULL;
UPDATE Courses SET public_code = 'baby-build-5-6-n59v89k4e4' WHERE id = 10 AND public_code IS NULL;
UPDATE Courses SET public_code = 'baby-boss-4-6-2vnzsyhwtx' WHERE id = 11 AND public_code IS NULL;

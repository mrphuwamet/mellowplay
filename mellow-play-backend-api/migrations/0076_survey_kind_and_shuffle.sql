-- 1. Collapse 'pretest'/'posttest' into one 'test' kind.
--
-- Now that a before/after comparison works by answering the SAME form twice
-- (migration 0075), offering "Pre-Test" and "Post-Test" as two form types
-- actively misleads staff into building two separate forms — which is exactly
-- the setup whose scores cannot be compared. One kind, answered in rounds.
UPDATE Survey_Forms SET form_kind = 'test' WHERE form_kind IN ('pretest', 'posttest');

-- 2. Per-form question/option shuffling, for tests where the same people sit
--    the same paper twice and could otherwise memorise positions ("the answer
--    was the 2nd bubble") instead of the content.
--
-- Safe to shuffle because nothing downstream depends on order: scoring matches
-- an answer to its option by LABEL (see computeScore), and answers are stored
-- against field_key. Order is presentation only.
ALTER TABLE Survey_Forms ADD COLUMN shuffle_questions BOOLEAN DEFAULT 0;
ALTER TABLE Survey_Forms ADD COLUMN shuffle_options BOOLEAN DEFAULT 0;

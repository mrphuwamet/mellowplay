-- Trial runs of a form, kept apart from real answers.
--
-- Staff need to walk through a test the way a respondent does — to see the
-- wording, the shuffling, the scoring and the result screen — but every one of
-- those walkthroughs used to land in the same table as the real answers and
-- skew the averages, the response counts and the before/after comparison.
--
-- A flag rather than a separate table: a trial submission IS a submission, and
-- splitting the storage would mean every query, export and dashboard growing a
-- second code path that could drift from the first. Everything reading
-- submissions filters on this column instead, and defaults to excluding them.
ALTER TABLE Survey_Submissions ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_survey_submissions_form_test
  ON Survey_Submissions(form_id, is_test);

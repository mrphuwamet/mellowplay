-- Pre/post rounds on ONE form.
--
-- Survey_Forms.form_kind ('pretest'/'posttest') is a label on the FORM with no
-- linkage between a pair, so it can't answer "did this child improve?" — the
-- two forms are different question sets and different rows. A real before/after
-- delta needs the SAME questions answered twice, so the round belongs on the
-- submission, not the form.
--
-- attempt_no is derived server-side from how many times this respondent has
-- already answered this form (see SurveyRepository.createSubmission), never
-- sent by the client. Respondent identity is user_id for members, falling back
-- to respondent_phone for guests; a fully anonymous submission (neither) can't
-- be paired with anything and always stays at 1.
--
-- attempt_label is the optional human name for the round ("ก่อนเรียน" /
-- "หลังเรียน"), passed through from an `?attempt=` query param on the shared
-- survey link. Purely cosmetic — the comparison works off attempt_no.
ALTER TABLE Survey_Submissions ADD COLUMN attempt_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE Survey_Submissions ADD COLUMN attempt_label TEXT;

-- Backfill: existing rows all default to 1, which would be wrong for anyone who
-- already answered a form twice. Number them by id order within (form,
-- respondent). 'u'||user_id vs 'p'||respondent_phone builds the same respondent
-- key the application uses — SQLite's || yields NULL for a NULL operand, so
-- COALESCE falls through to the phone branch for guests, and rows with neither
-- are skipped by the WHERE and keep the default.
UPDATE Survey_Submissions
SET attempt_no = (
  SELECT COUNT(*)
  FROM Survey_Submissions p
  WHERE p.form_id = Survey_Submissions.form_id
    AND p.id <= Survey_Submissions.id
    AND COALESCE('u' || p.user_id, 'p' || p.respondent_phone)
      = COALESCE('u' || Survey_Submissions.user_id, 'p' || Survey_Submissions.respondent_phone)
)
WHERE COALESCE(user_id, respondent_phone) IS NOT NULL;

-- The lookup createSubmission does on every submit.
CREATE INDEX idx_survey_submissions_respondent
  ON Survey_Submissions(form_id, user_id, respondent_phone);

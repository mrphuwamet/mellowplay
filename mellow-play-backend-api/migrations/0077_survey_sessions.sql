-- Sessions: several forms presented as one continuous questionnaire.
--
-- A session is the unit staff actually run ("ประเมินค่ายซัมเมอร์ รอบมิถุนายน"):
-- it chains a survey and a test behind ONE link so the respondent never sees
-- the seam, enforces "one answer per person" across the whole chain, and gives
-- the CRM something to compare one run against another.
CREATE TABLE Survey_Sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  slug TEXT UNIQUE,                       -- shareable link segment, same idea as Survey_Forms.slug
  is_active BOOLEAN DEFAULT 1,
  require_unique_name BOOLEAN DEFAULT 1,  -- block a name that already answered this session
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Which forms, in what order. A form may appear in many sessions; deleting a
-- session drops only its membership rows, never the forms themselves.
CREATE TABLE Survey_Session_Forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES Survey_Sessions(id) ON DELETE CASCADE,
  form_id INTEGER NOT NULL REFERENCES Survey_Forms(id),
  order_index INTEGER NOT NULL
);
CREATE INDEX idx_survey_session_forms ON Survey_Session_Forms(session_id, order_index);

-- A submission still belongs to exactly one form. session_id says which
-- session it was collected under (null for a form answered by its own direct
-- link), and session_run_id ties together the several form submissions that
-- came from one person sitting down once — the client mints it per run, since
-- only the client knows the sitting is still the same one.
ALTER TABLE Survey_Submissions ADD COLUMN session_id INTEGER REFERENCES Survey_Sessions(id);
ALTER TABLE Survey_Submissions ADD COLUMN session_run_id TEXT;
CREATE INDEX idx_survey_submissions_session ON Survey_Submissions(session_id, session_run_id);

-- Question shuffling grows from a flag to a mode.
--
--   none           — as authored
--   within_section — reorder questions inside each heading's block (the old
--                    shuffle_questions = 1 behaviour, kept as the default when
--                    upgrading so nobody's form changes shape silently)
--   sections       — reorder whole heading blocks, questions inside each stay put
--   all            — reorder every question across the form, ignoring headings
--
-- 'all' is deliberately offered even though it scrambles questions out from
-- under the heading that introduces them: it is correct for a flat question
-- bank with no sections, and wrong for a form with them. That judgement
-- belongs to whoever wrote the form, so the CRM warns rather than forbids.
ALTER TABLE Survey_Forms ADD COLUMN shuffle_mode TEXT NOT NULL DEFAULT 'none';
UPDATE Survey_Forms SET shuffle_mode = 'within_section' WHERE shuffle_questions = 1;

-- Standalone questionnaire/test system (Pre-Test, Post-Test, plain surveys) —
-- deliberately separate from Registration_Forms/Form_Submissions, which are
-- fundamentally course-bound (Form_Submissions.course_id is NOT NULL).
-- Surveys are answerable from the Consumer App by members AND guests, with
-- no course/booking linkage at all.
CREATE TABLE Survey_Forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  form_kind TEXT NOT NULL DEFAULT 'survey', -- 'survey' | 'pretest' | 'posttest' — a label only, no linkage between a pretest/posttest pair
  has_answer_key BOOLEAN DEFAULT 0,          -- per-form grading toggle
  is_active BOOLEAN DEFAULT 1,
  slug TEXT UNIQUE,                          -- shareable link segment
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE Survey_Form_Fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id INTEGER NOT NULL REFERENCES Survey_Forms(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  page_index INTEGER NOT NULL DEFAULT 0,
  field_index INTEGER NOT NULL,
  type TEXT NOT NULL,       -- 'heading' | 'text' | 'textarea' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'identity'
  label TEXT NOT NULL,
  required BOOLEAN DEFAULT 0,
  options_json TEXT,        -- select/radio/checkbox: [{ "label": "...", "points": 5 }, ...] — points ignored/unused when has_answer_key=0
  config_json TEXT
);

CREATE TABLE Survey_Submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id INTEGER NOT NULL REFERENCES Survey_Forms(id),
  user_id INTEGER REFERENCES Users(id),   -- null for guest
  respondent_name TEXT,
  respondent_phone TEXT,
  answers_json TEXT NOT NULL,
  total_score INTEGER,   -- null when has_answer_key=0
  max_score INTEGER,     -- null when has_answer_key=0
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_survey_submissions_form ON Survey_Submissions(form_id, created_at);

-- Per-activity registration form builder: CRM staff can build a reusable
-- form (multiple pages, custom fields, an optional family-member picker)
-- and assign it to any Course/Event/Service. A page is just a page_index
-- on fields, not its own table — a page's title is a heading-type field.
--
-- Form_Submissions is keyed by the booking family (form_id, course_id,
-- parent_user_id), not by a single Bookings row: one checkout can create
-- several sibling Bookings rows (one per child), so pointing a submission
-- at any single one of them would be arbitrary. Each of those sibling rows
-- instead points back at the one shared submission via form_submission_id.
CREATE TABLE Registration_Forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  prevent_duplicate_per_member BOOLEAN DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- field_key is a stable slug distinct from `id` — the builder's save
-- endpoint deletes and reinserts all fields on every save, so `id` churns,
-- but answers_json (and any later display of historical submissions) needs
-- a key that survives that churn.
CREATE TABLE Registration_Form_Fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id INTEGER NOT NULL REFERENCES Registration_Forms(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  page_index INTEGER NOT NULL DEFAULT 0,
  field_index INTEGER NOT NULL,
  type TEXT NOT NULL, -- 'heading' | 'text' | 'textarea' | 'number' | 'date' | 'select' | 'radio' | 'checkbox' | 'family_member_picker'
  label TEXT NOT NULL,
  required BOOLEAN DEFAULT 0,
  options_json TEXT,
  config_json TEXT
);
CREATE INDEX idx_registration_form_fields_form_id ON Registration_Form_Fields(form_id);

CREATE TABLE Form_Submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id INTEGER NOT NULL REFERENCES Registration_Forms(id),
  course_id INTEGER NOT NULL REFERENCES Courses(id),
  parent_user_id INTEGER REFERENCES Users(id), -- null for guest bookings (childId = 0)
  answers_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_form_submissions_dedupe ON Form_Submissions(form_id, course_id, parent_user_id);

ALTER TABLE Courses ADD COLUMN registration_form_id INTEGER REFERENCES Registration_Forms(id);
ALTER TABLE Bookings ADD COLUMN form_submission_id INTEGER REFERENCES Form_Submissions(id);

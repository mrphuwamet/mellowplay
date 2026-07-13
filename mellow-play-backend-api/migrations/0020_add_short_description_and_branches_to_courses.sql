ALTER TABLE Courses ADD COLUMN short_description TEXT;
ALTER TABLE Courses ADD COLUMN branch_ids TEXT DEFAULT '[]';

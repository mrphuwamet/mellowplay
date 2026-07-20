ALTER TABLE Courses ADD COLUMN calendar_id INTEGER REFERENCES Calendars(id);

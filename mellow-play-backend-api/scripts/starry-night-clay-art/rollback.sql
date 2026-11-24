-- Rollback for "Starry Night Clay Art" — deletes ONLY the rows this seed created, matched by name.
-- Safe to run even if some rows were never created (DELETE affects 0 rows, no error).

DELETE FROM Sale_Campaigns WHERE name = 'Early Bird - Starry Night Clay Art';

DELETE FROM Calendar_Slot_Rules WHERE calendar_id = (SELECT id FROM Calendars WHERE name = 'Starry Night Clay Art' AND type = 'class');

DELETE FROM Courses WHERE name = 'Starry Night Clay Art';

DELETE FROM Calendars WHERE name = 'Starry Night Clay Art' AND type = 'class';

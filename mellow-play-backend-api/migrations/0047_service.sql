-- "Service" (e.g. haircut, assessment) was previously just a category-name
-- regex match (/service|บริการ/i) riding on the regular class pool — fragile
-- (breaks if the category gets renamed) and conceptually blended with Class
-- booking. Give it its own real flag, mirroring is_event, so Book Class /
-- Book Service / Book Event each browse a genuinely distinct course pool.
-- Unlike is_event/is_extraclass, is_service does NOT skip branch selection —
-- a service is offered at a specific branch like a regular class is.
ALTER TABLE Courses ADD COLUMN is_service BOOLEAN DEFAULT 0;

-- New "Event/Activity" booking feature — reuses the whole Courses/Bookings
-- system (capacity, duplicate-prevention via allow_repeat, payment, CRM
-- bookings list) rather than a parallel schema. is_event is a separate flag
-- from is_extraclass: both skip branch selection in the booking flow, but
-- only is_extraclass triggers the "one extra class per day" limit in
-- adminController.createBooking — an event shouldn't count against that.
ALTER TABLE Courses ADD COLUMN is_event BOOLEAN DEFAULT 0;

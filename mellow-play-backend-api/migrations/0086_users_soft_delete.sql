-- Deleting a customer account without destroying it.
--
-- A hard DELETE is not available here: Users is referenced by Children,
-- Bookings, Form_Submissions, Stamps, coupons and more, so the row cannot go
-- without taking a family's whole history with it — and a deletion made by
-- mistake would be unrecoverable. deleted_at hides the account everywhere
-- instead, and restoring it is one statement:
--
--   UPDATE Users SET deleted_at = NULL WHERE id = ?;
--
-- NULL means active. Every read path filters on it; anything that counts users
-- (the dashboard, broadcast audiences, the children directory) filters too, or
-- a deleted account would keep showing up as a number without a name.
--
-- Phone and email are deliberately NOT released. They are UNIQUE, so freeing
-- them would mean mangling the stored value, and then a restore could not put
-- back what was there. Someone returning with the same number is the same
-- person: restore the account rather than letting a second one take the number.
ALTER TABLE Users ADD COLUMN deleted_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON Users(deleted_at);

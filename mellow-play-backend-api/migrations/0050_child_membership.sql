-- Premium membership moves from the parent account to each child --
-- privileges (discounted pricing, priority booking) are meant to apply
-- per-child, not to the whole family. Users.membership_type /
-- membership_expires_at are left in place (unused after this) rather than
-- dropped, since SQLite/D1 can't cheaply drop a column and the historical
-- values may still be worth having around.
--
-- Per 2026-07-24 product decision: no backfill from the parent's existing
-- status — every child starts at 'standard' and is upgraded individually.
ALTER TABLE Children ADD COLUMN membership_type TEXT DEFAULT 'standard';
ALTER TABLE Children ADD COLUMN membership_expires_at DATETIME;

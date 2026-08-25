-- Issue certificates automatically, and remember which path issued one.
--
-- Applied by hand (never `d1 migrations apply` — d1_migrations is stale at
-- 0066):
--   npx wrangler d1 execute mellow_play_db_dev --remote --file migrations/0100_certificate_auto_issue.sql
--   npx wrangler d1 execute mellow_play_db     --remote --file migrations/0100_certificate_auto_issue.sql

-- When this item hands out certificates by itself.
--   NULL / 'off'  — never; staff issue them from the booking list (the default,
--                   so no existing item starts printing names unasked)
--   'checkin'     — the moment they are ticked in at the door, for one-day
--                   events where nobody ever presses "จบคลาส"
--   'completion'  — when the class is marked finished, the honest moment for a
--                   course
-- No CHECK constraint: the values are validated where they are set, and a
-- CHECK here would have to be rebuilt out of the table the next time this
-- list grows — which is exactly what migration 0099 had to do to Email_Logs.
ALTER TABLE Courses ADD COLUMN certificate_auto TEXT;

-- Which path issued it. Unticking a mis-scan at the door should take back the
-- certificate the door issued, and leave alone one a staff member issued
-- deliberately or one that came from "จบคลาส" — the same rule the stamp ledger
-- already follows.
ALTER TABLE Certificates ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';

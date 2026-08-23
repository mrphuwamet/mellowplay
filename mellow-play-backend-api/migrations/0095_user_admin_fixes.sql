-- Back-office user management: a real password reset, and a delete that
-- actually frees the account's identifiers.
--
-- Applied by hand (never `d1 migrations apply` — d1_migrations is stale at
-- 0066):
--   npx wrangler d1 execute mellow_play_db_dev --remote --file migrations/0095_user_admin_fixes.sql
--   npx wrangler d1 execute mellow_play_db     --remote --file migrations/0095_user_admin_fixes.sql

-- ── A password reset that exists ────────────────────────────────────────────
-- CRM_Users has had reset_token/reset_token_expires_at for a long time and a
-- working flow around them. Users never got the columns, so the customer-facing
-- "reset password" endpoint was a stub that returned success and did nothing.
-- Same two columns, so the two flows can be read side by side.
ALTER TABLE Users ADD COLUMN reset_token TEXT;
ALTER TABLE Users ADD COLUMN reset_token_expires_at DATETIME;
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON Users(reset_token);

-- ── A delete that gives the phone number back ──────────────────────────────
-- Users.phone and Users.email are UNIQUE, and deleting an account only sets
-- deleted_at — the row stays, so its phone and email stay taken. Re-adding the
-- same family was rejected with "เบอร์นี้ถูกใช้งานแล้ว" against an account no
-- screen can even show.
--
-- On delete the two identifiers move into these columns and the live ones are
-- cleared, which frees the unique index immediately. Nothing is lost: restoring
-- an account puts them back, and they are still here to identify the row.
ALTER TABLE Users ADD COLUMN deleted_phone TEXT;
ALTER TABLE Users ADD COLUMN deleted_email TEXT;

-- Accounts already deleted are still holding their identifiers hostage — park
-- them the same way so the numbers come free without anyone having to delete
-- the account a second time.
UPDATE Users
   SET deleted_phone = phone,
       deleted_email = email,
       phone = NULL,
       email = NULL
 WHERE deleted_at IS NOT NULL
   AND (phone IS NOT NULL OR email IS NOT NULL);

-- ── An empty date means no date ────────────────────────────────────────────
-- The CRM sends '' for a cleared date field and it was stored verbatim, so a
-- DATE column ended up holding an empty string rather than NULL. Everything
-- that tests `dob IS NULL` then read it as "set".
UPDATE Users SET dob = NULL WHERE dob = '';
UPDATE Users SET application_date = NULL WHERE application_date = '';
UPDATE User_CRM_Children SET date_of_birth = NULL WHERE date_of_birth = '';
UPDATE HD_Profiles SET birth_date = NULL WHERE birth_date = '';

-- ── A note staff can leave on a registration ───────────────────────────────
-- For recording a phone call about a booking. Lives on the booking, not on the
-- account: it is about this registration, and the next one deserves a clean
-- slate.
ALTER TABLE Bookings ADD COLUMN staff_note TEXT;

-- How a course confirms a booking, as one explicit choice instead of two
-- independent flags plus a hardcoded fallback rule.
--
-- Before this, "email with SMS as backup" was not something anyone chose: it
-- fell out of enabling email, not enabling SMS, and having an SMS template
-- lying around. Staff could not see that rule anywhere, and could not ask for
-- the reverse.
--
--   off        — no confirmation is sent
--   both       — email AND SMS, every time
--   email_first— email; SMS instead when there is no address or the send fails
--   sms_first  — SMS; email instead when there is no phone or the send fails
--   email_only — email, and nothing if it cannot be sent
--   sms_only   — SMS, and nothing if it cannot be sent
ALTER TABLE Courses ADD COLUMN confirmation_channel_mode TEXT NOT NULL DEFAULT 'off';

-- Backfill preserves today's behaviour exactly, course by course:
--
--  * both flags on  -> 'both'          (what it already did)
--  * email only     -> 'email_first'   (the old implicit fallback IS email_first)
--  * sms only       -> 'sms_only'      (the old code never fell back to email)
--  * neither        -> 'off'
--
-- so nobody's course starts sending on a different channel the moment this
-- lands. The old flags stay in place and keep being written by the CRM; they
-- are what a course's mode is derived from when it has never been set here.
UPDATE Courses SET confirmation_channel_mode =
  CASE
    WHEN COALESCE(email_success_enabled, 0) = 1 AND COALESCE(sms_success_enabled, 0) = 1 THEN 'both'
    WHEN COALESCE(email_success_enabled, 0) = 1 THEN 'email_first'
    WHEN COALESCE(sms_success_enabled, 0) = 1 THEN 'sms_only'
    ELSE 'off'
  END;

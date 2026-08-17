-- Short invite links, and links that need no PIN.
--
-- An invite is pasted into a LINE message:
-- https://mellowplay.co/invite/a10b108e-d908-47a8-8bdb-48e4392886fa is a UUID
-- nobody can read back over the phone, and it wraps badly everywhere. The short
-- code is a second address for the same link — both keep working, so nothing
-- already sent out breaks.
--
-- The alphabet leaves out 0/O and 1/I/L: these get read aloud and written down.
ALTER TABLE Invite_Access_Links ADD COLUMN short_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_links_short_code
  ON Invite_Access_Links(short_code) WHERE short_code IS NOT NULL;

-- pin_hash stays NOT NULL — rebuilding the table to relax it would risk live
-- links for no gain. An empty string is the "no PIN on this link" marker, and
-- is checked explicitly wherever the PIN is verified: an empty hash can never
-- match a submitted PIN by accident, because bcrypt output is never empty.

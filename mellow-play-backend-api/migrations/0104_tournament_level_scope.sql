-- A bracket says what it is a bracket OF, and which round it covers.
--
-- Applied by hand (never `d1 migrations apply` — d1_migrations is stale at
-- 0066):
--   npx wrangler d1 execute mellow_play_db_dev --remote --file migrations/0104_tournament_level_scope.sql
--   npx wrangler d1 execute mellow_play_db     --remote --file migrations/0104_tournament_level_scope.sql
--
-- Tournament_Entries.entry_type has always held 'team' | 'family' | 'person',
-- but nothing said which of them a bracket was for — so generating one had to
-- be told the entrant count by hand, and the number differs enormously between
-- levels: twenty-four bookings might be six teams.
--
-- 'team'   — one entry per team named on the form
-- 'family' — one entry per registration form submission
-- 'person' — one entry per booking
ALTER TABLE Tournaments ADD COLUMN entry_level TEXT;

-- 'round' — only the round named below. THE DEFAULT, because a competition is
--           run round by round; pooling every round of an event into one draw
--           puts Saturday and Sunday in the same heat.
-- 'all'   — every round of the course together.
ALTER TABLE Tournaments ADD COLUMN entry_scope TEXT DEFAULT 'round';
ALTER TABLE Tournaments ADD COLUMN scope_slot_date TEXT;
ALTER TABLE Tournaments ADD COLUMN scope_slot_start_time TEXT;

-- Existing brackets keep behaving as they did: no level recorded means the
-- screen offers its own default, and 'all' preserves what they were actually
-- built from before a scope existed.
UPDATE Tournaments SET entry_scope = 'all' WHERE entry_scope IS NULL OR entry_scope = 'round';

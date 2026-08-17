-- Heats for a competition.
--
-- An event that runs as a competition has rounds (the calendar already knows
-- them) and, inside a round, heats: the groups that actually race against each
-- other. Until now there was nowhere to record that, so heats lived on paper
-- or in a spreadsheet, and the medals awarded afterwards had no connection to
-- the grouping that produced them.
--
-- Who goes in a heat is deliberately not one kind of thing. Registrations
-- arrive in three shapes and all three are real:
--   'team'   — everyone who picked the same team in the form's team_select
--   'family' — one form submission, which may cover several people at once
--   'person' — a single booking
-- An entry stores which shape it is and the key that identifies it, so a heat
-- can mix a whole team with two individual entrants without a special case.

CREATE TABLE IF NOT EXISTS Tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    -- Which of the form's fields names the team, when entries are teams. Held
    -- here rather than looked up each time because a form can have more than
    -- one team-ish field and only one of them is the competition's.
    team_field_key TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES Courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tournaments_course ON Tournaments(course_id);

CREATE TABLE IF NOT EXISTS Tournament_Heats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    -- The round this heat belongs to. Kept as the booking's own slot_date /
    -- slot_start_time rather than a rule id: a rule can be edited or deleted
    -- after the fact, and the date a heat ran on cannot.
    slot_date TEXT,
    slot_start_time TEXT,
    -- Optional cap, purely advisory — staff can overfill a heat and the UI
    -- says so rather than refusing, because the day of an event is not the
    -- time to argue with the software.
    capacity INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'draft',   -- 'draft' | 'ready' | 'done'
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES Tournaments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_heats_tournament ON Tournament_Heats(tournament_id, sort_order);

CREATE TABLE IF NOT EXISTS Tournament_Entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    heat_id INTEGER NOT NULL,
    -- Denormalised from the heat so the "one entry per tournament" rule below
    -- can be an index rather than a check every write has to remember.
    tournament_id INTEGER NOT NULL,
    entry_type TEXT NOT NULL,      -- 'team' | 'family' | 'person'
    -- team name, form_submission_id, or booking_id, depending on entry_type.
    ref_key TEXT NOT NULL,
    -- What to print on the start list. A snapshot, so renaming a child later
    -- does not rewrite the results of a race that already happened.
    label TEXT NOT NULL,
    sub_label TEXT,
    lane INTEGER,
    result_rank INTEGER,           -- 1/2/3 = the medal tiers; any number ranks
    result_note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (heat_id) REFERENCES Tournament_Heats(id) ON DELETE CASCADE,
    FOREIGN KEY (tournament_id) REFERENCES Tournaments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_entries_heat ON Tournament_Entries(heat_id, sort_order);

-- The same registrant must not sit in two heats of one tournament — the
-- commonest mistake when a start list is built by hand, and the one nobody
-- notices until both heats are called at once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_unique_per_tournament
  ON Tournament_Entries(tournament_id, entry_type, ref_key);

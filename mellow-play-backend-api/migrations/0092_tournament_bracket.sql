-- Rounds, and winners moving between them.
--
-- Heats so far were a flat list: everyone racing on one day, grouped. A real
-- competition has a shape — heats feed a semi-final, the semi-final feeds a
-- final — and that shape was the part staff still kept on paper.
--
-- stage_index is the column a heat sits in (0 = the first round). advance_count
-- is how many of its entries go through to the next one. Those two numbers are
-- the whole bracket: everything the screen draws, and the "send the winners
-- forward" action, is derived from them rather than stored twice.

ALTER TABLE Tournaments ADD COLUMN format TEXT DEFAULT 'heats';        -- 'heats' | 'bracket'
ALTER TABLE Tournaments ADD COLUMN advance_per_heat INTEGER DEFAULT 2;

ALTER TABLE Tournament_Heats ADD COLUMN stage_index INTEGER NOT NULL DEFAULT 0;
-- Named per tournament rather than derived, because "รอบรองชนะเลิศ" with four
-- heats left is a judgement call about the event, not arithmetic.
ALTER TABLE Tournament_Heats ADD COLUMN stage_label TEXT;
ALTER TABLE Tournament_Heats ADD COLUMN advance_count INTEGER;

-- Which entry in the previous round this one came from. Only used to draw the
-- line between them; an entry advanced by hand simply has no source.
ALTER TABLE Tournament_Entries ADD COLUMN source_entry_id INTEGER;
ALTER TABLE Tournament_Entries ADD COLUMN stage_index INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_heats_stage ON Tournament_Heats(tournament_id, stage_index, sort_order);

-- "One entry per tournament" was right for a flat list and wrong the moment
-- rounds existed: advancing a winner means entering the same team again, one
-- stage along. The rule that actually holds is one entry per STAGE — nobody
-- races twice in the same round.
UPDATE Tournament_Entries
SET stage_index = COALESCE((SELECT h.stage_index FROM Tournament_Heats h WHERE h.id = Tournament_Entries.heat_id), 0);

DROP INDEX IF EXISTS idx_entries_unique_per_tournament;

CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_unique_per_stage
  ON Tournament_Entries(tournament_id, stage_index, entry_type, ref_key);

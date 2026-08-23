-- The bracket becomes a canvas: heats sit where they are put, and the lines
-- between them are data rather than something inferred from stage numbers.
--
-- Applied by hand (never `d1 migrations apply` — d1_migrations is stale at
-- 0066):
--   npx wrangler d1 execute mellow_play_db_dev --remote --file migrations/0097_tournament_canvas.sql
--   npx wrangler d1 execute mellow_play_db     --remote --file migrations/0097_tournament_canvas.sql

-- ── Where a heat sits ──────────────────────────────────────────────────────
-- NULL means "never been moved", which is the signal to lay it out from its
-- stage the way the page always has. A default of 0,0 would instead pile every
-- existing heat into one corner the moment this ran.
ALTER TABLE Tournament_Heats ADD COLUMN pos_x REAL;
ALTER TABLE Tournament_Heats ADD COLUMN pos_y REAL;

-- ── Which heat feeds which ─────────────────────────────────────────────────
-- Advancement used to be arithmetic on stage_index: winners of stage N were
-- spread across the heats of stage N+1 by position. That is what made the
-- layout rigid — the picture and the rule were the same thing, so the picture
-- could not be rearranged without changing who plays whom.
--
-- The line is now the rule. A heat can feed several, and be fed by several,
-- which is the whole point of letting two brackets meet.
CREATE TABLE IF NOT EXISTS Tournament_Heat_Links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  from_heat_id INTEGER NOT NULL,
  to_heat_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tournament_id) REFERENCES Tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (from_heat_id) REFERENCES Tournament_Heats(id) ON DELETE CASCADE,
  FOREIGN KEY (to_heat_id)   REFERENCES Tournament_Heats(id) ON DELETE CASCADE
);

-- Drawing the same line twice is one line.
CREATE UNIQUE INDEX IF NOT EXISTS idx_heat_links_pair
  ON Tournament_Heat_Links(from_heat_id, to_heat_id);
CREATE INDEX IF NOT EXISTS idx_heat_links_tournament
  ON Tournament_Heat_Links(tournament_id);

-- ── Keep every existing bracket working ────────────────────────────────────
-- The old rule sent heat N of a stage to heat (N mod count) of the next. Drawn
-- as links, every bracket that exists today keeps advancing exactly as it did,
-- and staff see the lines that were previously implied.
INSERT OR IGNORE INTO Tournament_Heat_Links (tournament_id, from_heat_id, to_heat_id)
SELECT h.tournament_id, h.id, n.id
  FROM Tournament_Heats h
  JOIN Tournament_Heats n
    ON n.tournament_id = h.tournament_id
   AND n.stage_index = h.stage_index + 1
 WHERE (
   -- position of h within its own stage, modulo the next stage's heat count
   (SELECT COUNT(*) FROM Tournament_Heats s
     WHERE s.tournament_id = h.tournament_id AND s.stage_index = h.stage_index
       AND (s.sort_order < h.sort_order OR (s.sort_order = h.sort_order AND s.id < h.id)))
   % (SELECT COUNT(*) FROM Tournament_Heats t
       WHERE t.tournament_id = h.tournament_id AND t.stage_index = h.stage_index + 1)
 ) = (
   -- position of n within its stage
   (SELECT COUNT(*) FROM Tournament_Heats s
     WHERE s.tournament_id = n.tournament_id AND s.stage_index = n.stage_index
       AND (s.sort_order < n.sort_order OR (s.sort_order = n.sort_order AND s.id < n.id)))
 );

-- The old rule also offset by WHICH qualifier: a heat sending two through put
-- the first into next[p] and the second into next[p+1]. Two heats in production
-- advance two, so they need their second line drawn as well, or the pair would
-- start landing in the same heat.
INSERT OR IGNORE INTO Tournament_Heat_Links (tournament_id, from_heat_id, to_heat_id)
SELECT h.tournament_id, h.id, n.id
  FROM Tournament_Heats h
  JOIN Tournament_Heats n
    ON n.tournament_id = h.tournament_id
   AND n.stage_index = h.stage_index + 1
 WHERE COALESCE(h.advance_count, 1) >= 2
   AND (
   ((SELECT COUNT(*) FROM Tournament_Heats s
      WHERE s.tournament_id = h.tournament_id AND s.stage_index = h.stage_index
        AND (s.sort_order < h.sort_order OR (s.sort_order = h.sort_order AND s.id < h.id))) + 1)
   % (SELECT COUNT(*) FROM Tournament_Heats t
       WHERE t.tournament_id = h.tournament_id AND t.stage_index = h.stage_index + 1)
 ) = (
   (SELECT COUNT(*) FROM Tournament_Heats s
     WHERE s.tournament_id = n.tournament_id AND s.stage_index = n.stage_index
       AND (s.sort_order < n.sort_order OR (s.sort_order = n.sort_order AND s.id < n.id)))
 );

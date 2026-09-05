-- One entrant may race in more than one heat of the same round.
--
-- Applied by hand (never `d1 migrations apply` — d1_migrations is stale at
-- 0066):
--   npx wrangler d1 execute mellow_play_db_dev --remote --file migrations/0107_entry_unique_per_heat.sql
--   npx wrangler d1 execute mellow_play_db     --remote --file migrations/0107_entry_unique_per_heat.sql
--
-- The old index was unique per (tournament, stage, entry) — so the same person
-- could not appear twice in one round at all. That is more than was wanted:
-- someone who has finished their own heat often wants to enter another, and
-- staff had no way to say so.
--
-- Adding heat_id keeps the part that earns its place and drops the part that
-- does not:
--   * the same entrant twice in the SAME heat is still refused — that is a
--     double-click, never an intention;
--   * advancing a winner is still idempotent, because it inserts into one named
--     heat and the second press hits this index exactly as before;
--   * the same entrant in two DIFFERENT heats of a round is now allowed, which
--     is the thing being asked for.
DROP INDEX IF EXISTS idx_entries_unique_per_stage;

CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_unique_per_heat
  ON Tournament_Entries(tournament_id, stage_index, entry_type, ref_key, heat_id);

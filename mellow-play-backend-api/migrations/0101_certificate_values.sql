-- Freeze every value a certificate printed, not just the three it started with.
--
-- Applied by hand (never `d1 migrations apply` — d1_migrations is stale at
-- 0066):
--   npx wrangler d1 execute mellow_play_db_dev --remote --file migrations/0101_certificate_values.sql
--   npx wrangler d1 execute mellow_play_db     --remote --file migrations/0101_certificate_values.sql

-- A template may now print any answer from the registration form, so the three
-- snapshot columns are no longer the whole story. This holds the resolved value
-- of every variable at issue time, as a JSON map.
--
-- RAW values only. The conditional text rules ("เพศ = ชาย → เด็กชาย…") are part
-- of the template and are applied when the page renders, exactly like the font
-- size and the position already are — so fixing a badly worded rule fixes the
-- certificates already issued, while the underlying data stays frozen.
--
-- NULL on rows issued before this migration: those fall back to the three
-- columns, which is all their templates could reference anyway.
ALTER TABLE Certificates ADD COLUMN values_json TEXT;

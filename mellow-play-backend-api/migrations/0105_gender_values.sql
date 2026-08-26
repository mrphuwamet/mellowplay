-- 'Boy' / 'Girl' become 'male' / 'female'.
--
-- Applied by hand (never `d1 migrations apply` — d1_migrations is stale at
-- 0066):
--   npx wrangler d1 execute mellow_play_db_dev --remote --file migrations/0105_gender_values.sql
--   npx wrangler d1 execute mellow_play_db     --remote --file migrations/0105_gender_values.sql
--
-- The old words came from a form that only ever asked about children. The same
-- form now records every member of a family, so fathers and grandmothers were
-- being filed as "Boy" and "Girl" — 478 and 366 rows of it on production, and
-- no way to tell which of them were actually children.
--
-- Nothing in the codebase decides anything from this column: it is displayed,
-- and offered as form options. So the change is a rename of stored words, and
-- it maps one-to-one in both directions if it ever has to be undone.
UPDATE HD_Profiles SET gender = 'male'        WHERE gender = 'Boy';
UPDATE HD_Profiles SET gender = 'female'      WHERE gender = 'Girl';
UPDATE HD_Profiles SET gender = 'unspecified' WHERE gender = 'Not Specified';
UPDATE HD_Profiles SET gender = 'other'       WHERE gender = 'Other';

UPDATE User_CRM_Children SET gender = 'male'        WHERE gender = 'Boy';
UPDATE User_CRM_Children SET gender = 'female'      WHERE gender = 'Girl';
UPDATE User_CRM_Children SET gender = 'unspecified' WHERE gender = 'Not Specified';
UPDATE User_CRM_Children SET gender = 'other'       WHERE gender = 'Other';

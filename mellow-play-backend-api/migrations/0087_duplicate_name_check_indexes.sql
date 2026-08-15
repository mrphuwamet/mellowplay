-- checkDuplicateFullName (userRepository.ts) runs a LOWER(TRIM(...)) scan
-- over Users, HD_Profiles and User_CRM_Children on every account/child
-- creation to produce its "this name already exists" warning. Wrapping the
-- columns in LOWER(TRIM(...)) made all three queries non-sargable, so they
-- fell back to a full table scan each — slower as the tables grow, to the
-- point of risking the request's own timeout. Expression indexes let SQLite
-- match the same LOWER(TRIM(...)) expression used in the WHERE clause
-- without changing a single query.
CREATE INDEX IF NOT EXISTS idx_users_full_name_lower
  ON Users (LOWER(TRIM(first_name) || ' ' || TRIM(last_name)));

CREATE INDEX IF NOT EXISTS idx_hd_profiles_name_lower
  ON HD_Profiles (LOWER(TRIM(name)));

CREATE INDEX IF NOT EXISTS idx_user_crm_children_full_name_lower
  ON User_CRM_Children (LOWER(TRIM(full_name)));

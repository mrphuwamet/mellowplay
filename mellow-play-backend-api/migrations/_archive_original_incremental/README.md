Historical record only — restored from git commit `6ea43ad` (2026-07-13), the last
point before commit `4d78a16` squashed these 40 files into `../0001_init.sql`.

Deliberately kept **out of `../` (the live migrations root)**: `wrangler d1
migrations apply` scans that directory non-recursively, so this subfolder is
invisible to it. Re-adding these to the live root would replay every
CREATE TABLE/ALTER TABLE a second time against a database that already has
them applied via `0001_init.sql`, and fail (see `0000_init.sql` note below).

Not restorable: `0000_init.sql`, migration id 1 in both databases'
`d1_migrations` tracking table (applied 2026-07-13 08:38:51), was never
committed to this repo under any name — these files assume it already ran
(several `ALTER TABLE ... ADD COLUMN` here target tables `0000_init.sql`
must have created). Its effect is still fully captured in the current
`../0001_init.sql`, verified by replaying `0001_init.sql` +
`0041_community_posts.sql` + `0042_community_post_rules.sql` +
`0043_contact_messages.sql` in a scratch SQLite database and diffing the
result column-by-column against live production — zero differences across
all 69 tables (2026-07-20).

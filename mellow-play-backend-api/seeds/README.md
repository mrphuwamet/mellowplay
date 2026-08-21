# seeds

One-off data a form or a lookup table needs, kept here so what was run against
production is readable later and can be re-run against a fresh database.

Not migrations: nothing here changes schema, and `d1_migrations` does not track
these. Apply them the same way migrations are applied in this project — by
hand, never with `d1 migrations apply`:

```
npx wrangler d1 execute mellow_play_db_dev --remote --file seeds/<name>.sql   # dev first
npx wrangler d1 execute mellow_play_db     --remote --file seeds/<name>.sql   # then production
```

Every seed here is guarded (`WHERE NOT EXISTS`) so running it twice cannot
create a second copy. A `.build.js` beside a `.sql` is what generated it —
edit the builder and regenerate rather than hand-editing the SQL, which is
where a mismatched `field_index` or a missed option would come from:

```
node seeds/<name>.build.js seeds/<name>.sql
```

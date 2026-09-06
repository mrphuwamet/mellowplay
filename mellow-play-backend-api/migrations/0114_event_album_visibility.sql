-- Per-album visibility for event photo albums.
--
-- 'public'  = anyone with the link, no login — an album announced in the
--             news feed must open as freely as the news article itself.
-- 'booked'  = only accounts holding a non-cancelled booking for the album's
--             course (the original rule, kept as the default so existing
--             albums do not silently become public).
ALTER TABLE Event_Albums ADD COLUMN visibility TEXT NOT NULL DEFAULT 'booked';

-- Optional display name for a calendar round/slot (e.g. "รอบเช้า") — shown
-- alongside the time wherever a round renders; falls back to just the time
-- when left blank.
ALTER TABLE Calendar_Slot_Rules ADD COLUMN label TEXT;

-- An album can read from several Google Drive folders.
--
-- One shoot rarely lands in one folder: two photographers upload to two,
-- the morning and afternoon rounds get one each, or the camera's own
-- subfolders come along. Until now an album held exactly one folder id, so
-- the rest had to be dragged together in Drive first, or uploaded by hand.
--
-- The folders live in a child table, ordered, like the album's rounds.
-- Event_Albums.drive_folder_id stays and is kept equal to the FIRST folder,
-- so a CRM build from before this change still shows and edits something
-- sensible; the API writes both.
CREATE TABLE IF NOT EXISTS Event_Album_Drive_Folders (
  album_id INTEGER NOT NULL REFERENCES Event_Albums(id) ON DELETE CASCADE,
  folder_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (album_id, folder_id)
);

-- Every album that already has a folder keeps it.
INSERT OR IGNORE INTO Event_Album_Drive_Folders (album_id, folder_id, position)
  SELECT id, drive_folder_id, 0
    FROM Event_Albums
   WHERE drive_folder_id IS NOT NULL AND drive_folder_id <> '';

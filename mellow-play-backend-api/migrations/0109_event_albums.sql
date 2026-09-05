-- Event photo albums (อัลบั้มรูปกิจกรรม): bulk photos imported from a shared
-- Google Drive folder by CRM staff, published to families who booked the
-- course, searchable by face.
--
-- Face data is deliberately minimal: only a 128-float embedding and a
-- bounding box per detected face — never a cropped face image — and rows
-- cascade away with their photo/album. The embedding is a Float32Array(128)
-- stored little-endian as a 512-byte BLOB; JSON text would be ~5x larger and
-- the search endpoint scans thousands of these per request.

CREATE TABLE Event_Albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  course_id INTEGER NOT NULL REFERENCES Courses(id),
  -- Optional round scope, 'YYYY-MM-DD'. Informational in v1: access is gated
  -- by the course, not the round, so a family that attended any round of the
  -- course can see the album.
  slot_date TEXT,
  drive_folder_id TEXT,
  cover_photo_url TEXT,
  is_published INTEGER NOT NULL DEFAULT 0,
  -- The news post created when the album was published with "สร้างโพสข่าวสาร".
  news_feed_id INTEGER REFERENCES News_Feed(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_event_albums_course ON Event_Albums(course_id, is_published);

CREATE TABLE Event_Album_Photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  album_id INTEGER NOT NULL REFERENCES Event_Albums(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  thumb_url TEXT,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER,
  -- NULL for manually uploaded photos. The UNIQUE pair is what makes a Drive
  -- sync resumable: re-running it skips every file already imported (SQLite
  -- treats NULLs as distinct, so manual uploads never collide).
  drive_file_id TEXT,
  drive_file_name TEXT,
  face_count INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(album_id, drive_file_id)
);
CREATE INDEX idx_event_album_photos_album ON Event_Album_Photos(album_id, display_order, id);

CREATE TABLE Event_Photo_Faces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id INTEGER NOT NULL REFERENCES Event_Album_Photos(id) ON DELETE CASCADE,
  -- Denormalized so the search scan never joins: it pages straight through
  -- this table by (album_id, id).
  album_id INTEGER NOT NULL,
  embedding BLOB NOT NULL,
  bbox TEXT,
  detection_score REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_event_photo_faces_album ON Event_Photo_Faces(album_id, id);

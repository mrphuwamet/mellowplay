-- Unique QR check-in system, phase 1 (QR code + configurable per-course
-- check-in actions). Every booking row gets its own token — shown to the
-- attendee as a QR code after booking, scanned by staff at the event to
-- look up who they are and mark off custom actions (เช็คอิน, รับของที่ระลึก,
-- etc.). Nullable/backfilled as NULL for existing bookings created before
-- this feature existed — they simply have no QR to show.
ALTER TABLE Bookings ADD COLUMN qr_token TEXT;
CREATE UNIQUE INDEX idx_bookings_qr_token ON Bookings(qr_token) WHERE qr_token IS NOT NULL;

-- Staff-defined action list, scoped per course/event rather than global —
-- one event might need "เช็คอิน" + "รับเสื้อ", another just "เช็คอิน" +
-- "รับอาหารกลางวัน". Saved via delete-all-reinsert on every edit (same
-- convention as Registration_Form_Fields), so `id` isn't stable across
-- saves — Booking_Checkin_Log below stores its own snapshot of the label
-- text at check time so a later action-list edit can't rewrite history.
CREATE TABLE Course_Checkin_Actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES Courses(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- One row per (booking, action) once it's been marked done — absence of a
-- row means "not done yet". label_snapshot preserves what the action was
-- called at the moment it was checked, independent of Course_Checkin_Actions
-- being edited/reordered/deleted later.
CREATE TABLE Booking_Checkin_Log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES Bookings(id) ON DELETE CASCADE,
  action_id INTEGER NOT NULL REFERENCES Course_Checkin_Actions(id) ON DELETE CASCADE,
  label_snapshot TEXT NOT NULL,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  checked_by_crm_user_id INTEGER REFERENCES CRM_Users(id),
  UNIQUE(booking_id, action_id)
);

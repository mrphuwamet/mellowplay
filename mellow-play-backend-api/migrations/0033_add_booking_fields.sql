ALTER TABLE Bookings ADD COLUMN slot_date TEXT;
ALTER TABLE Bookings ADD COLUMN slot_start_time TEXT;
ALTER TABLE Bookings ADD COLUMN payment_status TEXT DEFAULT 'pending';
ALTER TABLE Bookings ADD COLUMN notes TEXT;
ALTER TABLE Bookings ADD COLUMN beam_session_id TEXT;

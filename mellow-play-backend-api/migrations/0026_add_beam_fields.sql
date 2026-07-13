ALTER TABLE Bookings ADD COLUMN beam_session_id TEXT;
ALTER TABLE Bookings ADD COLUMN payment_status TEXT DEFAULT 'pending';

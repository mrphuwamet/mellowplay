-- Link teaching staff directly to booking (previously only in Transactions)
ALTER TABLE Bookings ADD COLUMN teaching_staff_id INTEGER REFERENCES CRM_Users(id);

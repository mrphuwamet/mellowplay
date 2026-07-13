-- Void support for Transactions
ALTER TABLE Transactions ADD COLUMN is_voided  INTEGER  DEFAULT 0;
ALTER TABLE Transactions ADD COLUMN void_reason TEXT;
ALTER TABLE Transactions ADD COLUMN voided_at  DATETIME;
ALTER TABLE Transactions ADD COLUMN booking_id INTEGER;

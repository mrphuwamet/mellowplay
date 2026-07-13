ALTER TABLE Promotions ADD COLUMN applicable_service_ids JSON DEFAULT '[]';
ALTER TABLE Promotions ADD COLUMN consumer_label TEXT;

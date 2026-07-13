-- Link service queue items to POS orders for payment tracking
ALTER TABLE Service_Queue_Items ADD COLUMN order_id INTEGER REFERENCES Orders(id);
ALTER TABLE Service_Queue_Items ADD COLUMN payment_status TEXT DEFAULT 'unpaid'; -- 'unpaid' | 'paid'

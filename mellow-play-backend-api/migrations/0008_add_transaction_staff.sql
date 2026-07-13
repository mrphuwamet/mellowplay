ALTER TABLE Transactions ADD COLUMN sales_staff_id INTEGER;
ALTER TABLE Transactions ADD COLUMN teaching_staff_id INTEGER;
ALTER TABLE Transactions ADD COLUMN service_id INTEGER;
ALTER TABLE Transactions ADD COLUMN package_id INTEGER;
ALTER TABLE Transactions ADD COLUMN course_id INTEGER;

INSERT OR IGNORE INTO System_Settings (key, value, description) VALUES
('operational_fee_type', 'percent', 'ประเภทค่าปฏิบัติงาน: percent หรือ fixed'),
('operational_fee_value', '10', 'ค่าปฏิบัติงานต่อ session (% หรือจำนวนบาท)');

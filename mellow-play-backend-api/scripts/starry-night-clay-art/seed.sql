-- Idempotent seed for "Starry Night Clay Art" — safe to re-run, each statement is a no-op if its row already exists.

-- 1) Dedicated calendar for this course (type='class'), matching the My Fantasy Globe pattern.
INSERT INTO Calendars (name, description, color, type, branch_id, is_active)
SELECT 'Starry Night Clay Art', '', '#db2777', 'class', NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM Calendars WHERE name = 'Starry Night Clay Art' AND type = 'class');

-- 2) The course itself — draft (visibility='hidden', is_visible=0) until explicitly published.
INSERT INTO Courses (
  category_id, calendar_id, code, name, name_en, description, description_en,
  short_description, short_description_en, branch_ids, location, location_label, location_link,
  age_min, age_max, duration, original_price, premium_price, coupon_count,
  achievement_skills_json, metrics_json, coupon_requirements_json,
  is_recommended, is_extraclass, allow_repeat, stamps_on_completion, stamp_expiry_months,
  is_little_junior_enabled, duration_little_junior, coupon_little_junior, original_price_little_junior, premium_price_little_junior,
  is_junior_enabled, duration_junior, coupon_junior, original_price_junior, premium_price_junior,
  thumbnail_url, images_json, video_url, teacher_guide_url,
  sales_commission_type, sales_commission_value, teacher_commission_type, teacher_commission_value,
  detail_poster_url, is_event, is_service, limit_one_per_parent, registration_form_id, registration_close_at,
  sms_success_enabled, sms_success_template, sms_reminder_template,
  email_success_enabled, email_success_subject, email_success_template,
  is_visible, confirmation_channel_mode, visibility
)
SELECT
  1, (SELECT id FROM Calendars WHERE name = 'Starry Night Clay Art' AND type = 'class'), NULL, 'Starry Night Clay Art', 'Starry Night Clay Art',
  '<p>มาปั้นภาพระดับโลก "The Starry Night" ของ Van Gogh ด้วยดินเบากันค่ะ 🌙 เด็กๆ จะได้ลงมือม้วนเส้นดิน ผสมสี และสร้างท้องฟ้าหมุนวนให้เป็นผลงานของตัวเอง แล้วต่อด้วยช่วงสนุกที่สุดของคลาส คือการเป็นพิธีกรตัวน้อย พรีเซนต์ผลงานหน้ากล้อง โดยมีทีม Production ขนกล้อง ไฟ ฉาก มาถ่ายทำเหมือนรายการทีวีจริงๆ 🎬</p><p><strong>คลาสนี้เน้นให้ลูกได้เรียนรู้ผ่านการลงมือทำ</strong> ไม่ใช่แค่ทำตามแบบ และได้ฝึกพูดพรีเซนต์ผลงานอย่างมั่นใจ</p><h2>ลูกจะได้ฝึกอะไรบ้าง</h2><ul><li><p>🎨 <strong>ทักษะศิลปะ:</strong> ม้วนเส้นดินเบา ผสมและไล่น้ำหนักสี สร้างพื้นผิวและมิติให้ชิ้นงาน</p></li><li><p>🧠 <strong>ทักษะการคิด:</strong> สังเกตภาพ วางแผน และตัดสินใจเลือกสีเลือกองค์ประกอบด้วยตัวเอง</p></li><li><p>✋ <strong>สมาธิและกล้ามเนื้อมัดเล็ก:</strong> ค่อยๆ ทำงานละเอียดอย่างต่อเนื่อง</p></li><li><p>🎤 <strong>ทักษะการนำเสนอ:</strong> เล่าเรื่องผลงานให้น่าฟัง ใช้น้ำเสียง สีหน้า ท่าทาง และมองกล้องอย่างมั่นใจ</p></li></ul><h2>สิ่งที่ลูกจะได้กลับบ้าน</h2><ul><li><p>🖼️ ผลงาน Clay Art Starry Night ฝีมือตัวเอง</p></li><li><p>📹 คลิปวิดีโอพรีเซนต์ผลงานที่ตัดต่อเรียบร้อยแล้ว</p></li></ul><h2>ก่อนมาร่วมคลาส</h2><ul><li><p>ผลงานดินเบาต้องใช้เวลาแห้งสนิทหลังจบคลาส ทีมงานจะแนะนำวิธีเก็บรักษาให้ค่ะ</p></li><li><p>ทีมงานจะถ่ายภาพและวิดีโอระหว่างคลาสเพื่อประชาสัมพันธ์ ถ้าไม่สะดวกให้เผยแพร่ภาพของลูก แจ้งทีมงานล่วงหน้าได้เลยค่ะ</p></li><li><p>แนะนำให้มาถึงก่อนเวลา 10-15 นาที</p></li><li><p>การยกเลิก/เปลี่ยนรอบเป็นไปตามนโยบายของ Mellow Play สอบถามเพิ่มเติมได้ที่ Line: <strong>@mellowplay</strong></p></li></ul>', NULL,
  'ปั้นดาว ปั้นฝัน ปั้นความมั่นใจ — Clay Art Class สำหรับศิลปินตัวน้อย', NULL,
  '["1"]', 'Work Work ชั้น 5 Central Chidlom', NULL, 'https://share.google/qVRjwbTwfCtEQcuf9',
  7, 9, '01:30', 1290, 1290, 0,
  '[{"th":"ทักษะศิลปะ","en":"Artistic Skills","icon":"ColorLens","color":"#7452d6"},{"th":"ทักษะการคิด","en":"Critical Thinking","icon":"Lightbulb","color":"#7452d6"},{"th":"สมาธิและกล้ามเนื้อมัดเล็ก","en":"Focus & Fine Motor Skills","icon":"PanTool","color":"#7452d6"},{"th":"ทักษะการนำเสนอ","en":"Presentation & Communication Skills","icon":"RecordVoiceOver","color":"#7452d6"}]', NULL, '[]',
  0, 1, 0, 1, 12,
  1, '01:30', 0, 1290, 1290,
  1, '01:30', 0, 1290, 1290,
  '', '[]', '', '',
  'percent', 0, 'percent', 0,
  '', 0, 0, 0, NULL, NULL,
  1, 'ขอบคุณที่จองคลาส Starry Night Clay Art กับ Mellow Play ค่ะ ชื่อผู้เรียน {{child_name}} รอบ {{scheduled_at}} ที่ {{location}} ยอดชำระ {{amount}} บาท มาก่อนเวลา 10-15 นาทีนะคะ สอบถาม Line @mellowplay', 'พรุ่งนี้แล้วนะคะ! คลาส Starry Night Clay Art ของ {{child_name}} รอบ {{scheduled_at}} ที่ Work Work ชั้น 5 Central Chidlom ควรมาถึงก่อนเวลา 10-15 นาที Line: @mellowplay',
  1, 'ยืนยันการจองคลาส Starry Night Clay Art | Mellow Play', '<p>ขอบคุณที่จองคลาส <strong>Starry Night Clay Art</strong> กับ Mellow Play ค่ะ 🌙</p><p>ชื่อผู้เรียน: {{child_name}}<br>รอบ: {{scheduled_at}}<br>สถานที่: {{location}}<br>ยอดชำระ: {{amount}} บาท</p><p>มาถึงก่อนเวลา 10-15 นาทีนะคะ</p>{{qr_code}}<p>สอบถามเพิ่มเติม Line: @mellowplay</p>',
  0, 'both', 'hidden'
WHERE NOT EXISTS (SELECT 1 FROM Courses WHERE name = 'Starry Night Clay Art');

-- 3) Two rounds, 24 seats each, independent capacity.
INSERT INTO Calendar_Slot_Rules (calendar_id, day_of_week, specific_date, start_time, end_time, max_capacity, valid_from, valid_until, is_active, invite_capacity, label)
SELECT (SELECT id FROM Calendars WHERE name = 'Starry Night Clay Art' AND type = 'class'), NULL, '2026-12-12', '10:30', '12:00', 24, '2026-12-12', '2026-12-12', 1, 0, 'รอบเช้า'
WHERE NOT EXISTS (
  SELECT 1 FROM Calendar_Slot_Rules
  WHERE calendar_id = (SELECT id FROM Calendars WHERE name = 'Starry Night Clay Art' AND type = 'class')
    AND specific_date = '2026-12-12' AND start_time = '10:30'
);

INSERT INTO Calendar_Slot_Rules (calendar_id, day_of_week, specific_date, start_time, end_time, max_capacity, valid_from, valid_until, is_active, invite_capacity, label)
SELECT (SELECT id FROM Calendars WHERE name = 'Starry Night Clay Art' AND type = 'class'), NULL, '2026-12-12', '13:30', '15:00', 24, '2026-12-12', '2026-12-12', 1, 0, 'รอบบ่าย'
WHERE NOT EXISTS (
  SELECT 1 FROM Calendar_Slot_Rules
  WHERE calendar_id = (SELECT id FROM Calendars WHERE name = 'Starry Night Clay Art' AND type = 'class')
    AND specific_date = '2026-12-12' AND start_time = '13:30'
);

-- 4) Early Bird campaign: 1290 - 500 = 790 until the cutoff.
-- valid_until stored as UTC digits for a true 2026-12-04 23:59:59 Asia/Bangkok cutoff
-- (Workers' Date parsing treats a timezone-less string as UTC — see delivery notes).
INSERT INTO Sale_Campaigns (name, description, discount_amount, discount_percent, valid_from, valid_until, applicable_course_ids, applicable_service_ids, consumer_label, is_active)
SELECT 'Early Bird - Starry Night Clay Art', '', 500, 0, NULL, '2026-12-04T16:59',
  '[{"id":' || (SELECT id FROM Courses WHERE name = 'Starry Night Clay Art') || '}]', '[]', 'Early Bird', 1
WHERE NOT EXISTS (SELECT 1 FROM Sale_Campaigns WHERE name = 'Early Bird - Starry Night Clay Art');
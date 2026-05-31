-- Mellow Play Mock Data (Updated for Running Number IDs)
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

-- 1. Branches
INSERT OR IGNORE INTO Branches (id, name, location) VALUES 
(2, 'Mellow Play Sukhumvit', 'Sukhumvit 49, Bangkok'),
(3, 'Mellow Play Bangna', 'Central Bangna, 4th Floor'),
(4, 'Mellow Play Ari', 'Ari Soi 1, G Building');

-- 1.1 Course Categories
INSERT OR IGNORE INTO Course_Categories (id, name, description) VALUES 
(4, 'Sci-Lab', 'Science experiments and logic puzzles.'),
(5, 'Block Builder', 'Construction, geometry, and spatial reasoning.'),
(6, 'Art & Craft', 'Creativity, sensory play, and fine motor skills.');

-- 2. Courses (Single Session with Tiered Pricing)
INSERT OR IGNORE INTO Courses (
  id, category_id, name, description, 
  is_little_junior_enabled, original_price_little_junior, premium_price_little_junior, achievement_skills_little_junior_json, metrics_little_junior_json,
  is_junior_enabled, original_price_junior, premium_price_junior, achievement_skills_junior_json, metrics_junior_json
) VALUES 
(
  4, 4, 'Volcano Eruption', 'Learn about chemical reactions.', 
  1, 2000, 1300, '["Curiosity", "Observation"]', '["Focus"]',
  1, 2500, 1600, '["Chemistry", "Scientific Method"]', '["Analysis", "Observation"]'
),
(
  5, 5, 'Sky-High Tower', 'Balance and structural integrity.', 
  1, 1500, 1000, '["Fine Motor", "Balance"]', '["Patience"]',
  1, 2000, 1300, '["Engineering", "Geometry"]', '["Problem Solving", "Structural Thinking"]'
);

-- 3. Users (Parents)
INSERT OR IGNORE INTO Users (id, phone, email, password_hash, first_name, last_name, phone_verified, membership_expires_at) VALUES 
(2, '0811112222', 'somchai.p@gmail.com', 'hash', 'Somchai', 'Plearnjit', 1, '2026-12-31 23:59:59'),
(3, '0822223333', 'vipa.s@yahoo.com', 'hash', 'Vipa', 'Siriwat', 1, '2025-05-01 12:00:00');

-- 4. HD Profiles & Children
INSERT OR IGNORE INTO HD_Profiles (id, user_id, name, relation, birth_date, hd_type, hd_profile) VALUES 
(2, 2, 'Pete', 'Father', '2020-05-15', 'The Builder', '4/6'),
(3, 2, 'Plearn', 'Father', '2021-11-20', 'The Guide', '1/3');

INSERT OR IGNORE INTO Children (id, parent_id, hd_profile_id, current_level) VALUES 
(2, 2, 2, 4),
(3, 2, 3, 2);

-- 5. Bookings
INSERT OR IGNORE INTO Bookings (id, child_id, course_id, branch_id, scheduled_at, status, age_group) VALUES 
(1, 2, 4, 2, '2026-05-01 10:00:00', 'confirmed', 'junior'),
(2, 3, 5, 3, '2026-05-02 14:00:00', 'confirmed', 'little_junior');

-- 13. CRM Users
INSERT OR IGNORE INTO CRM_Users (id, email, password_hash, full_name, role) VALUES 
(3, 'super@mellow.com', 'hash', 'Super Manager', 'super_admin');

-- 16. Roadmap Nodes
INSERT OR IGNORE INTO Roadmap_Nodes (id, node_order, title, description, required_level) VALUES
(4, 4, 'Advanced Art', 'Complex art techniques.', 2),
(5, 5, 'Robotics 101', 'Intro to simple machines.', 3);

-- 17. Child Journey
INSERT OR IGNORE INTO Child_Journey (id, child_id, node_id, booking_id, skills_learned, teacher_comment) VALUES
(2, 2, 4, 1, '["Painting", "Concentration"]', 'Pete showed great focus during painting.');

COMMIT;
PRAGMA foreign_keys = ON;

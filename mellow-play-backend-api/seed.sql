-- Seed Data for Mellow Play Application
-- Updated for Running Number IDs (Integers)

-- 1. Branches
INSERT OR IGNORE INTO Branches (id, name, location, default_capacity) VALUES 
(1, 'Milk & Mellow Play - เซนทรัล ชิดลม', 'ชั้น 6 โซนเด็ก, Central Chidlom', 4);

-- 2. Categories
INSERT OR IGNORE INTO Course_Categories (id, name, color) VALUES
(1, 'Art & Creativity', '#ef4f55'),
(2, 'Science & Logic', '#7452d6'),
(3, 'Play & Learn', '#3b82f6');

-- 3. Courses (Standardized Durations)
INSERT OR IGNORE INTO Courses (
    id, category_id, code, name, duration_little_junior, duration_junior,
    original_price_little_junior, premium_price_little_junior,
    original_price_junior, premium_price_junior
) VALUES 
(1, 1, 'ART101', 'Creative Art Level 1', 30, 60, 850, 650, 1100, 850),
(2, 2, 'SCI101', 'Little Scientist', 30, 60, 950, 750, 1200, 950),
(3, 3, 'PLY101', 'Play & Learn 101', 60, 60, 1200, 950, 1500, 1200);

-- 4. CRM Users (Password: password123)
INSERT OR IGNORE INTO CRM_Users (id, email, password_hash, full_name, role, branch_id) VALUES
(1, 'admin@mellowplay.com', 'password123', 'Super Admin', 'super_admin', NULL),
(2, 'staff@mellowplay.com', 'password123', 'Staff Chidlom', 'operator', 1);

-- 5. Sample Member & Child
INSERT OR IGNORE INTO Users (id, phone, first_name, last_name, password_hash, phone_verified) VALUES
(1, '0812345678', 'Somchai', 'Jaidee', 'password123', 1);

INSERT OR IGNORE INTO HD_Profiles (id, user_id, name, relation, birth_date) VALUES
(1, 1, 'Nong Meow', 'Father', '2021-05-13');

INSERT OR IGNORE INTO Children (id, parent_id, hd_profile_id) VALUES
(1, 1, 1);

-- 6. Initial Coupons for Sample Child
INSERT OR IGNORE INTO Member_Coupons (id, child_id, little_junior_balance, junior_balance) VALUES
(1, 1, 5, 2);

-- 7. Roadmap Nodes
INSERT OR IGNORE INTO Roadmap_Nodes (id, node_order, title, description, required_level) VALUES
(1, 1, 'Welcome to Mellow Play', 'First session orientation.', 1),
(2, 2, 'Basic Creativity', 'Learning to express through art.', 1),
(3, 3, 'Science Explorer', 'Introduction to simple experiments.', 1);

-- 8. Sample Journey
INSERT OR IGNORE INTO Child_Journey (id, child_id, node_id, skills_learned, teacher_comment) VALUES
(1, 1, 1, '["Focus", "Social"]', 'Nong Meow did great in the first session!');

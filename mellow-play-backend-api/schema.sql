-- Mellow Play Database Schema (Cloudflare D1 / SQLite)
-- Updated for Running Number IDs (INTEGER PRIMARY KEY AUTOINCREMENT) for ALL tables

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS Journey_Media;
DROP TABLE IF EXISTS Child_Journey;
DROP TABLE IF EXISTS Roadmap_Nodes;
DROP TABLE IF EXISTS Transactions;
DROP TABLE IF EXISTS Bookings;
DROP TABLE IF EXISTS Member_Coupons;
DROP TABLE IF EXISTS Daily_Facilitators;
DROP TABLE IF EXISTS Daily_Courses;
DROP TABLE IF EXISTS Time_Slots;
DROP TABLE IF EXISTS Courses;
DROP TABLE IF EXISTS Course_Categories;
DROP TABLE IF EXISTS Branch_Default_Slots;
DROP TABLE IF EXISTS CRM_Users;
DROP TABLE IF EXISTS Branches;
DROP TABLE IF EXISTS Children;
DROP TABLE IF EXISTS HD_Profiles;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Skills_Library;
DROP TABLE IF EXISTS System_Settings;

PRAGMA foreign_keys = ON;

-- 1. Users (Parents/Owners)
CREATE TABLE Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone_verified INTEGER DEFAULT 0,
    membership_expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Human Design Profiles
CREATE TABLE HD_Profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    relation TEXT,
    birth_date DATE NOT NULL,
    birth_time TEXT,
    birth_place TEXT,
    birth_lat REAL,
    birth_lng REAL,
    hd_type TEXT,
    hd_profile TEXT,
    hd_strategy TEXT,
    hd_authority TEXT,
    hd_incarnation_cross TEXT,
    hd_definition TEXT,
    hd_signature TEXT,
    hd_not_self_theme TEXT,
    hd_cognition TEXT,
    hd_determination TEXT,
    hd_variables TEXT,
    hd_motivation TEXT,
    hd_transference TEXT,
    hd_perspective TEXT,
    hd_distraction TEXT,
    hd_environment TEXT,
    hd_circuitries TEXT,
    centers_json TEXT,
    channels_short_json TEXT,
    channels_long_json TEXT,
    gates_json TEXT,
    activations_design_json TEXT,
    activations_personality_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id)
);

-- 2b. CRM-managed children (simple profile for course enrollment, separate from HD_Profiles)
CREATE TABLE User_CRM_Children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    nickname TEXT,
    gender TEXT,
    date_of_birth DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- 2c. User Coupons
CREATE TABLE User_Coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type_id TEXT NOT NULL,
    label TEXT NOT NULL,
    count INTEGER DEFAULT 1,
    expires_at DATE NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- 3. Children
CREATE TABLE Children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NOT NULL,
    hd_profile_id INTEGER UNIQUE NOT NULL,
    current_level INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES Users(id),
    FOREIGN KEY (hd_profile_id) REFERENCES HD_Profiles(id)
);

-- 4. Branches
CREATE TABLE Branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT,
    default_capacity INTEGER DEFAULT 4,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Course Categories
CREATE TABLE Course_Categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    image_url TEXT,
    image_position TEXT DEFAULT '50% 50%',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Courses
CREATE TABLE Courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    code TEXT,
    name TEXT NOT NULL,
    name_en TEXT,
    description TEXT,
    description_en TEXT,

    -- Single-tier fields (new schema)
    age_min REAL DEFAULT 3,
    age_max REAL DEFAULT 9,
    duration TEXT DEFAULT '01:00',
    original_price REAL DEFAULT 0,
    premium_price REAL DEFAULT 0,
    coupon_count INTEGER DEFAULT 1,
    achievement_skills_json TEXT,
    metrics_json TEXT,
    coupon_requirements_json TEXT,

    -- Legacy dual-tier fields (kept for backward compatibility)
    is_little_junior_enabled BOOLEAN DEFAULT 1,
    description_little_junior TEXT,
    description_little_junior_en TEXT,
    duration_little_junior TEXT DEFAULT '01:00',
    coupon_little_junior INTEGER DEFAULT 1,
    original_price_little_junior REAL DEFAULT 0,
    premium_price_little_junior REAL DEFAULT 0,
    achievement_skills_little_junior_json TEXT,
    metrics_little_junior_json TEXT,

    is_junior_enabled BOOLEAN DEFAULT 1,
    description_junior TEXT,
    description_junior_en TEXT,
    duration_junior TEXT DEFAULT '01:00',
    coupon_junior INTEGER DEFAULT 1,
    original_price_junior REAL DEFAULT 0,
    premium_price_junior REAL DEFAULT 0,
    achievement_skills_junior_json TEXT,
    metrics_junior_json TEXT,

    thumbnail_url TEXT,
    images_json TEXT,
    video_url TEXT,
    teacher_guide_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES Course_Categories(id)
);

-- 7. Time Slots (Branch Daily Opening Hours)
CREATE TABLE Time_Slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    label TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES Branches(id)
);

-- 8. Daily Courses (Active subjects for the day)
CREATE TABLE Daily_Courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    course_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES Branches(id),
    FOREIGN KEY (course_id) REFERENCES Courses(id)
);

-- 9. Daily Facilitators
CREATE TABLE Daily_Facilitators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    facilitator_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES Branches(id),
    FOREIGN KEY (facilitator_id) REFERENCES CRM_Users(id)
);

-- 10. Member Coupons (Per Child)
CREATE TABLE Member_Coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL UNIQUE,
    little_junior_balance INTEGER DEFAULT 0,
    junior_balance INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (child_id) REFERENCES Children(id)
);

-- 11. Bookings
CREATE TABLE Bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    scheduled_at DATETIME NOT NULL, -- YYYY-MM-DD HH:mm
    age_group TEXT NOT NULL, -- 'little_junior', 'junior'
    status TEXT DEFAULT 'confirmed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES Courses(id),
    FOREIGN KEY (branch_id) REFERENCES Branches(id)
);

-- 12. Transactions
CREATE TABLE Transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    user_id INTEGER,
    child_id INTEGER,
    type TEXT NOT NULL, -- 'topup', 'guest_sale'
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL, -- 'cash', 'transfer', 'credit_card'
    item_type TEXT, -- 'little_junior', 'junior'
    quantity INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES Branches(id),
    FOREIGN KEY (user_id) REFERENCES Users(id),
    FOREIGN KEY (child_id) REFERENCES Children(id)
);

-- 13. CRM Users
CREATE TABLE CRM_Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    branch_id INTEGER,
    phone TEXT,
    national_id TEXT,
    address TEXT,
    salary REAL,
    start_date DATE,
    department TEXT,
    position TEXT,
    employment_type TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES Branches(id)
);

-- 14. Branch Default Slots
CREATE TABLE Branch_Default_Slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES Branches(id)
);

-- 15. Skills Library
CREATE TABLE Skills_Library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'Art', 'Science', etc.
    icon TEXT,
    color TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 16. Roadmap Nodes
CREATE TABLE Roadmap_Nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    required_level INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 17. Child Journey (Milestones)
CREATE TABLE Child_Journey (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    booking_id INTEGER,
    skills_learned TEXT, -- JSON array of skill names or IDs
    teacher_comment TEXT,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (child_id) REFERENCES Children(id),
    FOREIGN KEY (node_id) REFERENCES Roadmap_Nodes(id),
    FOREIGN KEY (booking_id) REFERENCES Bookings(id)
);

-- 18. Journey Media
CREATE TABLE Journey_Media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journey_id INTEGER NOT NULL,
    media_url TEXT NOT NULL,
    media_type TEXT DEFAULT 'image', -- 'image', 'video'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (journey_id) REFERENCES Child_Journey(id)
);

-- 19. System Settings
CREATE TABLE System_Settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed Settings
INSERT OR IGNORE INTO System_Settings (key, value, description) VALUES ('otp_enabled', '0', 'Set to 1 to enable real SMS sending');

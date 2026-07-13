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
    line_id TEXT,
    pdpa_consent BOOLEAN DEFAULT 0,
    marketing_consent BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Human Design Profiles
CREATE TABLE HD_Profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    nickname TEXT,
    gender TEXT,
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
    is_recommended BOOLEAN DEFAULT 0,
    is_extraclass BOOLEAN DEFAULT 0,

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
    capacity INTEGER DEFAULT 20,
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
    capacity INTEGER DEFAULT 20,
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
    coupon_requirements_json TEXT,
    is_recommended BOOLEAN DEFAULT 0,
    is_extraclass BOOLEAN DEFAULT 0,

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
    capacity INTEGER DEFAULT 20,
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
    capacity INTEGER DEFAULT 20,
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

-- 20. Packages
CREATE TABLE IF NOT EXISTS Packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    coupons_json TEXT,
    premium_days INTEGER DEFAULT 0,
    seller_commission_type TEXT DEFAULT 'percent',
    seller_commission_value REAL DEFAULT 0,
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 21. Campaign Bonuses
CREATE TABLE IF NOT EXISTS Campaign_Bonuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    target_value REAL NOT NULL,
    bonus_type TEXT NOT NULL,
    bonus_value REAL NOT NULL,
    month INTEGER,
    year INTEGER,
    for_roles_json TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 22. Diligence Rules
CREATE TABLE IF NOT EXISTS Diligence_Rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    conditions_json TEXT,
    bonus_amount REAL NOT NULL,
    for_roles_json TEXT,
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 23. Attendance Records
CREATE TABLE IF NOT EXISTS Attendance_Records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crm_user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (crm_user_id) REFERENCES CRM_Users(id)
);

-- 24. Leave Requests
CREATE TABLE IF NOT EXISTS Leave_Requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crm_user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    days REAL NOT NULL,
    reason TEXT,
    is_paid BOOLEAN DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (crm_user_id) REFERENCES CRM_Users(id)
);

-- 25. Expense Advances
CREATE TABLE IF NOT EXISTS Expense_Advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crm_user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT,
    description TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (crm_user_id) REFERENCES CRM_Users(id)
);

-- 26. Payouts
CREATE TABLE IF NOT EXISTS Payouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crm_user_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    incentive REAL DEFAULT 0,
    ot_hours REAL DEFAULT 0,
    ot_rate REAL DEFAULT 0,
    expense REAL DEFAULT 0,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (crm_user_id) REFERENCES CRM_Users(id)
);

-- 27. Leave Policies
CREATE TABLE IF NOT EXISTS Leave_Policies (
    employee_type TEXT PRIMARY KEY,
    annual_days REAL DEFAULT 0,
    sick_days REAL DEFAULT 0,
    personal_days REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 28. Sale Campaigns
CREATE TABLE IF NOT EXISTS Sale_Campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    discount_amount REAL DEFAULT 0,
    discount_percent REAL DEFAULT 0,
    valid_from DATETIME,
    valid_until DATETIME,
    applicable_course_ids JSON DEFAULT '[]',
    applicable_service_ids JSON DEFAULT '[]',
    consumer_label TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
- -   S e r v i c e   C a t e g o r i e s  
 C R E A T E   T A B L E   S e r v i c e _ C a t e g o r i e s   (  
         i d   I N T E G E R   P R I M A R Y   K E Y   A U T O I N C R E M E N T ,  
         n a m e   T E X T   N O T   N U L L ,  
         c o l o r   T E X T   D E F A U L T   ' # 7 4 5 2 d 6 ' ,  
         c r e a t e d _ a t   D A T E T I M E   D E F A U L T   C U R R E N T _ T I M E S T A M P  
 ) ;  
  
 - -   S e r v i c e s  
 C R E A T E   T A B L E   S e r v i c e s   (  
         i d   I N T E G E R   P R I M A R Y   K E Y   A U T O I N C R E M E N T ,  
         n a m e   T E X T   N O T   N U L L ,  
         c a t e g o r y _ i d   I N T E G E R ,  
         d e s c r i p t i o n   T E X T ,  
         p r i c e   R E A L   D E F A U L T   0 ,  
         d u r a t i o n _ m i n   I N T E G E R   D E F A U L T   3 0 ,  
         c o m m i s s i o n _ t y p e   T E X T   D E F A U L T   ' p e r c e n t ' ,  
         c o m m i s s i o n _ v a l u e   R E A L ,  
         a c t i v e   B O O L E A N   D E F A U L T   1 ,  
         c r e a t e d _ a t   D A T E T I M E   D E F A U L T   C U R R E N T _ T I M E S T A M P ,  
         F O R E I G N   K E Y   ( c a t e g o r y _ i d )   R E F E R E N C E S   S e r v i c e _ C a t e g o r i e s ( i d )  
 ) ;  
  
 - -   P r o d u c t   C a t e g o r i e s  
 C R E A T E   T A B L E   P r o d u c t _ C a t e g o r i e s   (  
         i d   I N T E G E R   P R I M A R Y   K E Y   A U T O I N C R E M E N T ,  
         n a m e   T E X T   N O T   N U L L ,  
         c o l o r   T E X T   D E F A U L T   ' # 7 4 5 2 d 6 ' ,  
         c r e a t e d _ a t   D A T E T I M E   D E F A U L T   C U R R E N T _ T I M E S T A M P  
 ) ;  
  
 - -   P r o d u c t s  
 C R E A T E   T A B L E   P r o d u c t s   (  
         i d   I N T E G E R   P R I M A R Y   K E Y   A U T O I N C R E M E N T ,  
         n a m e   T E X T   N O T   N U L L ,  
         c a t e g o r y _ i d   I N T E G E R ,  
         d e s c r i p t i o n   T E X T ,  
         p r i c e   R E A L   D E F A U L T   0 ,  
         c o s t _ p r i c e   R E A L   D E F A U L T   0 ,  
         b a r c o d e   T E X T ,  
         a c t i v e   B O O L E A N   D E F A U L T   1 ,  
         t r a c k _ s t o c k   B O O L E A N   D E F A U L T   1 ,  
         s t o c k _ q u a n t i t y   I N T E G E R   D E F A U L T   0 ,  
         c r e a t e d _ a t   D A T E T I M E   D E F A U L T   C U R R E N T _ T I M E S T A M P ,  
         F O R E I G N   K E Y   ( c a t e g o r y _ i d )   R E F E R E N C E S   P r o d u c t _ C a t e g o r i e s ( i d )  
 ) ;  
  
 - -   S t o c k   M o v e m e n t s  
 C R E A T E   T A B L E   S t o c k _ M o v e m e n t s   (  
         i d   I N T E G E R   P R I M A R Y   K E Y   A U T O I N C R E M E N T ,  
         p r o d u c t _ i d   I N T E G E R   N O T   N U L L ,  
         t y p e   T E X T   N O T   N U L L ,   - -   ' I N ' ,   ' O U T ' ,   ' A D J U S T '  
         q u a n t i t y   I N T E G E R   N O T   N U L L ,  
         n o t e   T E X T ,  
         c r e a t e d _ a t   D A T E T I M E   D E F A U L T   C U R R E N T _ T I M E S T A M P ,  
         F O R E I G N   K E Y   ( p r o d u c t _ i d )   R E F E R E N C E S   P r o d u c t s ( i d )  
 ) ;  
 
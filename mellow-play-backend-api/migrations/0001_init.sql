-- ============================================================
-- Migration 0000: Full Database Initialization
-- Mellow Play Database (Cloudflare D1 / SQLite)
-- This migration creates ALL tables from scratch.
-- All subsequent migrations (0001+) are safe to re-run.
-- ============================================================

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    prefix TEXT,
    first_name TEXT,
    last_name TEXT,
    dob DATE,
    phone_verified INTEGER DEFAULT 0,
    membership_expires_at DATETIME,
    membership_type TEXT DEFAULT 'standard',
    relationship TEXT,
    line_id TEXT,
    pdpa_consent BOOLEAN DEFAULT 0,
    marketing_consent BOOLEAN DEFAULT 0,
    address TEXT,
    application_date DATETIME,
    profile_image_url TEXT,
    google_id TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── HD Profiles ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS HD_Profiles (
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

-- ── User CRM Children ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS User_CRM_Children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    nickname TEXT,
    gender TEXT,
    date_of_birth DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- ── User Coupons ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS User_Coupons (
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

-- ── Children ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NOT NULL,
    hd_profile_id INTEGER UNIQUE NOT NULL,
    avatar TEXT, -- currently active avatar: a character key (e.g. 'char-1') or a photo URL
    -- The uploaded photo persists here independently of `avatar` so switching
    -- to a character and back doesn't lose it; only an explicit delete clears it.
    custom_photo_url TEXT,
    current_level INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES Users(id),
    FOREIGN KEY (hd_profile_id) REFERENCES HD_Profiles(id)
);

-- ── Branches ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    location TEXT,
    location_link TEXT,
    map_embed_url TEXT,
    phone TEXT,
    default_capacity INTEGER DEFAULT 4,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Course Categories ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Course_Categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT,
    image_url TEXT,
    image_position TEXT DEFAULT '50% 50%',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Courses ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    calendar_id INTEGER,
    code TEXT,
    name TEXT NOT NULL,
    name_en TEXT,
    description TEXT,
    description_en TEXT,
    short_description TEXT,
    short_description_en TEXT,
    branch_ids TEXT DEFAULT '[]',
    location TEXT,
    location_label TEXT,
    location_link TEXT,

    -- Single-tier fields
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
    -- Independent of is_extraclass: whether the same child can register for
    -- this course more than once. Decoupled so an admin can mark a specific
    -- one-off event as non-repeatable without that being automatically
    -- inferred from the Extra Class flag (and vice versa).
    allow_repeat BOOLEAN DEFAULT 1,

    -- Stamps awarded to the child once a booking for this course is marked
    -- completed. stamp_expiry_months is rounded up to the nearest half-year
    -- boundary (Jun 30 / Dec 31) when the actual Stamps row is created.
    stamps_on_completion INTEGER DEFAULT 0,
    stamp_expiry_months INTEGER DEFAULT 12,

    -- Legacy dual-tier fields
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

-- ── Time Slots ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Time_Slots (
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

-- ── Daily Courses ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Daily_Courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    course_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES Branches(id),
    FOREIGN KEY (course_id) REFERENCES Courses(id)
);

-- ── Daily Facilitators ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Daily_Facilitators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    facilitator_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES Branches(id),
    FOREIGN KEY (facilitator_id) REFERENCES CRM_Users(id)
);

-- ── Member Coupons ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Member_Coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL UNIQUE,
    little_junior_balance INTEGER DEFAULT 0,
    junior_balance INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (child_id) REFERENCES Children(id)
);

-- ── Bookings ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    branch_id INTEGER NOT NULL,
    calendar_id INTEGER,
    scheduled_at DATETIME NOT NULL,
    slot_date TEXT,
    slot_start_time TEXT,
    age_group TEXT NOT NULL,
    status TEXT DEFAULT 'confirmed_paid',
    payment_status TEXT DEFAULT 'paid',
    payment_method TEXT DEFAULT 'coupon',
    order_id INTEGER,
    notes TEXT,
    teaching_staff_id INTEGER,
    beam_session_id TEXT,
    -- Set only via the Super Admin force-status tool (adminController.updateBookingStatus)
    -- for correcting payment-status errors after the fact; not written by the normal
    -- payment/booking flow.
    paid_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES Courses(id),
    FOREIGN KEY (branch_id) REFERENCES Branches(id)
);

-- ── Transactions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    user_id INTEGER,
    child_id INTEGER,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    item_type TEXT,
    quantity INTEGER DEFAULT 1,
    sales_staff_id INTEGER,
    teaching_staff_id INTEGER,
    service_id INTEGER,
    package_id INTEGER,
    course_id INTEGER,
    booking_id INTEGER,
    is_voided INTEGER DEFAULT 0,
    void_reason TEXT,
    voided_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES Branches(id),
    FOREIGN KEY (user_id) REFERENCES Users(id),
    FOREIGN KEY (child_id) REFERENCES Children(id)
);

-- ── CRM Users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS CRM_Users (
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

-- ── Branch Default Slots ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Branch_Default_Slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    capacity INTEGER DEFAULT 20,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES Branches(id)
);

-- ── Skills Library ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Skills_Library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_en TEXT,
    type TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Roadmap Nodes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Roadmap_Nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_order INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    required_level INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Child Journey ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Child_Journey (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    -- Nullable: RecordMilestone.tsx (CRM) records reports per-course (skills
    -- from Courses.achievement_skills_json), not against Roadmap_Nodes, which
    -- has no seed/management data. node_title falls back to the booking's
    -- course name when this is absent.
    node_id INTEGER,
    booking_id INTEGER,
    skills_learned TEXT,
    teacher_comment TEXT,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (child_id) REFERENCES Children(id),
    FOREIGN KEY (node_id) REFERENCES Roadmap_Nodes(id),
    FOREIGN KEY (booking_id) REFERENCES Bookings(id)
);

-- ── Journey Media ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Journey_Media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journey_id INTEGER NOT NULL,
    media_url TEXT NOT NULL,
    media_type TEXT DEFAULT 'image',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (journey_id) REFERENCES Child_Journey(id)
);

-- ── System Settings ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS System_Settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Calendars ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Calendars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#7452d6',
    type TEXT DEFAULT 'course',
    branch_id INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES Branches(id)
);

-- ── Calendar Slot Rules ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Calendar_Slot_Rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    calendar_id INTEGER NOT NULL,
    day_of_week INTEGER,
    specific_date TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    max_capacity INTEGER DEFAULT 4,
    valid_from TEXT,
    valid_until TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (calendar_id) REFERENCES Calendars(id)
);

-- ── Calendar Holidays ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Calendar_Holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    calendar_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (calendar_id) REFERENCES Calendars(id)
);

-- ── Service Queue Items ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Service_Queue_Items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    customer_name TEXT,
    phone TEXT,
    service_id INTEGER,
    service_name TEXT,
    staff_id INTEGER,
    staff_name TEXT,
    status TEXT DEFAULT 'waiting',
    notes TEXT,
    order_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES Branches(id)
);

-- ── Orders ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch_id INTEGER NOT NULL,
    user_id INTEGER,
    customer_name TEXT,
    phone TEXT,
    status TEXT DEFAULT 'pending',
    subtotal REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    total REAL DEFAULT 0,
    payment_method TEXT,
    payment_status TEXT DEFAULT 'unpaid',
    promotion_id INTEGER,
    sale_campaign_id INTEGER,
    staff_id INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES Branches(id)
);

-- ── Order Items ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Order_Items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    item_id INTEGER,
    item_name TEXT,
    quantity INTEGER DEFAULT 1,
    unit_price REAL DEFAULT 0,
    subtotal REAL DEFAULT 0,
    FOREIGN KEY (order_id) REFERENCES Orders(id)
);

-- ── Course Materials ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Course_Materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content_type TEXT DEFAULT 'text',
    content_url TEXT,
    content_body TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES Courses(id)
);

-- ── Course Image Views ──────────────────────────────────────────────────────
-- Per-course, per-display-context (see src/constants/imageViews.ts) image
-- assignment + focal point. One row per (course_id, view_key). Any view a
-- course hasn't configured falls back to thumbnail_url + a centered focal
-- point (50, 50) at read time — see adminController.getCourses.
CREATE TABLE IF NOT EXISTS Course_Image_Views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    view_key TEXT NOT NULL,
    image_url TEXT NOT NULL,
    focal_x REAL NOT NULL DEFAULT 50,
    focal_y REAL NOT NULL DEFAULT 50,
    zoom REAL NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES Courses(id),
    UNIQUE(course_id, view_key)
);

-- ── Course Image Focals ─────────────────────────────────────────────────────
-- Per-image focal point (0-100, 0-100) for the Consumer app's swipeable 4:5
-- poster gallery on the course-detail page — every uploaded image (thumbnail
-- + gallery) gets its own row here, unlike Course_Image_Views above which
-- assigns exactly one curated image per (course_id, view_key). Any image
-- without a row falls back to a centered focal point (50, 50).
CREATE TABLE IF NOT EXISTS Course_Image_Focals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    focal_x REAL NOT NULL DEFAULT 50,
    focal_y REAL NOT NULL DEFAULT 50,
    zoom REAL NOT NULL DEFAULT 1,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES Courses(id),
    UNIQUE(course_id, image_url)
);

-- ── Stock Reservations ────────────────────────────────────────────────────────
-- Tracks per-booking course-material stock reservations: created when a
-- booking is made (status='pending'), deducted from Products.current_stock
-- when the class completes (status='deducted'), or released back if the
-- booking is cancelled (status='released').
CREATE TABLE IF NOT EXISTS Stock_Reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES Bookings(id),
    FOREIGN KEY (product_id) REFERENCES Products(id)
);

-- ── Coupon Types ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS CouponTypes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#A78BFA',
    icon_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Child Coupons ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ChildCoupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    coupon_type_id INTEGER NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    total_earned INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (child_id) REFERENCES Children(id) ON DELETE CASCADE,
    FOREIGN KEY (coupon_type_id) REFERENCES CouponTypes(id) ON DELETE CASCADE,
    UNIQUE(child_id, coupon_type_id)
);

-- ── Course Coupons ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS CourseCoupons (
    course_id INTEGER NOT NULL,
    coupon_type_id INTEGER NOT NULL,
    quantity_required INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (course_id, coupon_type_id),
    FOREIGN KEY (course_id) REFERENCES Courses(id) ON DELETE CASCADE,
    FOREIGN KEY (coupon_type_id) REFERENCES CouponTypes(id) ON DELETE CASCADE
);

-- ── Promotions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    discount_amount REAL DEFAULT 0,
    discount_percent REAL DEFAULT 0,
    max_uses INTEGER DEFAULT 0,
    current_uses INTEGER DEFAULT 0,
    valid_from DATETIME,
    valid_until DATETIME,
    applicable_course_ids JSON DEFAULT '[]',
    applicable_service_ids JSON DEFAULT '[]',
    consumer_label TEXT,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Redemptions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    reward_id INTEGER,
    reward_name TEXT,
    stamp_cost INTEGER DEFAULT 1,
    claim_code TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (child_id) REFERENCES Children(id)
);

-- ── Rewards ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    stamp_cost INTEGER NOT NULL DEFAULT 1,
    stock INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Stamps ────────────────────────────────────────────────────────────────────
-- Individual stamp ledger (one row per stamp) so each stamp can be masked
-- independently as used/expired, unlike the aggregate ChildCoupons.balance.
CREATE TABLE IF NOT EXISTS Stamps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    booking_id INTEGER,
    course_id INTEGER,
    earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    status TEXT DEFAULT 'available', -- 'available' | 'used' | 'expired'
    used_at DATETIME,
    redemption_id INTEGER,
    FOREIGN KEY (child_id) REFERENCES Children(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES Bookings(id),
    FOREIGN KEY (course_id) REFERENCES Courses(id),
    FOREIGN KEY (redemption_id) REFERENCES Redemptions(id)
);

-- CRM-configurable: which stamp image applies to a given range of stamp
-- positions (1-indexed by earn order), e.g. stamps #1-10 use image A.
CREATE TABLE IF NOT EXISTS Stamp_Image_Ranges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    range_start INTEGER NOT NULL,
    range_end INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Course Views (lightweight click/view analytics for the funnel) ────────────
CREATE TABLE IF NOT EXISTS Course_Views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    child_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES Courses(id)
);

-- ── Course Reviews (customer rating + feedback, surfaced in CourseManagement) ─
CREATE TABLE IF NOT EXISTS Course_Reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    child_id INTEGER NOT NULL,
    booking_id INTEGER,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES Courses(id),
    FOREIGN KEY (child_id) REFERENCES Children(id),
    FOREIGN KEY (booking_id) REFERENCES Bookings(id)
);

-- ── System Logs ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS System_Logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL,
    source TEXT,
    message TEXT NOT NULL,
    stack_trace TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Sale Campaigns ────────────────────────────────────────────────────────────
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

-- ── Packages ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL DEFAULT 0,
    coupons_json TEXT DEFAULT '[]',
    premium_days INTEGER DEFAULT 0,
    seller_commission_type TEXT DEFAULT 'percent',
    seller_commission_value REAL DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Self-service online purchases of a Package (paid via Beam), distinct from
-- posProcessPackageSale's in-person/POS flow — this is the staging row the
-- Beam webhook flips to 'paid' and uses to credit ChildCoupons.
CREATE TABLE IF NOT EXISTS Package_Purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER NOT NULL,
    child_id INTEGER NOT NULL,
    user_id INTEGER,
    amount REAL NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending', -- 'pending' | 'paid' | 'cancelled'
    payment_method TEXT,
    beam_session_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (package_id) REFERENCES Packages(id),
    FOREIGN KEY (child_id) REFERENCES Children(id)
);

-- ── Campaign Bonuses ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Campaign_Bonuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    target_value REAL NOT NULL DEFAULT 0,
    bonus_type TEXT NOT NULL DEFAULT 'fixed',
    bonus_value REAL NOT NULL DEFAULT 0,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    for_roles_json TEXT DEFAULT '[]',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Diligence Rules ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Diligence_Rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    conditions_json TEXT DEFAULT '[]',
    bonus_amount REAL NOT NULL DEFAULT 0,
    for_roles_json TEXT DEFAULT '[]',
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Service Categories ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Service_Categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#7452d6',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Services ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER,
    description TEXT,
    price REAL NOT NULL DEFAULT 0,
    duration_min INTEGER DEFAULT 30,
    commission_type TEXT DEFAULT 'percent',
    commission_value TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES Service_Categories(id)
);

-- ── Product Categories ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Product_Categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#7452d6',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Products ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category_id INTEGER,
    description TEXT,
    sell_price REAL NOT NULL DEFAULT 0,
    cost_price REAL NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'ชิ้น',
    min_stock INTEGER DEFAULT 5,
    current_stock INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES Product_Categories(id)
);

-- ── Stock Transactions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Stock_Transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    qty INTEGER NOT NULL,
    qty_after INTEGER NOT NULL,
    note TEXT,
    date TEXT NOT NULL,
    staff_id INTEGER,
    staff_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES Products(id)
);

-- ── Attendance Records ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Attendance_Records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crm_user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(crm_user_id, date),
    FOREIGN KEY (crm_user_id) REFERENCES CRM_Users(id)
);

-- ── Leave Requests ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Leave_Requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crm_user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    days INTEGER NOT NULL DEFAULT 1,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    approver_note TEXT,
    is_paid INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (crm_user_id) REFERENCES CRM_Users(id)
);

-- ── Leave Policies ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Leave_Policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_type TEXT NOT NULL UNIQUE,
    annual_days INTEGER DEFAULT 10,
    sick_days INTEGER DEFAULT 30,
    personal_days INTEGER DEFAULT 3,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Expense Advances ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS Expense_Advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    crm_user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT,
    description TEXT,
    note TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (crm_user_id) REFERENCES CRM_Users(id)
);

-- ── Payouts ───────────────────────────────────────────────────────────────────
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
    paid_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (crm_user_id) REFERENCES CRM_Users(id)
);

-- ── Seed Data ─────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO System_Settings (key, value, description)
VALUES ('otp_enabled', '0', 'Set to 1 to enable real SMS sending');

INSERT OR IGNORE INTO System_Settings (key, value, description)
VALUES ('payment_enabled', '0', 'Set to 1 to enable real Payment by beam');

INSERT OR IGNORE INTO Leave_Policies (employee_type, annual_days, sick_days, personal_days)
VALUES ('monthly', 10, 30, 3);

INSERT OR IGNORE INTO Leave_Policies (employee_type, annual_days, sick_days, personal_days)
VALUES ('daily', 6, 30, 3);

INSERT OR IGNORE INTO CouponTypes (id, name, color) VALUES (1, 'Junior Coupon', '#f63b44ff');
INSERT OR IGNORE INTO CouponTypes (id, name, color) VALUES (2, 'Little Junior Coupon', '#10a5b9ff');

-- ── News Feed ───────────────────────────────────────────────────────────────
-- CRM-managed content shown in the Consumer app's Explore page under
-- "ข่าวสาร" (news) / "สื่อความรู้" (media) — type distinguishes the two.
CREATE TABLE IF NOT EXISTS News_Feed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'news',
    title TEXT NOT NULL,
    title_en TEXT,
    content TEXT,
    content_en TEXT,
    image_url TEXT,
    video_url TEXT,
    link_url TEXT,
    is_published BOOLEAN NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Initial Admin ──────────────────────────────────────────────────────────────
-- Email: admin@mellowplay.co | Password: password123 (SHA-256)
INSERT OR IGNORE INTO CRM_Users (id, email, password_hash, full_name, role, branch_id)
VALUES (1, 'admin@mellowplay.co', 'c775e7b757ede630cd0aa1113bd102661ab38829ca52a6422ab782862f268646', 'Super Admin', 'super_admin', NULL);


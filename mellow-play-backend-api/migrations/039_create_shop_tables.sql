-- Service Categories
CREATE TABLE Service_Categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#7452d6',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Services
CREATE TABLE Services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER,
    description TEXT,
    price REAL DEFAULT 0,
    duration_min INTEGER DEFAULT 30,
    commission_type TEXT DEFAULT 'percent',
    commission_value REAL,
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES Service_Categories(id)
);

-- Product Categories
CREATE TABLE Product_Categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#7452d6',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Products
CREATE TABLE Products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER,
    description TEXT,
    price REAL DEFAULT 0,
    cost_price REAL DEFAULT 0,
    barcode TEXT,
    active BOOLEAN DEFAULT 1,
    track_stock BOOLEAN DEFAULT 1,
    stock_quantity INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES Product_Categories(id)
);

-- Stock Movements
CREATE TABLE Stock_Movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'IN', 'OUT', 'ADJUST'
    quantity INTEGER NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES Products(id)
);

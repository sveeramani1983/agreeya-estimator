-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client_name TEXT,
    description TEXT,
    executive_summary TEXT,
    status TEXT CHECK(status IN ('draft', 'submitted', 'won', 'lost')) DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    tax_label TEXT DEFAULT 'Sales Tax',
    tax_percent REAL DEFAULT 0,
    tax_mode TEXT CHECK(tax_mode IN ('full', 'additional_only', 'not_applicable')) DEFAULT 'not_applicable',
    loading_period_type TEXT DEFAULT 'weekly'
);

-- WBS Components table
CREATE TABLE IF NOT EXISTS wbs_components (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    category TEXT,
    component_name TEXT NOT NULL,
    description TEXT,
    complexity TEXT CHECK(complexity IN ('simple', 'medium', 'complex', 'very_complex', 'spike')),
    story_points INTEGER,
    base_hours REAL,
    confidence_level TEXT CHECK(confidence_level IN ('high', 'medium', 'low', 'spike')),
    notes TEXT,
    sort_order INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Overhead Configuration table
CREATE TABLE IF NOT EXISTS overhead_config (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL UNIQUE,
    ba_percent REAL DEFAULT 15,
    ba_enabled INTEGER DEFAULT 1,
    qa_percent REAL DEFAULT 15,
    qa_enabled INTEGER DEFAULT 1,
    pm_percent REAL DEFAULT 10,
    pm_enabled INTEGER DEFAULT 1,
    devops_percent REAL DEFAULT 5,
    devops_enabled INTEGER DEFAULT 0,
    ux_percent REAL DEFAULT 10,
    ux_enabled INTEGER DEFAULT 0,
    custom_label_1 TEXT DEFAULT 'Custom 1',
    custom_percent_1 REAL DEFAULT 0,
    custom_enabled_1 INTEGER DEFAULT 0,
    custom_label_2 TEXT DEFAULT 'Custom 2',
    custom_percent_2 REAL DEFAULT 0,
    custom_enabled_2 INTEGER DEFAULT 0,
    custom_label_3 TEXT DEFAULT 'Custom 3',
    custom_percent_3 REAL DEFAULT 0,
    custom_enabled_3 INTEGER DEFAULT 0,
    custom_label_4 TEXT DEFAULT 'Custom 4',
    custom_percent_4 REAL DEFAULT 0,
    custom_enabled_4 INTEGER DEFAULT 0,
    project_contingency_percent REAL DEFAULT 10,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Resources table
CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    rate_per_hour REAL,
    allocation_start DATE,
    allocation_end DATE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Resource Loading table
CREATE TABLE IF NOT EXISTS resource_loading (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    period_label TEXT NOT NULL,
    hours REAL DEFAULT 0,
    UNIQUE(resource_id, period_label),
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Additional Costs table
CREATE TABLE IF NOT EXISTS additional_costs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    label TEXT NOT NULL,
    cost_type TEXT CHECK(cost_type IN ('fixed', 'monthly')),
    amount REAL NOT NULL,
    duration_months INTEGER DEFAULT 1,
    notes TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Commercials Configuration table
CREATE TABLE IF NOT EXISTS commercials_config (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL UNIQUE,
    margin_percent REAL DEFAULT 20,
    rates_include_margin INTEGER DEFAULT 0,
    show_margin_to_client INTEGER DEFAULT 1,
    quote_narrative TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Component Library table
CREATE TABLE IF NOT EXISTS component_library (
    id TEXT PRIMARY KEY,
    category TEXT,
    component_name TEXT NOT NULL,
    description TEXT,
    complexity TEXT CHECK(complexity IN ('simple', 'medium', 'complex', 'very_complex', 'spike')),
    story_points INTEGER,
    base_hours REAL,
    notes TEXT,
    times_used INTEGER DEFAULT 0
);

-- Rate Card table
CREATE TABLE IF NOT EXISTS rate_card (
    id TEXT PRIMARY KEY,
    role_title TEXT NOT NULL UNIQUE,
    standard_rate REAL NOT NULL,
    notes TEXT
);

-- Feature interest voting (Skynet AI coming soon pages)
CREATE TABLE IF NOT EXISTS feature_interest (
    id TEXT PRIMARY KEY,
    feature TEXT NOT NULL,
    vote TEXT CHECK(vote IN ('up', 'down')) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

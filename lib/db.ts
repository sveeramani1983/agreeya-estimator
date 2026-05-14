import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH = path.join(process.cwd(), 'db', 'database.sqlite');
const SCHEMA_PATH = path.join(process.cwd(), 'db', 'schema.sql');

let db: Database.Database;

export function getDb() {
    if (!db) {
        db = new Database(DB_PATH, { verbose: process.env.NODE_ENV === 'development' ? console.log : undefined });
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        
        // Initialize schema
        const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
        db.exec(schema);

        // Migrations for existing databases
        try {
            db.exec("ALTER TABLE projects ADD COLUMN executive_summary TEXT");
        } catch (_) {
            // Column already exists — safe to ignore
        }

        // Timeline migrations
        const timelineMigrations = [
            "ALTER TABLE projects ADD COLUMN timeline_start TEXT",
            "ALTER TABLE projects ADD COLUMN timeline_end TEXT",
            "ALTER TABLE projects ADD COLUMN timeline_mode TEXT DEFAULT 'range'",
            "ALTER TABLE projects ADD COLUMN timeline_duration_value INTEGER",
            "ALTER TABLE projects ADD COLUMN timeline_duration_unit TEXT DEFAULT 'weeks'",
            "ALTER TABLE projects ADD COLUMN loading_period_type TEXT DEFAULT 'weekly'",
        ];
        for (const sql of timelineMigrations) {
            try { db.exec(sql); } catch (_) {}
        }

        // Resource location migration
        try { db.exec("ALTER TABLE resources ADD COLUMN location TEXT DEFAULT 'onsite'"); } catch (_) {}

        // Outcome data for win/loss tracking
        try { db.exec("ALTER TABLE projects ADD COLUMN outcome_data TEXT"); } catch (_) {}

        // WBS Hierarchical migrations
        try { db.exec("ALTER TABLE wbs_components ADD COLUMN subtasks TEXT DEFAULT '[]'"); } catch (_) {}
        try { db.exec("ALTER TABLE wbs_components ADD COLUMN is_hours_overridden INTEGER DEFAULT 0"); } catch (_) {}

        // Tax configuration for commercials
        const taxMigrations = [
            "ALTER TABLE projects ADD COLUMN tax_label TEXT DEFAULT 'Sales Tax'",
            "ALTER TABLE projects ADD COLUMN tax_percent REAL DEFAULT 0",
            "ALTER TABLE projects ADD COLUMN tax_mode TEXT DEFAULT 'not_applicable'",
        ];
        for (const sql of taxMigrations) {
            try { db.exec(sql); } catch (_) {}
        }

        // Three-tier overhead model migrations
        const overheadMigrations = [
            "ALTER TABLE overhead_config ADD COLUMN change_mgmt_percent REAL DEFAULT 8",
            "ALTER TABLE overhead_config ADD COLUMN change_mgmt_enabled INTEGER DEFAULT 1",
            "ALTER TABLE overhead_config ADD COLUMN solutions_arch_percent REAL DEFAULT 5",
            "ALTER TABLE overhead_config ADD COLUMN solutions_arch_enabled INTEGER DEFAULT 0",
            "ALTER TABLE overhead_config ADD COLUMN training_percent REAL DEFAULT 5",
            "ALTER TABLE overhead_config ADD COLUMN training_enabled INTEGER DEFAULT 0",
            "ALTER TABLE overhead_config ADD COLUMN warranty_percent REAL DEFAULT 10",
            "ALTER TABLE overhead_config ADD COLUMN warranty_enabled INTEGER DEFAULT 0",
            "ALTER TABLE overhead_config ADD COLUMN risk_buffer_percent REAL DEFAULT 5",
            "ALTER TABLE overhead_config ADD COLUMN risk_buffer_enabled INTEGER DEFAULT 0",
            "ALTER TABLE overhead_config ADD COLUMN custom_overheads TEXT DEFAULT '[]'",
        ];
        for (const sql of overheadMigrations) {
            try { db.exec(sql); } catch (_) {}
        }

        // Estimate versions table
        db.exec(`
          CREATE TABLE IF NOT EXISTS estimate_versions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            version_number INTEGER NOT NULL,
            version_label TEXT NOT NULL,
            snapshot TEXT NOT NULL,
            total_hours REAL,
            total_cost REAL,
            total_sp INTEGER,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          )
        `);

        // Assumptions and risks table
        db.exec(`
          CREATE TABLE IF NOT EXISTS assumptions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            type TEXT DEFAULT 'assumption',
            title TEXT NOT NULL,
            description TEXT,
            category TEXT,
            likelihood TEXT DEFAULT 'medium',
            impact TEXT DEFAULT 'medium',
            risk_score INTEGER,
            mitigation TEXT,
            owner TEXT,
            status TEXT DEFAULT 'open',
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          )
        `);

        // Feature interest table for Skynet AI coming soon pages
        db.exec(`
          CREATE TABLE IF NOT EXISTS feature_interest (
            id TEXT PRIMARY KEY,
            feature TEXT NOT NULL,
            vote TEXT CHECK(vote IN ('up', 'down')) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // RFP Analyses table
        db.exec(`
          CREATE TABLE IF NOT EXISTS rfp_analyses (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            filename TEXT,
            file_size INTEGER,
            analysis_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
          )
        `);

        // Project phases table
        db.exec(`
          CREATE TABLE IF NOT EXISTS project_phases (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            color TEXT DEFAULT '#2563EB',
            sort_order INTEGER DEFAULT 0,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          )
        `);

        // Phase templates table
        db.exec(`
          CREATE TABLE IF NOT EXISTS phase_templates (
            id TEXT PRIMARY KEY,
            template_name TEXT NOT NULL,
            engagement_type TEXT NOT NULL,
            phases_json TEXT NOT NULL,
            is_default INTEGER DEFAULT 0
          )
        `);

        // Historical accuracy tracking — separate from wbs_components to survive
        // the DELETE+reinsert cycle that updateWBSComponents does on every autosave.
        db.exec(`
          CREATE TABLE IF NOT EXISTS wbs_actuals (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            wbs_component_id TEXT NOT NULL,
            actual_hours REAL NOT NULL DEFAULT 0,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            notes TEXT,
            UNIQUE(project_id, wbs_component_id),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          )
        `);

        // Rate card onsite / offshore rates
        for (const sql of [
            "ALTER TABLE rate_card ADD COLUMN onsite_rate REAL",
            "ALTER TABLE rate_card ADD COLUMN offshore_rate REAL",
        ]) { try { db.exec(sql); } catch (_) {} }
        // Migrate existing standard_rate → onsite_rate, derive offshore default
        try { db.exec("UPDATE rate_card SET onsite_rate = standard_rate WHERE onsite_rate IS NULL OR onsite_rate = 0"); } catch (_) {}
        try { db.exec("UPDATE rate_card SET offshore_rate = ROUND(onsite_rate * 0.30) WHERE offshore_rate IS NULL OR offshore_rate = 0"); } catch (_) {}

        // Project lifecycle status (separate from estimate status)
        const lifecycleMigrations = [
            "ALTER TABLE projects ADD COLUMN project_status TEXT DEFAULT 'not_started'",
            "ALTER TABLE projects ADD COLUMN project_start_date TEXT",
            "ALTER TABLE projects ADD COLUMN project_target_end_date TEXT",
        ];
        for (const sql of lifecycleMigrations) {
            try { db.exec(sql); } catch (_) {}
        }

        // Seed if empty
        seedDatabase(db);

        // Ensure UX/UI Lead is always present (idempotent)
        db.prepare(`
            INSERT INTO rate_card (id, role_title, standard_rate, onsite_rate, offshore_rate, notes)
            SELECT ?, 'UX/UI Lead', 150, 150, 50, 'Onsite: $150/hr, Offshore: $50/hr'
            WHERE NOT EXISTS (SELECT 1 FROM rate_card WHERE role_title = 'UX/UI Lead')
        `).run(uuidv4());
    }
    return db;
}

const PHASE_COLORS = ['#2563EB','#7C3AED','#059669','#D97706','#DC2626','#0891B2','#9333EA','#16A34A'];
const pc = (i: number) => PHASE_COLORS[i % PHASE_COLORS.length];

const PHASE_TEMPLATES_SEED = [
    {
        id: uuidv4(), template_name: 'Custom Software Build',
        engagement_type: 'Custom Development', is_default: 1,
        phases_json: JSON.stringify([
            { name: 'Discovery & Requirements',        durationWeeks: 2, color: pc(0), offsetWeeks: 0  },
            { name: 'Technical Design & Architecture', durationWeeks: 3, color: pc(1), offsetWeeks: 2  },
            { name: 'Development',                     durationWeeks: 9, color: pc(2), offsetWeeks: 5  },
            { name: 'Integration & System Testing',    durationWeeks: 2, color: pc(3), offsetWeeks: 14 },
            { name: 'UAT & Acceptance',                durationWeeks: 2, color: pc(4), offsetWeeks: 16 },
            { name: 'Deployment & Go-Live',            durationWeeks: 1, color: pc(5), offsetWeeks: 18 },
            { name: 'Warranty & Hypercare',            durationWeeks: 4, color: pc(6), offsetWeeks: 19 },
        ])
    },
    {
        id: uuidv4(), template_name: 'Platform Implementation',
        engagement_type: 'Platform / ERP', is_default: 0,
        phases_json: JSON.stringify([
            { name: 'Discovery & Fit-Gap Analysis', durationWeeks: 2, color: pc(0), offsetWeeks: 0  },
            { name: 'Solution Design',              durationWeeks: 3, color: pc(1), offsetWeeks: 2  },
            { name: 'Configuration & Build',        durationWeeks: 8, color: pc(2), offsetWeeks: 5  },
            { name: 'Data Migration',               durationWeeks: 3, color: pc(3), offsetWeeks: 10 },
            { name: 'Integration Development',      durationWeeks: 3, color: pc(4), offsetWeeks: 10 },
            { name: 'UAT & Training',               durationWeeks: 2, color: pc(5), offsetWeeks: 13 },
            { name: 'Go-Live & Hypercare',          durationWeeks: 3, color: pc(6), offsetWeeks: 15 },
        ])
    },
    {
        id: uuidv4(), template_name: 'Portal / Web Application',
        engagement_type: 'Web Application', is_default: 0,
        phases_json: JSON.stringify([
            { name: 'Discovery & UX Research',           durationWeeks: 2, color: pc(0), offsetWeeks: 0  },
            { name: 'Information Architecture & Design', durationWeeks: 2, color: pc(1), offsetWeeks: 2  },
            { name: 'Frontend Development',              durationWeeks: 6, color: pc(2), offsetWeeks: 4  },
            { name: 'Backend Development',               durationWeeks: 6, color: pc(3), offsetWeeks: 4  },
            { name: 'Integration & API Development',     durationWeeks: 3, color: pc(4), offsetWeeks: 8  },
            { name: 'QA & Performance Testing',          durationWeeks: 2, color: pc(5), offsetWeeks: 11 },
            { name: 'UAT',                               durationWeeks: 1, color: pc(6), offsetWeeks: 13 },
            { name: 'Go-Live',                           durationWeeks: 1, color: pc(7), offsetWeeks: 14 },
        ])
    },
    {
        id: uuidv4(), template_name: 'System Integration',
        engagement_type: 'Integration', is_default: 0,
        phases_json: JSON.stringify([
            { name: 'Integration Discovery & Analysis', durationWeeks: 2, color: pc(0), offsetWeeks: 0  },
            { name: 'API Design & Architecture',        durationWeeks: 2, color: pc(1), offsetWeeks: 2  },
            { name: 'Integration Development',          durationWeeks: 6, color: pc(2), offsetWeeks: 4  },
            { name: 'Unit & Integration Testing',       durationWeeks: 2, color: pc(3), offsetWeeks: 10 },
            { name: 'End-to-End Testing',               durationWeeks: 2, color: pc(4), offsetWeeks: 10 },
            { name: 'UAT',                              durationWeeks: 1, color: pc(5), offsetWeeks: 12 },
            { name: 'Go-Live',                          durationWeeks: 1, color: pc(6), offsetWeeks: 13 },
        ])
    },
    {
        id: uuidv4(), template_name: 'Data & Analytics',
        engagement_type: 'Data / BI', is_default: 0,
        phases_json: JSON.stringify([
            { name: 'Data Discovery & Profiling',      durationWeeks: 2, color: pc(0), offsetWeeks: 0  },
            { name: 'Data Architecture & Modeling',    durationWeeks: 2, color: pc(1), offsetWeeks: 2  },
            { name: 'ETL / Pipeline Development',      durationWeeks: 6, color: pc(2), offsetWeeks: 4  },
            { name: 'Dashboard & Visualization Build', durationWeeks: 4, color: pc(3), offsetWeeks: 8  },
            { name: 'Data Quality & Validation',       durationWeeks: 2, color: pc(4), offsetWeeks: 10 },
            { name: 'UAT & Business Acceptance',       durationWeeks: 1, color: pc(5), offsetWeeks: 12 },
            { name: 'Go-Live',                          durationWeeks: 1, color: pc(6), offsetWeeks: 13 },
        ])
    },
    {
        id: uuidv4(), template_name: 'Mobile Application',
        engagement_type: 'Mobile', is_default: 0,
        phases_json: JSON.stringify([
            { name: 'Discovery & UX Design',        durationWeeks: 2, color: pc(0), offsetWeeks: 0  },
            { name: 'Technical Architecture',        durationWeeks: 1, color: pc(1), offsetWeeks: 2  },
            { name: 'iOS / Android Development',     durationWeeks: 8, color: pc(2), offsetWeeks: 3  },
            { name: 'Backend API Development',       durationWeeks: 6, color: pc(3), offsetWeeks: 3  },
            { name: 'Integration & Device Testing',  durationWeeks: 2, color: pc(4), offsetWeeks: 9  },
            { name: 'UAT & App Store Submission',    durationWeeks: 2, color: pc(5), offsetWeeks: 11 },
            { name: 'Launch',                        durationWeeks: 1, color: pc(6), offsetWeeks: 13 },
        ])
    },
    {
        id: uuidv4(), template_name: 'Cloud / Infrastructure Migration',
        engagement_type: 'Infrastructure', is_default: 0,
        phases_json: JSON.stringify([
            { name: 'Assessment & Planning',           durationWeeks: 2, color: pc(0), offsetWeeks: 0  },
            { name: 'Architecture Design',             durationWeeks: 2, color: pc(1), offsetWeeks: 2  },
            { name: 'Environment Setup & Configuration', durationWeeks: 3, color: pc(2), offsetWeeks: 4 },
            { name: 'Migration Wave 1',                durationWeeks: 3, color: pc(3), offsetWeeks: 7  },
            { name: 'Migration Wave 2',                durationWeeks: 3, color: pc(4), offsetWeeks: 10 },
            { name: 'Performance & Security Testing',  durationWeeks: 2, color: pc(5), offsetWeeks: 13 },
            { name: 'Cutover & Hypercare',             durationWeeks: 2, color: pc(6), offsetWeeks: 15 },
        ])
    },
    {
        id: uuidv4(), template_name: 'Custom',
        engagement_type: 'Custom', is_default: 0,
        phases_json: JSON.stringify([
            { name: 'Phase 1', durationWeeks: 4, color: pc(0), offsetWeeks: 0 },
            { name: 'Phase 2', durationWeeks: 4, color: pc(1), offsetWeeks: 4 },
            { name: 'Phase 3', durationWeeks: 4, color: pc(2), offsetWeeks: 8 },
        ])
    },
];

function seedDatabase(db: Database.Database) {
    const rateCardCount = db.prepare('SELECT COUNT(*) as count FROM rate_card').get() as { count: number };
    if (rateCardCount.count === 0) {
        console.log('Seeding rate_card...');
        const roles = [
            { id: uuidv4(), title: 'Junior Developer',   onsite: 120, offshore: 35 },
            { id: uuidv4(), title: 'Mid Developer',       onsite: 140, offshore: 45 },
            { id: uuidv4(), title: 'Senior Developer',    onsite: 165, offshore: 55 },
            { id: uuidv4(), title: 'Tech Lead',           onsite: 185, offshore: 65 },
            { id: uuidv4(), title: 'Solution Architect',  onsite: 210, offshore: 75 },
            { id: uuidv4(), title: 'Business Analyst',    onsite: 145, offshore: 45 },
            { id: uuidv4(), title: 'QA Engineer',         onsite: 130, offshore: 40 },
            { id: uuidv4(), title: 'Project Manager',     onsite: 155, offshore: 50 },
        ];

        const insertRate = db.prepare('INSERT INTO rate_card (id, role_title, standard_rate, onsite_rate, offshore_rate) VALUES (?, ?, ?, ?, ?)');
        const transaction = db.transaction((items) => {
            for (const item of items) insertRate.run(item.id, item.title, item.onsite, item.onsite, item.offshore);
        });
        transaction(roles);
    }

    const componentLibraryCount = db.prepare('SELECT COUNT(*) as count FROM component_library').get() as { count: number };
    if (componentLibraryCount.count === 0) {
        console.log('Seeding component_library...');
        const components = [
            // Frontend
            { id: uuidv4(), cat: 'Frontend', name: 'User Login Screen', desc: 'Standard login with email/password', comp: 'simple', sp: 3, hrs: 12 },
            { id: uuidv4(), cat: 'Frontend', name: 'Dashboard Layout', desc: 'Main nav and grid layout', comp: 'medium', sp: 5, hrs: 24 },
            { id: uuidv4(), cat: 'Frontend', name: 'Complex Data Table', desc: 'Filtering, sorting, pagination', comp: 'complex', sp: 8, hrs: 40 },
            // Backend
            { id: uuidv4(), cat: 'Backend', name: 'Auth API', desc: 'JWT based authentication', comp: 'medium', sp: 5, hrs: 20 },
            { id: uuidv4(), cat: 'Backend', name: 'User Profile Service', desc: 'CRUD for user data', comp: 'simple', sp: 3, hrs: 12 },
            { id: uuidv4(), cat: 'Backend', name: 'Search Engine Sync', desc: 'Elasticsearch integration', comp: 'very_complex', sp: 13, hrs: 60 },
            // Integration
            { id: uuidv4(), cat: 'Integration', name: 'Stripe Payments', desc: 'Standard checkout flow', comp: 'complex', sp: 8, hrs: 32 },
            { id: uuidv4(), cat: 'Integration', name: 'SendGrid Email', desc: 'Transactional emails', comp: 'simple', sp: 2, hrs: 8 },
            { id: uuidv4(), cat: 'Integration', name: 'Salesforce Sync', desc: 'Bi-directional CRM sync', comp: 'very_complex', sp: 21, hrs: 120 },
            // Data/Analytics
            { id: uuidv4(), cat: 'Data/Analytics', name: 'Reporting Dashboard', desc: 'Aggregate data visualizations', comp: 'complex', sp: 8, hrs: 48 },
            { id: uuidv4(), cat: 'Data/Analytics', name: 'Data Export Tool', desc: 'CSV/PDF generation', comp: 'medium', sp: 5, hrs: 20 },
            // Infrastructure
            { id: uuidv4(), cat: 'Infrastructure', name: 'CI/CD Pipeline', desc: 'GitHub Actions setup', comp: 'medium', sp: 5, hrs: 16 },
            { id: uuidv4(), cat: 'Infrastructure', name: 'Dockerization', desc: 'Container setup for all services', comp: 'simple', sp: 3, hrs: 12 },
            { id: uuidv4(), cat: 'Infrastructure', name: 'K8s Cluster Setup', desc: 'Production grade EKS/GKE', comp: 'very_complex', sp: 21, hrs: 80 },
            // Security
            { id: uuidv4(), cat: 'Security', name: 'RBAC Implementation', desc: 'Role based access control', comp: 'complex', sp: 8, hrs: 40 },
            { id: uuidv4(), cat: 'Security', name: 'Audit Logging', desc: 'Global action tracking', comp: 'medium', sp: 5, hrs: 24 },
            // Mobile
            { id: uuidv4(), cat: 'Mobile', name: 'Push Notifications', desc: 'FCM/APNS integration', comp: 'medium', sp: 5, hrs: 24 },
            { id: uuidv4(), cat: 'Mobile', name: 'Offline Storage', desc: 'Local DB and sync logic', comp: 'complex', sp: 13, hrs: 56 },
            { id: uuidv4(), cat: 'Mobile', name: 'Biometric Auth', desc: 'FaceID/Fingerprint', comp: 'simple', sp: 3, hrs: 16 },
            { id: uuidv4(), cat: 'Mobile', name: 'Deep Linking', desc: 'App URL handling', comp: 'medium', sp: 5, hrs: 16 },
        ];

        const insertComp = db.prepare('INSERT INTO component_library (id, category, component_name, description, complexity, story_points, base_hours) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const transaction = db.transaction((items) => {
            for (const item of items) insertComp.run(item.id, item.cat, item.name, item.desc, item.comp, item.sp, item.hrs);
        });
        transaction(components);
    }

    const phaseTemplateCount = db.prepare('SELECT COUNT(*) as count FROM phase_templates').get() as { count: number };
    if (phaseTemplateCount.count === 0) {
        console.log('Seeding phase_templates...');
        const insertTpl = db.prepare('INSERT INTO phase_templates (id, template_name, engagement_type, phases_json, is_default) VALUES (?, ?, ?, ?, ?)');
        db.transaction((items: typeof PHASE_TEMPLATES_SEED) => {
            for (const t of items) insertTpl.run(t.id, t.template_name, t.engagement_type, t.phases_json, t.is_default);
        })(PHASE_TEMPLATES_SEED);
    }
}

// Initial call to ensure DB is set up
getDb();

export default db!;

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

        // AI Tab Recommendations Cache table
        db.exec(`
          CREATE TABLE IF NOT EXISTS project_ai_recommendations (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            tab TEXT NOT NULL,
            context_hash TEXT NOT NULL,
            recommendation_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            UNIQUE(project_id, tab)
          )
        `);

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

        // Project Tracker sub-application tables
        db.exec(`
          CREATE TABLE IF NOT EXISTS tracker_projects (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL UNIQUE,
            baseline_snapshot TEXT NOT NULL,
            baseline_total_cost REAL,
            baseline_total_hours REAL,
            kicked_off_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            notes TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          )
        `);

        db.exec(`
          CREATE TABLE IF NOT EXISTS project_actuals (
            id TEXT PRIMARY KEY,
            tracker_project_id TEXT NOT NULL,
            period_label TEXT NOT NULL,
            actual_cost REAL NOT NULL DEFAULT 0,
            notes TEXT,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(tracker_project_id, period_label),
            FOREIGN KEY (tracker_project_id) REFERENCES tracker_projects(id) ON DELETE CASCADE
          )
        `);

        db.exec(`
          CREATE TABLE IF NOT EXISTS health_snapshots (
            id TEXT PRIMARY KEY,
            tracker_project_id TEXT NOT NULL,
            snapshot_date TEXT NOT NULL,
            percent_complete REAL,
            schedule_status TEXT DEFAULT 'on_track',
            budget_status TEXT DEFAULT 'on_track',
            scope_status TEXT DEFAULT 'on_track',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tracker_project_id) REFERENCES tracker_projects(id) ON DELETE CASCADE
          )
        `);

        db.exec(`
          CREATE TABLE IF NOT EXISTS status_reports (
            id TEXT PRIMARY KEY,
            tracker_project_id TEXT NOT NULL,
            report_date TEXT NOT NULL,
            content TEXT NOT NULL,
            generated_by TEXT DEFAULT 'manual',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tracker_project_id) REFERENCES tracker_projects(id) ON DELETE CASCADE
          )
        `);

        db.exec(`
          CREATE TABLE IF NOT EXISTS change_requests (
            id TEXT PRIMARY KEY,
            tracker_project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            requested_by TEXT,
            status TEXT DEFAULT 'open',
            impact_hours REAL,
            impact_cost REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tracker_project_id) REFERENCES tracker_projects(id) ON DELETE CASCADE
          )
        `);

        // Period-based burn entry (replaces project_actuals for new projects)
        db.exec(`
          CREATE TABLE IF NOT EXISTS period_burns (
            id TEXT PRIMARY KEY,
            tracker_project_id TEXT NOT NULL,
            period_start TEXT NOT NULL,
            period_end TEXT NOT NULL,
            period_label TEXT NOT NULL,
            total_hours REAL NOT NULL DEFAULT 0,
            resource_breakdown TEXT,
            notes TEXT,
            is_submitted INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(tracker_project_id, period_start),
            FOREIGN KEY (tracker_project_id) REFERENCES tracker_projects(id) ON DELETE CASCADE
          )
        `);

        // Billing milestones for payment schedule tracking
        db.exec(`
          CREATE TABLE IF NOT EXISTS billing_milestones (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            tracker_project_id TEXT,
            title TEXT NOT NULL,
            description TEXT,
            deliverables TEXT,
            percentage REAL NOT NULL DEFAULT 0,
            amount REAL NOT NULL DEFAULT 0,
            planned_date TEXT,
            actual_date TEXT,
            invoice_number TEXT,
            invoice_status TEXT CHECK(invoice_status IN (
              'not_invoiced','invoiced','paid','overdue'
            )) DEFAULT 'not_invoiced',
            payment_terms INTEGER DEFAULT 30,
            trigger_type TEXT CHECK(trigger_type IN (
              'date','milestone','phase_complete','client_approval','contract_signing'
            )) DEFAULT 'milestone',
            sort_order INTEGER DEFAULT 0,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          )
        `);

        db.exec(`
          CREATE TABLE IF NOT EXISTS milestone_templates (
            id TEXT PRIMARY KEY,
            template_name TEXT NOT NULL UNIQUE,
            milestones_json TEXT NOT NULL
          )
        `);

        // Component-level actuals (one record per component per project, upserted)
        db.exec(`
          CREATE TABLE IF NOT EXISTS component_actuals (
            id TEXT PRIMARY KEY,
            tracker_project_id TEXT NOT NULL,
            wbs_component_id TEXT NOT NULL,
            actual_hours REAL NOT NULL DEFAULT 0,
            is_complete INTEGER DEFAULT 0,
            as_of_date TEXT NOT NULL,
            notes TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(tracker_project_id, wbs_component_id),
            FOREIGN KEY (tracker_project_id) REFERENCES tracker_projects(id) ON DELETE CASCADE
          )
        `);

        // Billing milestone date tracking columns
        try { db.exec("ALTER TABLE billing_milestones ADD COLUMN revised_date TEXT"); } catch (_) {}
        try { db.exec("ALTER TABLE billing_milestones ADD COLUMN milestone_notes TEXT"); } catch (_) {}

        // Reporting cadence per tracker project
        try { db.exec("ALTER TABLE tracker_projects ADD COLUMN reporting_cadence TEXT DEFAULT 'weekly'"); } catch (_) {}

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

        // Pipeline pursuit tracking columns
        const pipelineMigrations = [
            "ALTER TABLE projects ADD COLUMN win_probability INTEGER DEFAULT 50",
            "ALTER TABLE projects ADD COLUMN deal_size_category TEXT",
            "ALTER TABLE projects ADD COLUMN expected_start_date TEXT",
            "ALTER TABLE projects ADD COLUMN pursuit_owner TEXT",
            "ALTER TABLE projects ADD COLUMN vertical TEXT",
            "ALTER TABLE projects ADD COLUMN service_line TEXT",
        ];
        for (const sql of pipelineMigrations) {
            try { db.exec(sql); } catch (_) {}
        }

        // Win probability rules lookup table
        db.exec(`
            CREATE TABLE IF NOT EXISTS win_probability_rules (
                id TEXT PRIMARY KEY,
                status TEXT NOT NULL UNIQUE,
                default_probability INTEGER NOT NULL,
                description TEXT
            )
        `);
        const wpInsert = db.prepare(
            "INSERT INTO win_probability_rules (id, status, default_probability, description) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM win_probability_rules WHERE status=?)"
        );
        for (const [status, prob, desc] of [
            ['draft',     25,  'Early stage — requirements unclear'],
            ['submitted', 50,  'Proposal submitted — awaiting decision'],
            ['won',       100, 'Deal closed'],
            ['lost',      0,   'Deal lost'],
        ] as [string, number, string][]) {
            try { wpInsert.run(uuidv4(), status, prob, desc, status); } catch (_) {}
        }

        // Client Master List tables
        db.exec(`
            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                industry TEXT,
                website TEXT,
                address TEXT,
                city TEXT,
                state TEXT,
                country TEXT DEFAULT 'USA',
                phone TEXT,
                email TEXT,
                notes TEXT,
                is_archived INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS client_contacts (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                name TEXT NOT NULL,
                title TEXT,
                email TEXT,
                phone TEXT,
                is_primary INTEGER DEFAULT 0,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
            )
        `);
        db.exec(`
            CREATE TABLE IF NOT EXISTS client_notes (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                content TEXT NOT NULL,
                category TEXT DEFAULT 'general',
                created_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
            )
        `);

        // Link projects to clients
        try { db.exec("ALTER TABLE projects ADD COLUMN client_id TEXT REFERENCES clients(id)"); } catch (_) {}

        // Seed clients from existing project client_names (idempotent)
        const unlinkedClients = db.prepare(
            "SELECT DISTINCT client_name FROM projects WHERE client_id IS NULL AND client_name IS NOT NULL AND client_name != ''"
        ).all() as { client_name: string }[];
        for (const { client_name } of unlinkedClients) {
            const existing = db.prepare("SELECT id FROM clients WHERE name = ?").get(client_name) as { id: string } | undefined;
            const clientId = existing?.id ?? uuidv4();
            if (!existing) {
                db.prepare("INSERT INTO clients (id, name) VALUES (?, ?)").run(clientId, client_name);
            }
            db.prepare("UPDATE projects SET client_id = ? WHERE client_name = ? AND client_id IS NULL").run(clientId, client_name);
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

    const milestoneTemplateCount = db.prepare('SELECT COUNT(*) as count FROM milestone_templates').get() as { count: number };
    if (milestoneTemplateCount.count === 0) {
        const insertMT = db.prepare('INSERT INTO milestone_templates (id, template_name, milestones_json) VALUES (?, ?, ?)');
        const MILESTONE_TEMPLATES = [
            { name: 'Fixed Price — Equal Installments', json: JSON.stringify([
                { title: 'Contract Signing',    percentage: 20, trigger_type: 'contract_signing' },
                { title: 'Midpoint Delivery',   percentage: 30, trigger_type: 'milestone'        },
                { title: 'UAT Acceptance',      percentage: 30, trigger_type: 'client_approval'  },
                { title: 'Go-Live',             percentage: 15, trigger_type: 'phase_complete'   },
                { title: 'Warranty Period End', percentage:  5, trigger_type: 'date'             },
            ])},
            { name: 'Fixed Price — Delivery Based', json: JSON.stringify([
                { title: 'Project Kickoff',  percentage: 10, trigger_type: 'date',            percentage_offset: 0 },
                { title: 'Phase 1 Complete', percentage: 25, trigger_type: 'phase_complete'                        },
                { title: 'Phase 2 Complete', percentage: 25, trigger_type: 'phase_complete'                        },
                { title: 'UAT Sign-off',     percentage: 25, trigger_type: 'client_approval'                       },
                { title: 'Project Close',    percentage: 15, trigger_type: 'phase_complete'                        },
            ])},
            { name: 'T&M Monthly',  json: '[]' },
            { name: '50/50 Split',  json: JSON.stringify([
                { title: 'Project Start',    percentage: 50, trigger_type: 'contract_signing' },
                { title: 'Project Complete', percentage: 50, trigger_type: 'phase_complete'   },
            ])},
            { name: 'Custom', json: '[]' },
        ];
        db.transaction((items: typeof MILESTONE_TEMPLATES) => {
            for (const t of items) insertMT.run(uuidv4(), t.name, t.json);
        })(MILESTONE_TEMPLATES);
    }
}

// Initial call to ensure DB is set up
getDb();

export default db!;

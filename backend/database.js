const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'quality_system.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Initialize tables
function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      target_fpy REAL DEFAULT 98.5,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS production_batches (
      id TEXT PRIMARY KEY,
      batch_number TEXT UNIQUE NOT NULL,
      product_id TEXT NOT NULL,
      units_produced INTEGER NOT NULL,
      units_inspected INTEGER NOT NULL DEFAULT 0,
      units_passed INTEGER NOT NULL DEFAULT 0,
      units_failed INTEGER NOT NULL DEFAULT 0,
      manufacturing_line TEXT,
      status TEXT DEFAULT 'IN_PRODUCTION',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS inspection_checkpoints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      stage TEXT NOT NULL,
      criteria TEXT NOT NULL,
      severity_default TEXT DEFAULT 'MAJOR'
    );

    CREATE TABLE IF NOT EXISTS defects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      product_id TEXT NOT NULL,
      batch_id TEXT NOT NULL,
      checkpoint_id TEXT,
      defect_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NEW',
      discovered_by TEXT NOT NULL,
      assigned_to TEXT,
      discovered_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT,
      verified_at TEXT,
      containment_action TEXT,
      resolution_notes TEXT,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (batch_id) REFERENCES production_batches(id),
      FOREIGN KEY (checkpoint_id) REFERENCES inspection_checkpoints(id)
    );

    CREATE TABLE IF NOT EXISTS defect_rca (
      id TEXT PRIMARY KEY,
      defect_id TEXT UNIQUE NOT NULL,
      fishbone_category TEXT,
      why_1 TEXT,
      why_2 TEXT,
      why_3 TEXT,
      why_4 TEXT,
      why_5 TEXT,
      root_cause_conclusion TEXT,
      analyzed_by TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (defect_id) REFERENCES defects(id)
    );

    CREATE TABLE IF NOT EXISTS defect_capa (
      id TEXT PRIMARY KEY,
      defect_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      owner TEXT NOT NULL,
      target_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PLANNED',
      verification_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (defect_id) REFERENCES defects(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      details_json TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS defect_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      defect_id TEXT NOT NULL,
      author TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (defect_id) REFERENCES defects(id)
    );
  `);
}

function logAudit(entityType, entityId, action, performedBy, details = {}) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (entity_type, entity_id, action, performed_by, details_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(entityType, entityId, action, performedBy, JSON.stringify(details));
  } catch (err) {
    console.error('Audit log failure:', err.message);
  }
}

initializeDatabase();

module.exports = {
  db,
  logAudit,
  initializeDatabase,
  DB_PATH
};

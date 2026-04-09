export function initializeDb(db) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS builds (
      id TEXT PRIMARY KEY,
      business_name TEXT NOT NULL,
      business_email TEXT NOT NULL,
      business_phone TEXT NOT NULL,
      address TEXT DEFAULT '',
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
      zip TEXT DEFAULT '',
      country TEXT DEFAULT 'US',
      industry TEXT NOT NULL,
      timezone TEXT NOT NULL,
      owner_first_name TEXT NOT NULL,
      owner_last_name TEXT NOT NULL,
      area_code TEXT NOT NULL,
      website_url TEXT,
      location_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT (datetime('now')),
      completed_at DATETIME,
      total_duration_ms INTEGER
    );

    CREATE TABLE IF NOT EXISTS build_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      build_id TEXT NOT NULL REFERENCES builds(id),
      step_number INTEGER NOT NULL,
      step_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at DATETIME,
      completed_at DATETIME,
      duration_ms INTEGER,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      api_response TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // M1 additive migrations (safe to run repeatedly)
  const buildCols = db.prepare("PRAGMA table_info(builds)").all().map((c) => c.name);
  if (!buildCols.includes('paused_at_step')) {
    db.exec('ALTER TABLE builds ADD COLUMN paused_at_step INTEGER');
  }
  if (!buildCols.includes('pause_context')) {
    db.exec('ALTER TABLE builds ADD COLUMN pause_context TEXT');
  }

  const stepCols = db.prepare("PRAGMA table_info(build_steps)").all().map((c) => c.name);
  if (!stepCols.includes('phase')) {
    db.exec('ALTER TABLE build_steps ADD COLUMN phase INTEGER NOT NULL DEFAULT 1');
  }

  // M2a additive migrations (safe to run repeatedly)
  const m2aCols = [
    ['industry_text', 'TEXT'],
    ['target_audience', 'TEXT'],
    ['logo_path', 'TEXT'],
    ['brand_colors', 'TEXT'],
    ['tenweb_prompt', 'TEXT'],
    ['wp_url', 'TEXT'],
    ['wp_username', 'TEXT'],
    ['wp_password_encrypted', 'TEXT'],
    ['business_description', 'TEXT'],
  ];
  const buildCols2 = db.prepare("PRAGMA table_info(builds)").all().map((c) => c.name);
  for (const [name, type] of m2aCols) {
    if (!buildCols2.includes(name)) {
      db.exec(`ALTER TABLE builds ADD COLUMN ${name} ${type}`);
    }
  }

  // M2b additive migrations
  const buildCols3 = db.prepare("PRAGMA table_info(builds)").all().map((c) => c.name);
  const m2bCols = [
    ['privacy_policy_url', 'TEXT'],
    ['terms_url', 'TEXT'],
    ['faq_url', 'TEXT'],
  ];
  for (const [name, type] of m2bCols) {
    if (!buildCols3.includes(name)) {
      db.exec(`ALTER TABLE builds ADD COLUMN ${name} ${type}`);
    }
  }
}

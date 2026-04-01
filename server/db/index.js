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
}

import { initializeSocialTables } from './social-schema.js';

export async function initializeDb(db) {
  // Turso/libsql doesn't need WAL or foreign_keys pragma — handled server-side

  await db.executeMultiple(`
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
  const buildColsResult = await db.execute("PRAGMA table_info(builds)");
  const buildCols = buildColsResult.rows.map((c) => c.name);
  if (!buildCols.includes('paused_at_step')) {
    await db.execute('ALTER TABLE builds ADD COLUMN paused_at_step INTEGER');
  }
  if (!buildCols.includes('pause_context')) {
    await db.execute('ALTER TABLE builds ADD COLUMN pause_context TEXT');
  }

  const stepColsResult = await db.execute("PRAGMA table_info(build_steps)");
  const stepCols = stepColsResult.rows.map((c) => c.name);
  if (!stepCols.includes('phase')) {
    await db.execute('ALTER TABLE build_steps ADD COLUMN phase INTEGER NOT NULL DEFAULT 1');
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
  const buildCols2Result = await db.execute("PRAGMA table_info(builds)");
  const buildCols2 = buildCols2Result.rows.map((c) => c.name);
  for (const [name, type] of m2aCols) {
    if (!buildCols2.includes(name)) {
      await db.execute(`ALTER TABLE builds ADD COLUMN ${name} ${type}`);
    }
  }

  // M2b additive migrations
  const buildCols3Result = await db.execute("PRAGMA table_info(builds)");
  const buildCols3 = buildCols3Result.rows.map((c) => c.name);
  const m2bCols = [
    ['privacy_policy_url', 'TEXT'],
    ['terms_url', 'TEXT'],
    ['faq_url', 'TEXT'],
    ['site_css', 'TEXT'],
  ];
  for (const [name, type] of m2bCols) {
    if (!buildCols3.includes(name)) {
      await db.execute(`ALTER TABLE builds ADD COLUMN ${name} ${type}`);
    }
  }

  // Users table for multi-user auth
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Admin role migration
  const userColsResult = await db.execute("PRAGMA table_info(users)");
  const userCols = userColsResult.rows.map((c) => c.name);
  if (!userCols.includes('is_admin')) {
    await db.execute('ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
  }

  // M3 Social Planner tables
  await initializeSocialTables(db);
}

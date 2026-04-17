import { initializeSocialTables } from './social-schema.js';
import { initializeKbTables } from '../modules/kb/schema.js';

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

  // Unified Command Center client columns
  const ccCols = [
    ['contact_name', 'TEXT'],
    ['email', 'TEXT'],
    ['phone', 'TEXT'],
    ['address', 'TEXT'],
    ['city', 'TEXT'],
    ['state', 'TEXT'],
    ['zip', 'TEXT'],
    ['country', "TEXT DEFAULT 'US'"],
    ['location_id', 'TEXT'],
    ['brand_colors_json', 'TEXT'],
    ['design_style', 'TEXT'],
    ['timezone', "TEXT DEFAULT 'America/New_York'"],
    ['start_date', 'TEXT'],
    ['active', 'INTEGER DEFAULT 1'],
    ['onboarding_status', "TEXT DEFAULT 'pending'"],
    ['updated_at', "DATETIME DEFAULT (datetime('now'))"],
    ['ghl_api_key_encrypted', 'TEXT'],
    ['brand_personality', 'TEXT'],
    ['brand_mood_description', 'TEXT'],
    ['industry_cues_json', 'TEXT'],
    ['recommended_surface_style', 'TEXT'],
    ['client_brief', 'TEXT'],
    ['client_brief_generated_at', 'DATETIME'],
  ];
  const ccColsResult = await db.execute("PRAGMA table_info(clients)");
  const ccExisting = ccColsResult.rows.map(c => c.name);
  for (const [name, type] of ccCols) {
    if (!ccExisting.includes(name)) {
      await db.execute(`ALTER TABLE clients ADD COLUMN ${name} ${type}`);
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

  // Campaign-level content strategy columns (additive)
  const campColsResult = await db.execute("PRAGMA table_info(campaigns)");
  const campExisting = campColsResult.rows.map(c => c.name);
  const campAdditions = [
    ['content_pillars', 'TEXT'],
    ['hashtag_bank', 'TEXT'],
    ['cta_style', 'TEXT'],
    ['platforms', 'TEXT'],
    ['monthly_recap', 'TEXT'],
    ['monthly_recap_generated_at', 'DATETIME'],
    ['recap_seed', 'TEXT'],
  ];
  for (const [name, type] of campAdditions) {
    if (!campExisting.includes(name)) {
      await db.execute(`ALTER TABLE campaigns ADD COLUMN ${name} ${type}`);
    }
  }

  // M1 Health Monitor tables
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS health_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      score INTEGER NOT NULL,
      status TEXT NOT NULL,
      metric_new_leads INTEGER DEFAULT 0,
      metric_pipeline_movement INTEGER DEFAULT 0,
      metric_conversation_activity INTEGER DEFAULT 0,
      metric_response_time INTEGER DEFAULT 0,
      metric_appointments INTEGER DEFAULT 0,
      metric_reviews INTEGER DEFAULT 0,
      raw_data TEXT,
      calculated_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_health_client_date
      ON health_scores(client_id, calculated_at DESC);

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      rule TEXT NOT NULL,
      message TEXT NOT NULL,
      score_at_alert INTEGER,
      delivered_via TEXT,
      acknowledged INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_client
      ON alerts(client_id, created_at DESC);
  `);

  // M2 Knowledge Base tables
  await initializeKbTables(db);
}

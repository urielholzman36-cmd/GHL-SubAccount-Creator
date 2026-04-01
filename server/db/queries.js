const STEP_NAMES = [
  'Create Sub-Account',
  'Provision Phone',
  'Set Custom Values',
  'Create Pipeline',
  'Create Admin User',
  'Send Welcome Comms',
];

export function insertBuild(db, build) {
  const stmt = db.prepare(`
    INSERT INTO builds (id, business_name, business_email, business_phone, address, city, state, zip, country, industry, timezone, owner_first_name, owner_last_name, area_code, website_url)
    VALUES (@id, @business_name, @business_email, @business_phone, @address, @city, @state, @zip, @country, @industry, @timezone, @owner_first_name, @owner_last_name, @area_code, @website_url)
  `);
  stmt.run(build);
}

export function createBuildSteps(db, buildId) {
  const stmt = db.prepare(`INSERT INTO build_steps (build_id, step_number, step_name) VALUES (?, ?, ?)`);
  const insertMany = db.transaction(() => {
    STEP_NAMES.forEach((name, i) => { stmt.run(buildId, i + 1, name); });
  });
  insertMany();
}

export function getBuildById(db, id) {
  return db.prepare('SELECT * FROM builds WHERE id = ?').get(id);
}

export function getBuildSteps(db, buildId) {
  return db.prepare('SELECT * FROM build_steps WHERE build_id = ? ORDER BY step_number').all(buildId);
}

export function updateBuildStatus(db, id, status, totalDurationMs = null) {
  if (status === 'completed' || status === 'failed') {
    db.prepare('UPDATE builds SET status = ?, completed_at = datetime(\'now\'), total_duration_ms = ? WHERE id = ?').run(status, totalDurationMs, id);
  } else {
    db.prepare('UPDATE builds SET status = ? WHERE id = ?').run(status, id);
  }
}

export function updateBuildLocationId(db, id, locationId) {
  db.prepare('UPDATE builds SET location_id = ? WHERE id = ?').run(locationId, id);
}

export function updateStepStatus(db, buildId, stepNumber, status, durationMs = null, errorMessage = null, apiResponse = null) {
  if (status === 'running') {
    db.prepare(`UPDATE build_steps SET status = ?, started_at = datetime('now') WHERE build_id = ? AND step_number = ?`).run(status, buildId, stepNumber);
  } else {
    db.prepare(`UPDATE build_steps SET status = ?, completed_at = datetime('now'), duration_ms = ?, error_message = ?, api_response = ? WHERE build_id = ? AND step_number = ?`).run(status, durationMs, errorMessage, apiResponse, buildId, stepNumber);
  }
}

export function incrementStepRetry(db, buildId, stepNumber) {
  db.prepare('UPDATE build_steps SET retry_count = retry_count + 1 WHERE build_id = ? AND step_number = ?').run(buildId, stepNumber);
}

export function listBuilds(db, { page = 1, perPage = 20, search = '', industry = '', status = '' } = {}) {
  let where = 'WHERE 1=1';
  const params = {};
  if (search) { where += ' AND (business_name LIKE @search OR business_email LIKE @search OR location_id LIKE @search)'; params.search = `%${search}%`; }
  if (industry) { where += ' AND industry = @industry'; params.industry = industry; }
  if (status) { where += ' AND status = @status'; params.status = status; }
  const total = db.prepare(`SELECT COUNT(*) as count FROM builds ${where}`).get(params).count;
  const builds = db.prepare(`SELECT * FROM builds ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`).all({ ...params, limit: perPage, offset: (page - 1) * perPage });
  return { builds, total, page, perPage };
}

export function getStats(db) {
  const row = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed, AVG(CASE WHEN status = 'completed' THEN total_duration_ms END) as avg_duration_ms FROM builds`).get();
  return { total: row.total, successful: row.successful || 0, failed: row.failed || 0, avg_duration_ms: row.avg_duration_ms ? Math.round(row.avg_duration_ms) : 0 };
}

export function setSetting(db, key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

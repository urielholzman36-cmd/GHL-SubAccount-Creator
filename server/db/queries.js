import { getAllSteps, getPhaseForStep } from '../services/phases.config.js';

export async function insertBuild(db, build) {
  await db.execute({
    sql: `INSERT INTO builds (id, business_name, business_email, business_phone, address, city, state, zip, country, industry, timezone, owner_first_name, owner_last_name, area_code, website_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [build.id, build.business_name, build.business_email, build.business_phone, build.address, build.city, build.state, build.zip, build.country, build.industry, build.timezone, build.owner_first_name, build.owner_last_name, build.area_code, build.website_url],
  });
}

export async function createBuildSteps(db, buildId) {
  const steps = getAllSteps();
  const stmts = steps.map(s => ({
    sql: 'INSERT INTO build_steps (build_id, step_number, step_name, phase) VALUES (?, ?, ?, ?)',
    args: [buildId, s.number, s.name, getPhaseForStep(s.number)],
  }));
  await db.batch(stmts);
}

export async function setPauseState(db, buildId, stepNumber, context) {
  await db.execute({
    sql: `UPDATE builds SET status = 'paused', paused_at_step = ?, pause_context = ? WHERE id = ?`,
    args: [stepNumber, JSON.stringify(context), buildId],
  });
}

export async function clearPauseState(db, buildId) {
  await db.execute({
    sql: `UPDATE builds SET paused_at_step = NULL, pause_context = NULL WHERE id = ?`,
    args: [buildId],
  });
}

export async function getBuildById(db, id) {
  const result = await db.execute({ sql: 'SELECT * FROM builds WHERE id = ?', args: [id] });
  return result.rows[0] || null;
}

export async function getBuildSteps(db, buildId) {
  const result = await db.execute({ sql: 'SELECT * FROM build_steps WHERE build_id = ? ORDER BY step_number', args: [buildId] });
  return result.rows;
}

export async function updateBuildStatus(db, id, status, totalDurationMs = null) {
  if (status === 'completed' || status === 'failed') {
    await db.execute({
      sql: "UPDATE builds SET status = ?, completed_at = datetime('now'), total_duration_ms = ? WHERE id = ?",
      args: [status, totalDurationMs, id],
    });
  } else {
    await db.execute({
      sql: 'UPDATE builds SET status = ? WHERE id = ?',
      args: [status, id],
    });
  }
}

export async function updateBuildLocationId(db, id, locationId) {
  await db.execute({ sql: 'UPDATE builds SET location_id = ? WHERE id = ?', args: [locationId, id] });
}

export async function updateStepStatus(db, buildId, stepNumber, status, durationMs = null, errorMessage = null, apiResponse = null) {
  if (status === 'running') {
    await db.execute({
      sql: `UPDATE build_steps SET status = ?, started_at = datetime('now') WHERE build_id = ? AND step_number = ?`,
      args: [status, buildId, stepNumber],
    });
  } else {
    await db.execute({
      sql: `UPDATE build_steps SET status = ?, completed_at = datetime('now'), duration_ms = ?, error_message = ?, api_response = ? WHERE build_id = ? AND step_number = ?`,
      args: [status, durationMs, errorMessage, apiResponse, buildId, stepNumber],
    });
  }
}

export async function incrementStepRetry(db, buildId, stepNumber) {
  await db.execute({
    sql: 'UPDATE build_steps SET retry_count = retry_count + 1 WHERE build_id = ? AND step_number = ?',
    args: [buildId, stepNumber],
  });
}

export async function listBuilds(db, { page = 1, perPage = 20, search = '', industry = '', status = '' } = {}) {
  let where = 'WHERE 1=1';
  const args = [];
  if (search) { where += ' AND (business_name LIKE ? OR business_email LIKE ? OR location_id LIKE ?)'; args.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (industry) { where += ' AND industry = ?'; args.push(industry); }
  if (status) { where += ' AND status = ?'; args.push(status); }

  const countResult = await db.execute({ sql: `SELECT COUNT(*) as count FROM builds ${where}`, args });
  const total = countResult.rows[0].count;

  const buildsResult = await db.execute({
    sql: `SELECT * FROM builds ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    args: [...args, perPage, (page - 1) * perPage],
  });
  return { builds: buildsResult.rows, total, page, perPage };
}

export async function getStats(db) {
  const result = await db.execute(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed, AVG(CASE WHEN status = 'completed' THEN total_duration_ms END) as avg_duration_ms FROM builds`);
  const row = result.rows[0];
  return { total: row.total, successful: row.successful || 0, failed: row.failed || 0, avg_duration_ms: row.avg_duration_ms ? Math.round(row.avg_duration_ms) : 0 };
}

export async function setSetting(db, key, value) {
  await db.execute({ sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', args: [key, value] });
}

export async function getSetting(db, key) {
  const result = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] });
  return result.rows[0] ? result.rows[0].value : null;
}

export async function createPagePrompt(db, data) {
  const {
    client_id, build_id = null, page_type, page_name,
    page_slug = null, user_notes = null,
    generated_prompt = null, brand_snapshot_json = null,
  } = data;
  const result = await db.execute({
    sql: `INSERT INTO page_prompts
      (client_id, build_id, page_type, page_name, page_slug, user_notes, generated_prompt, brand_snapshot_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id`,
    args: [client_id, build_id, page_type, page_name, page_slug, user_notes, generated_prompt, brand_snapshot_json],
  });
  return { id: result.rows[0].id };
}

export async function listPagePromptsByClient(db, clientId) {
  const result = await db.execute({
    sql: `SELECT * FROM page_prompts WHERE client_id = ? ORDER BY created_at DESC`,
    args: [clientId],
  });
  return result.rows;
}

export async function getPagePromptById(db, id) {
  const result = await db.execute({
    sql: `SELECT * FROM page_prompts WHERE id = ?`,
    args: [id],
  });
  return result.rows[0] || null;
}

export async function updatePagePrompt(db, id, fields) {
  const allowed = ['page_type', 'page_name', 'page_slug', 'user_notes', 'generated_prompt', 'brand_snapshot_json', 'build_id'];
  const setClauses = [];
  const args = [];
  for (const key of allowed) {
    if (key in fields) {
      setClauses.push(`${key} = ?`);
      args.push(fields[key]);
    }
  }
  if (!setClauses.length) return;
  setClauses.push(`updated_at = datetime('now')`);
  args.push(id);
  await db.execute({
    sql: `UPDATE page_prompts SET ${setClauses.join(', ')} WHERE id = ?`,
    args,
  });
}

export async function deletePagePrompt(db, id) {
  await db.execute({ sql: `DELETE FROM page_prompts WHERE id = ?`, args: [id] });
}

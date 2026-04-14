/**
 * Social Planner CRUD queries — clients, campaigns, campaign_posts.
 * Async version for @libsql/client (Turso).
 */

// ── Client allowlist ──────────────────────────────────────────────
const CLIENT_FIELDS = new Set([
  'name', 'industry', 'location', 'website', 'logo_path',
  'cloudinary_folder', 'platforms', 'posting_time', 'brand_tone',
  'brand_description', 'target_audience', 'services', 'content_pillars',
  'hashtag_bank', 'cta_style', 'uses_manus', 'watermark_position',
  'watermark_opacity',
]);

// ── Campaign allowlist ────────────────────────────────────────────
const CAMPAIGN_FIELDS = new Set([
  'month', 'theme', 'start_date', 'status', 'research_brief',
  'manus_research', 'strategy_pack', 'prompts_csv_path',
  'images_folder', 'csv_path', 'current_step', 'post_count',
]);

// ── Post allowlist ────────────────────────────────────────────────
const POST_FIELDS = new Set([
  'day_number', 'post_date', 'pillar', 'post_type', 'concept',
  'caption', 'hashtags', 'cta', 'visual_prompt', 'image_urls',
  'slide_count', 'category', 'edited',
]);

// ── Clients ───────────────────────────────────────────────────────

export async function createClient(db, data) {
  const fields = Object.keys(data).filter(k => CLIENT_FIELDS.has(k));
  const cols = fields.join(', ');
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map(k => data[k]);

  const result = await db.execute({ sql: `INSERT INTO clients (${cols}) VALUES (${placeholders})`, args: values });
  return result.lastInsertRowid;
}

export async function getClient(db, id) {
  const result = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [id] });
  return result.rows[0] || null;
}

export async function listClients(db) {
  const result = await db.execute('SELECT * FROM clients ORDER BY created_at DESC');
  return result.rows;
}

export async function updateClient(db, id, data) {
  const fields = Object.keys(data).filter(k => CLIENT_FIELDS.has(k));
  if (fields.length === 0) return;
  const sets = fields.map(k => `${k} = ?`).join(', ');
  const values = fields.map(k => data[k]);
  await db.execute({ sql: `UPDATE clients SET ${sets} WHERE id = ?`, args: [...values, id] });
}

export async function deleteClient(db, id) {
  // Get campaign IDs for this client
  const campaignsResult = await db.execute({ sql: 'SELECT id FROM campaigns WHERE client_id = ?', args: [id] });
  const stmts = [];
  for (const c of campaignsResult.rows) {
    stmts.push({ sql: 'DELETE FROM campaign_posts WHERE campaign_id = ?', args: [c.id] });
  }
  stmts.push({ sql: 'DELETE FROM campaigns WHERE client_id = ?', args: [id] });
  stmts.push({ sql: 'DELETE FROM clients WHERE id = ?', args: [id] });
  await db.batch(stmts);
}

// ── Campaigns ─────────────────────────────────────────────────────

export async function createCampaign(db, data) {
  const fields = ['client_id', ...Object.keys(data).filter(k => CAMPAIGN_FIELDS.has(k))];
  const uniqueFields = [...new Set(fields)];
  const cols = uniqueFields.join(', ');
  const placeholders = uniqueFields.map(() => '?').join(', ');
  const values = uniqueFields.map(k => data[k]);

  const result = await db.execute({ sql: `INSERT INTO campaigns (${cols}) VALUES (${placeholders})`, args: values });
  return result.lastInsertRowid;
}

export async function getCampaign(db, id) {
  const result = await db.execute({ sql: 'SELECT * FROM campaigns WHERE id = ?', args: [id] });
  return result.rows[0] || null;
}

export async function listCampaigns(db, clientId) {
  const result = await db.execute({ sql: 'SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC', args: [clientId] });
  return result.rows;
}

export async function updateCampaignStatus(db, id, status, currentStep) {
  await db.execute({ sql: 'UPDATE campaigns SET status = ?, current_step = ? WHERE id = ?', args: [status, currentStep, id] });
}

export async function updateCampaignField(db, id, field, value) {
  if (!CAMPAIGN_FIELDS.has(field)) {
    throw new Error(`Invalid campaign field: ${field}`);
  }
  await db.execute({ sql: `UPDATE campaigns SET ${field} = ? WHERE id = ?`, args: [value, id] });
}

export async function deleteCampaign(db, id) {
  await db.batch([
    { sql: 'DELETE FROM campaign_posts WHERE campaign_id = ?', args: [id] },
    { sql: 'DELETE FROM campaigns WHERE id = ?', args: [id] },
  ]);
}

// ── Campaign Posts ────────────────────────────────────────────────

export async function createCampaignPost(db, data) {
  const fields = ['campaign_id', ...Object.keys(data).filter(k => POST_FIELDS.has(k))];
  const uniqueFields = [...new Set(fields)];
  const cols = uniqueFields.join(', ');
  const placeholders = uniqueFields.map(() => '?').join(', ');
  const values = uniqueFields.map(k => data[k]);

  const result = await db.execute({ sql: `INSERT INTO campaign_posts (${cols}) VALUES (${placeholders})`, args: values });
  return result.lastInsertRowid;
}

export async function bulkCreateCampaignPosts(db, posts) {
  const stmts = [];
  for (const data of posts) {
    const fields = ['campaign_id', ...Object.keys(data).filter(k => POST_FIELDS.has(k))];
    const uniqueFields = [...new Set(fields)];
    const cols = uniqueFields.join(', ');
    const placeholders = uniqueFields.map(() => '?').join(', ');
    const values = uniqueFields.map(k => data[k]);
    stmts.push({ sql: `INSERT INTO campaign_posts (${cols}) VALUES (${placeholders})`, args: values });
  }
  await db.batch(stmts);
}

export async function listCampaignPosts(db, campaignId) {
  const result = await db.execute({ sql: 'SELECT * FROM campaign_posts WHERE campaign_id = ? ORDER BY day_number ASC', args: [campaignId] });
  return result.rows;
}

export async function updateCampaignPost(db, id, data) {
  const fields = Object.keys(data).filter(k => POST_FIELDS.has(k));
  if (fields.length === 0) return;
  const sets = fields.map(k => `${k} = ?`).join(', ');
  const values = fields.map(k => data[k]);
  await db.execute({ sql: `UPDATE campaign_posts SET ${sets} WHERE id = ?`, args: [...values, id] });
}

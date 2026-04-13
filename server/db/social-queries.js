/**
 * Social Planner CRUD queries — clients, campaigns, campaign_posts.
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

export function createClient(db, data) {
  const fields = Object.keys(data).filter(k => CLIENT_FIELDS.has(k));
  const cols = fields.join(', ');
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map(k => data[k]);

  const stmt = db.prepare(`INSERT INTO clients (${cols}) VALUES (${placeholders})`);
  const result = stmt.run(...values);
  return result.lastInsertRowid;
}

export function getClient(db, id) {
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
}

export function listClients(db) {
  return db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
}

export function updateClient(db, id, data) {
  const fields = Object.keys(data).filter(k => CLIENT_FIELDS.has(k));
  if (fields.length === 0) return;
  const sets = fields.map(k => `${k} = ?`).join(', ');
  const values = fields.map(k => data[k]);
  db.prepare(`UPDATE clients SET ${sets} WHERE id = ?`).run(...values, id);
}

export function deleteClient(db, id) {
  const deleteTx = db.transaction(() => {
    // Get campaign IDs for this client
    const campaigns = db.prepare('SELECT id FROM campaigns WHERE client_id = ?').all(id);
    for (const c of campaigns) {
      db.prepare('DELETE FROM campaign_posts WHERE campaign_id = ?').run(c.id);
    }
    db.prepare('DELETE FROM campaigns WHERE client_id = ?').run(id);
    db.prepare('DELETE FROM clients WHERE id = ?').run(id);
  });
  deleteTx();
}

// ── Campaigns ─────────────────────────────────────────────────────

export function createCampaign(db, data) {
  const fields = ['client_id', ...Object.keys(data).filter(k => CAMPAIGN_FIELDS.has(k))];
  // Ensure client_id is included
  const uniqueFields = [...new Set(fields)];
  const cols = uniqueFields.join(', ');
  const placeholders = uniqueFields.map(() => '?').join(', ');
  const values = uniqueFields.map(k => data[k]);

  const stmt = db.prepare(`INSERT INTO campaigns (${cols}) VALUES (${placeholders})`);
  const result = stmt.run(...values);
  return result.lastInsertRowid;
}

export function getCampaign(db, id) {
  return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
}

export function listCampaigns(db, clientId) {
  return db.prepare('SELECT * FROM campaigns WHERE client_id = ? ORDER BY created_at DESC').all(clientId);
}

export function updateCampaignStatus(db, id, status, currentStep) {
  db.prepare('UPDATE campaigns SET status = ?, current_step = ? WHERE id = ?').run(status, currentStep, id);
}

export function updateCampaignField(db, id, field, value) {
  if (!CAMPAIGN_FIELDS.has(field)) {
    throw new Error(`Invalid campaign field: ${field}`);
  }
  db.prepare(`UPDATE campaigns SET ${field} = ? WHERE id = ?`).run(value, id);
}

export function deleteCampaign(db, id) {
  const deleteTx = db.transaction(() => {
    db.prepare('DELETE FROM campaign_posts WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
  });
  deleteTx();
}

// ── Campaign Posts ────────────────────────────────────────────────

export function createCampaignPost(db, data) {
  const fields = ['campaign_id', ...Object.keys(data).filter(k => POST_FIELDS.has(k))];
  const uniqueFields = [...new Set(fields)];
  const cols = uniqueFields.join(', ');
  const placeholders = uniqueFields.map(() => '?').join(', ');
  const values = uniqueFields.map(k => data[k]);

  const stmt = db.prepare(`INSERT INTO campaign_posts (${cols}) VALUES (${placeholders})`);
  const result = stmt.run(...values);
  return result.lastInsertRowid;
}

export function bulkCreateCampaignPosts(db, posts) {
  const insertMany = db.transaction(() => {
    for (const data of posts) {
      createCampaignPost(db, data);
    }
  });
  insertMany();
}

export function listCampaignPosts(db, campaignId) {
  return db.prepare('SELECT * FROM campaign_posts WHERE campaign_id = ? ORDER BY day_number ASC').all(campaignId);
}

export function updateCampaignPost(db, id, data) {
  const fields = Object.keys(data).filter(k => POST_FIELDS.has(k));
  if (fields.length === 0) return;
  const sets = fields.map(k => `${k} = ?`).join(', ');
  const values = fields.map(k => data[k]);
  db.prepare(`UPDATE campaign_posts SET ${sets} WHERE id = ?`).run(...values, id);
}

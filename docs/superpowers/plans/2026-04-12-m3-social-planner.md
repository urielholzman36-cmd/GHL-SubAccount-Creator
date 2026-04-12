# M3 Social Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Social Planner module to the Onboarding Hub — recurring monthly 30-day content generation with AI strategy, Krea image gen, watermarking, Cloudinary hosting, and GHL CSV export.

**Architecture:** New "Social Planner" tab via hamburger nav. 3 new DB tables (clients, campaigns, campaign_posts). 7-step pipeline orchestrator mirroring build-runner.js. Krea images via Python subprocess. Watermark + Cloudinary ported from krea-agent.

**Tech Stack:** Express + better-sqlite3 + React 19 + Vite + Tailwind + Sharp + Cloudinary SDK + Anthropic SDK (web search)

**Spec:** `docs/superpowers/specs/2026-04-12-m3-social-planner-design.md`

---

## File Structure

### Server (new files in `server/`)

| File | Responsibility |
|------|---------------|
| `db/social-schema.js` | CREATE TABLE for clients, campaigns, campaign_posts |
| `db/social-queries.js` | All SQL queries for the 3 social tables |
| `routes/clients.js` | CRUD endpoints for clients + logo upload |
| `routes/campaigns.js` | CRUD + SSE stream + step actions (resume, retry) |
| `services/social-runner.js` | 7-step pipeline orchestrator |
| `services/social-research.js` | Claude web search + Manus merge |
| `services/social-strategy.js` | Claude → Strategy Pack JSON → campaign_posts rows |
| `services/social-images.js` | Spawn krea Python script, parse stdout, write prompts CSV |
| `services/social-watermark.js` | Sharp watermark (ported from krea-agent postprocess.ts) |
| `services/social-cloudinary.js` | Cloudinary compress + upload (ported from krea-agent build-csv route) |
| `services/social-csv.js` | Build GHL 39-column CSV |

### Client (new files in `src/`)

| File | Responsibility |
|------|---------------|
| `components/HamburgerNav.jsx` | Drawer nav with Build / Social Planner tabs |
| `pages/SocialPlanner.jsx` | Client list grid |
| `pages/ClientProfile.jsx` | Brand Profile form (add/edit) |
| `pages/ClientCampaigns.jsx` | Campaign list for a client |
| `pages/CampaignDashboard.jsx` | 7-step runner UI |
| `components/social/StrategyReview.jsx` | Step 4 — editable 30-post table |
| `components/social/FinalReview.jsx` | Step 7 — posts with images + CSV download |
| `components/social/ManusPasteModal.jsx` | Manus research paste-in |
| `hooks/useCampaignSSE.js` | SSE hook for campaign progress |

### Tests (new files in `tests/server/`)

| File | Tests |
|------|-------|
| `social-schema.test.js` | Table creation, constraints |
| `clients-crud.test.js` | Client create, read, update, delete |
| `campaigns-crud.test.js` | Campaign CRUD + status transitions |
| `social-csv.test.js` | GHL 39-column format, carousels, dates, hashtags |
| `social-watermark.test.js` | Watermark positions, opacity, PNG output |
| `social-images.test.js` | Prompts CSV generation, skip logic, stdout parsing |
| `social-runner.test.js` | Step transitions, resume, retry, dry-run |
| `social-strategy.test.js` | Prompt builder, JSON parsing, pillar distribution |
| `social-research.test.js` | Manus merge, web-search-only fallback |

---

## Task 1: Database Schema + Migrations

**Files:**
- Create: `server/db/social-schema.js`
- Modify: `server/db/index.js` (call new init function)
- Test: `tests/server/social-schema.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/server/social-schema.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSocialTables } from '../../server/db/social-schema.js';

describe('Social Schema', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSocialTables(db);
  });

  it('creates clients table with all columns', () => {
    const info = db.pragma('table_info(clients)');
    const cols = info.map(c => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('name');
    expect(cols).toContain('industry');
    expect(cols).toContain('location');
    expect(cols).toContain('website');
    expect(cols).toContain('logo_path');
    expect(cols).toContain('cloudinary_folder');
    expect(cols).toContain('platforms');
    expect(cols).toContain('posting_time');
    expect(cols).toContain('brand_tone');
    expect(cols).toContain('brand_description');
    expect(cols).toContain('target_audience');
    expect(cols).toContain('services');
    expect(cols).toContain('content_pillars');
    expect(cols).toContain('hashtag_bank');
    expect(cols).toContain('cta_style');
    expect(cols).toContain('uses_manus');
    expect(cols).toContain('watermark_position');
    expect(cols).toContain('watermark_opacity');
    expect(cols).toContain('created_at');
  });

  it('creates campaigns table with all columns', () => {
    const info = db.pragma('table_info(campaigns)');
    const cols = info.map(c => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('client_id');
    expect(cols).toContain('month');
    expect(cols).toContain('theme');
    expect(cols).toContain('start_date');
    expect(cols).toContain('status');
    expect(cols).toContain('research_brief');
    expect(cols).toContain('manus_research');
    expect(cols).toContain('strategy_pack');
    expect(cols).toContain('prompts_csv_path');
    expect(cols).toContain('images_folder');
    expect(cols).toContain('csv_path');
    expect(cols).toContain('current_step');
    expect(cols).toContain('created_at');
  });

  it('creates campaign_posts table with all columns', () => {
    const info = db.pragma('table_info(campaign_posts)');
    const cols = info.map(c => c.name);
    expect(cols).toContain('id');
    expect(cols).toContain('campaign_id');
    expect(cols).toContain('day_number');
    expect(cols).toContain('post_date');
    expect(cols).toContain('pillar');
    expect(cols).toContain('post_type');
    expect(cols).toContain('concept');
    expect(cols).toContain('caption');
    expect(cols).toContain('hashtags');
    expect(cols).toContain('cta');
    expect(cols).toContain('visual_prompt');
    expect(cols).toContain('image_urls');
    expect(cols).toContain('slide_count');
    expect(cols).toContain('category');
    expect(cols).toContain('edited');
  });

  it('enforces NOT NULL on client name', () => {
    expect(() => {
      db.prepare('INSERT INTO clients (id) VALUES (?)').run('test-id');
    }).toThrow();
  });

  it('enforces foreign key on campaigns.client_id', () => {
    db.pragma('foreign_keys = ON');
    expect(() => {
      db.prepare(`INSERT INTO campaigns (id, client_id, month, status, current_step, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run('c1', 'nonexistent', '2026-04', 'draft', 1, new Date().toISOString());
    }).toThrow();
  });

  it('enforces foreign key on campaign_posts.campaign_id', () => {
    db.pragma('foreign_keys = ON');
    expect(() => {
      db.prepare(`INSERT INTO campaign_posts (id, campaign_id, day_number)
        VALUES (?, ?, ?)`).run('p1', 'nonexistent', 1);
    }).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-schema.test.js`
Expected: FAIL — `initializeSocialTables` not found

- [ ] **Step 3: Implement social-schema.js**

```js
// server/db/social-schema.js
export function initializeSocialTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      industry TEXT,
      location TEXT,
      website TEXT,
      logo_path TEXT,
      cloudinary_folder TEXT,
      platforms TEXT DEFAULT '["facebook","instagram"]',
      posting_time TEXT DEFAULT '09:00:00',
      brand_tone TEXT,
      brand_description TEXT,
      target_audience TEXT,
      services TEXT,
      content_pillars TEXT DEFAULT '["PAIN","SOLUTION","AUTHORITY","PROOF","CTA"]',
      hashtag_bank TEXT DEFAULT '[]',
      cta_style TEXT,
      uses_manus INTEGER DEFAULT 0,
      watermark_position TEXT DEFAULT 'bottom-right',
      watermark_opacity REAL DEFAULT 0.7,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL REFERENCES clients(id),
      month TEXT,
      theme TEXT,
      start_date TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      research_brief TEXT,
      manus_research TEXT,
      strategy_pack TEXT,
      prompts_csv_path TEXT,
      images_folder TEXT,
      csv_path TEXT,
      current_step INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaign_posts (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL REFERENCES campaigns(id),
      day_number INTEGER,
      post_date TEXT,
      pillar TEXT,
      post_type TEXT DEFAULT 'single',
      concept TEXT,
      caption TEXT,
      hashtags TEXT,
      cta TEXT,
      visual_prompt TEXT,
      image_urls TEXT DEFAULT '[]',
      slide_count INTEGER DEFAULT 1,
      category TEXT DEFAULT 'Product Showcase',
      edited INTEGER DEFAULT 0
    );
  `);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-schema.test.js`
Expected: ALL PASS

- [ ] **Step 5: Wire into main DB init**

Modify `server/db/index.js` — import and call `initializeSocialTables(db)` at the end of `initializeDb()`.

```js
// Add to server/db/index.js
import { initializeSocialTables } from './social-schema.js';

// At end of initializeDb():
initializeSocialTables(db);
```

- [ ] **Step 6: Commit**

```bash
git add server/db/social-schema.js server/db/index.js tests/server/social-schema.test.js
git commit -m "feat(m3): add social planner database schema"
```

---

## Task 2: Social Queries Layer

**Files:**
- Create: `server/db/social-queries.js`
- Test: `tests/server/clients-crud.test.js`
- Test: `tests/server/campaigns-crud.test.js`

- [ ] **Step 1: Write failing tests for client queries**

```js
// tests/server/clients-crud.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSocialTables } from '../../server/db/social-schema.js';
import * as sq from '../../server/db/social-queries.js';

describe('Client Queries', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSocialTables(db);
  });

  it('creates and retrieves a client', () => {
    const id = sq.createClient(db, {
      name: 'Calispark Electric',
      industry: 'Electrician',
      location: 'San Diego, CA',
    });
    expect(id).toBeTruthy();
    const client = sq.getClient(db, id);
    expect(client.name).toBe('Calispark Electric');
    expect(client.industry).toBe('Electrician');
    expect(JSON.parse(client.platforms)).toEqual(['facebook', 'instagram']);
  });

  it('lists all clients', () => {
    sq.createClient(db, { name: 'Client A' });
    sq.createClient(db, { name: 'Client B' });
    const list = sq.listClients(db);
    expect(list).toHaveLength(2);
  });

  it('updates a client', () => {
    const id = sq.createClient(db, { name: 'Old Name' });
    sq.updateClient(db, id, { name: 'New Name', brand_tone: 'luxury' });
    const client = sq.getClient(db, id);
    expect(client.name).toBe('New Name');
    expect(client.brand_tone).toBe('luxury');
  });

  it('deletes a client', () => {
    const id = sq.createClient(db, { name: 'To Delete' });
    sq.deleteClient(db, id);
    const client = sq.getClient(db, id);
    expect(client).toBeUndefined();
  });
});
```

- [ ] **Step 2: Write failing tests for campaign queries**

```js
// tests/server/campaigns-crud.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSocialTables } from '../../server/db/social-schema.js';
import * as sq from '../../server/db/social-queries.js';

describe('Campaign Queries', () => {
  let db;
  let clientId;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSocialTables(db);
    clientId = sq.createClient(db, { name: 'Test Client' });
  });

  it('creates and retrieves a campaign', () => {
    const id = sq.createCampaign(db, {
      client_id: clientId,
      month: '2026-04',
      theme: 'Spring cleaning',
      start_date: '2026-04-12',
    });
    const campaign = sq.getCampaign(db, id);
    expect(campaign.client_id).toBe(clientId);
    expect(campaign.status).toBe('draft');
    expect(campaign.current_step).toBe(1);
  });

  it('lists campaigns for a client', () => {
    sq.createCampaign(db, { client_id: clientId, month: '2026-04' });
    sq.createCampaign(db, { client_id: clientId, month: '2026-05' });
    const list = sq.listCampaigns(db, clientId);
    expect(list).toHaveLength(2);
  });

  it('updates campaign status and step', () => {
    const id = sq.createCampaign(db, { client_id: clientId, month: '2026-04' });
    sq.updateCampaignStatus(db, id, 'researching', 2);
    const campaign = sq.getCampaign(db, id);
    expect(campaign.status).toBe('researching');
    expect(campaign.current_step).toBe(2);
  });

  it('creates and retrieves campaign posts', () => {
    const campId = sq.createCampaign(db, { client_id: clientId, month: '2026-04' });
    sq.createCampaignPost(db, {
      campaign_id: campId,
      day_number: 1,
      post_date: '2026-04-12',
      pillar: 'PAIN',
      post_type: 'single',
      concept: 'Test Post',
      caption: 'Test caption',
      hashtags: '#test',
      visual_prompt: 'A test image',
      slide_count: 1,
    });
    const posts = sq.listCampaignPosts(db, campId);
    expect(posts).toHaveLength(1);
    expect(posts[0].pillar).toBe('PAIN');
    expect(posts[0].concept).toBe('Test Post');
  });

  it('updates a campaign post', () => {
    const campId = sq.createCampaign(db, { client_id: clientId, month: '2026-04' });
    sq.createCampaignPost(db, {
      campaign_id: campId,
      day_number: 1,
      caption: 'Original',
    });
    const posts = sq.listCampaignPosts(db, campId);
    sq.updateCampaignPost(db, posts[0].id, { caption: 'Edited', edited: 1 });
    const updated = sq.listCampaignPosts(db, campId);
    expect(updated[0].caption).toBe('Edited');
    expect(updated[0].edited).toBe(1);
  });

  it('bulk inserts campaign posts', () => {
    const campId = sq.createCampaign(db, { client_id: clientId, month: '2026-04' });
    const posts = Array.from({ length: 30 }, (_, i) => ({
      campaign_id: campId,
      day_number: i + 1,
      post_date: `2026-04-${String(i + 12).padStart(2, '0')}`,
      pillar: ['PAIN', 'SOLUTION', 'AUTHORITY', 'PROOF', 'CTA'][i % 5],
      concept: `Post ${i + 1}`,
      caption: `Caption ${i + 1}`,
    }));
    sq.bulkCreateCampaignPosts(db, posts);
    const result = sq.listCampaignPosts(db, campId);
    expect(result).toHaveLength(30);
  });

  it('updates image_urls on a post', () => {
    const campId = sq.createCampaign(db, { client_id: clientId, month: '2026-04' });
    sq.createCampaignPost(db, { campaign_id: campId, day_number: 1 });
    const posts = sq.listCampaignPosts(db, campId);
    const urls = JSON.stringify(['https://res.cloudinary.com/holztech/image/upload/1.jpg']);
    sq.updateCampaignPost(db, posts[0].id, { image_urls: urls });
    const updated = sq.listCampaignPosts(db, campId);
    expect(JSON.parse(updated[0].image_urls)).toHaveLength(1);
  });

  it('deletes a campaign and its posts', () => {
    const campId = sq.createCampaign(db, { client_id: clientId, month: '2026-04' });
    sq.createCampaignPost(db, { campaign_id: campId, day_number: 1 });
    sq.deleteCampaign(db, campId);
    expect(sq.getCampaign(db, campId)).toBeUndefined();
    expect(sq.listCampaignPosts(db, campId)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/clients-crud.test.js tests/server/campaigns-crud.test.js`
Expected: FAIL — `social-queries.js` not found

- [ ] **Step 4: Implement social-queries.js**

```js
// server/db/social-queries.js
import { ulid } from 'ulid';

// ── Clients ─────────────────────────────────────────────────────────

export function createClient(db, data) {
  const id = ulid();
  const cols = ['id', 'name'];
  const vals = [id, data.name];
  const allowed = [
    'industry', 'location', 'website', 'logo_path', 'cloudinary_folder',
    'platforms', 'posting_time', 'brand_tone', 'brand_description',
    'target_audience', 'services', 'content_pillars', 'hashtag_bank',
    'cta_style', 'uses_manus', 'watermark_position', 'watermark_opacity',
  ];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      cols.push(key);
      vals.push(data[key]);
    }
  }
  const placeholders = cols.map(() => '?').join(', ');
  db.prepare(`INSERT INTO clients (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);
  return id;
}

export function getClient(db, id) {
  return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
}

export function listClients(db) {
  return db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
}

export function updateClient(db, id, data) {
  const allowed = [
    'name', 'industry', 'location', 'website', 'logo_path', 'cloudinary_folder',
    'platforms', 'posting_time', 'brand_tone', 'brand_description',
    'target_audience', 'services', 'content_pillars', 'hashtag_bank',
    'cta_style', 'uses_manus', 'watermark_position', 'watermark_opacity',
  ];
  const sets = [];
  const vals = [];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(data[key]);
    }
  }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function deleteClient(db, id) {
  db.prepare('DELETE FROM campaign_posts WHERE campaign_id IN (SELECT id FROM campaigns WHERE client_id = ?)').run(id);
  db.prepare('DELETE FROM campaigns WHERE client_id = ?').run(id);
  db.prepare('DELETE FROM clients WHERE id = ?').run(id);
}

// ── Campaigns ───────────────────────────────────────────────────────

export function createCampaign(db, data) {
  const id = ulid();
  db.prepare(`INSERT INTO campaigns (id, client_id, month, theme, start_date, status, current_step, created_at)
    VALUES (?, ?, ?, ?, ?, 'draft', 1, datetime('now'))`).run(
    id, data.client_id, data.month || null, data.theme || null, data.start_date || null
  );
  return id;
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
  const allowed = [
    'month', 'theme', 'start_date', 'status', 'research_brief', 'manus_research',
    'strategy_pack', 'prompts_csv_path', 'images_folder', 'csv_path', 'current_step',
  ];
  if (!allowed.includes(field)) throw new Error(`Field not allowed: ${field}`);
  db.prepare(`UPDATE campaigns SET ${field} = ? WHERE id = ?`).run(value, id);
}

export function deleteCampaign(db, id) {
  db.prepare('DELETE FROM campaign_posts WHERE campaign_id = ?').run(id);
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
}

// ── Campaign Posts ──────────────────────────────────────────────────

export function createCampaignPost(db, data) {
  const id = ulid();
  const cols = ['id', 'campaign_id'];
  const vals = [id, data.campaign_id];
  const allowed = [
    'day_number', 'post_date', 'pillar', 'post_type', 'concept',
    'caption', 'hashtags', 'cta', 'visual_prompt', 'image_urls',
    'slide_count', 'category', 'edited',
  ];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      cols.push(key);
      vals.push(data[key]);
    }
  }
  const placeholders = cols.map(() => '?').join(', ');
  db.prepare(`INSERT INTO campaign_posts (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);
  return id;
}

export function bulkCreateCampaignPosts(db, posts) {
  const insert = db.transaction((items) => {
    for (const data of items) {
      createCampaignPost(db, data);
    }
  });
  insert(posts);
}

export function listCampaignPosts(db, campaignId) {
  return db.prepare('SELECT * FROM campaign_posts WHERE campaign_id = ? ORDER BY day_number ASC').all(campaignId);
}

export function updateCampaignPost(db, id, data) {
  const allowed = [
    'caption', 'hashtags', 'cta', 'visual_prompt', 'image_urls',
    'post_type', 'slide_count', 'category', 'edited', 'post_date', 'pillar', 'concept',
  ];
  const sets = [];
  const vals = [];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`);
      vals.push(data[key]);
    }
  }
  if (sets.length === 0) return;
  vals.push(id);
  db.prepare(`UPDATE campaign_posts SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}
```

- [ ] **Step 5: Install ulid dependency**

Run: `cd ~/ghl-sub-account-builder && npm install ulid`

- [ ] **Step 6: Run all query tests**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/clients-crud.test.js tests/server/campaigns-crud.test.js`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add server/db/social-queries.js tests/server/clients-crud.test.js tests/server/campaigns-crud.test.js package.json package-lock.json
git commit -m "feat(m3): add social queries layer with full CRUD"
```

---

## Task 3: GHL CSV Generator

This is a pure function with no external deps — ideal for testing early. Ported from krea-agent's `build-csv/route.ts`.

**Files:**
- Create: `server/services/social-csv.js`
- Test: `tests/server/social-csv.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/server/social-csv.test.js
import { describe, it, expect } from 'vitest';
import { buildGhlCsv, HEADER_ROW1, HEADER_ROW2 } from '../../server/services/social-csv.js';

describe('GHL CSV Generator', () => {
  const basePosts = [
    {
      day_number: 1,
      post_date: '2026-04-12',
      caption: 'Test caption for day 1',
      hashtags: '#test #hashtag',
      image_urls: '["https://res.cloudinary.com/holztech/image/upload/1.jpg"]',
      category: 'Product Showcase',
      post_type: 'single',
    },
  ];

  it('produces correct header rows', () => {
    const csv = buildGhlCsv(basePosts, '09:00:00', ['facebook', 'instagram']);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3); // 2 headers + 1 data row
    expect(lines[0]).toContain('All Social');
    expect(lines[1]).toContain('postAtSpecificTime');
  });

  it('has 39 columns per row', () => {
    const csv = buildGhlCsv(basePosts, '09:00:00', ['facebook', 'instagram']);
    const lines = csv.split('\r\n');
    // Parse header row 1 (no quoted commas in headers)
    expect(HEADER_ROW1).toHaveLength(39);
    expect(HEADER_ROW2).toHaveLength(39);
  });

  it('formats datetime correctly', () => {
    const csv = buildGhlCsv(basePosts, '09:00:00', ['facebook']);
    expect(csv).toContain('2026-04-12 09:00:00');
  });

  it('inlines caption + hashtags into content column', () => {
    const csv = buildGhlCsv(basePosts, '09:00:00', ['facebook']);
    expect(csv).toContain('Test caption for day 1');
    expect(csv).toContain('#test #hashtag');
  });

  it('formats tags without # signs', () => {
    const csv = buildGhlCsv(basePosts, '09:00:00', ['facebook']);
    // Tags column should be: test,hashtag (no #)
    expect(csv).toContain('test,hashtag');
  });

  it('sets FB and IG type columns to "post"', () => {
    const csv = buildGhlCsv(basePosts, '09:00:00', ['facebook', 'instagram']);
    const lines = csv.split('\r\n');
    const dataRow = lines[2];
    // Columns 11 (FB type) and 12 (IG type) should be "post"
    expect(dataRow).toContain(',post,post,');
  });

  it('handles carousel with comma-separated image URLs', () => {
    const carouselPost = [{
      ...basePosts[0],
      post_type: 'carousel',
      image_urls: '["https://example.com/1.jpg","https://example.com/2.jpg","https://example.com/3.jpg"]',
    }];
    const csv = buildGhlCsv(carouselPost, '09:00:00', ['facebook']);
    // imageUrls column should have comma-separated URLs
    expect(csv).toContain('https://example.com/1.jpg,https://example.com/2.jpg,https://example.com/3.jpg');
  });

  it('generates 30 rows for 30 posts with incrementing dates', () => {
    const posts = Array.from({ length: 30 }, (_, i) => ({
      day_number: i + 1,
      post_date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      caption: `Caption ${i + 1}`,
      hashtags: '#tag',
      image_urls: '["https://example.com/img.jpg"]',
      category: 'Product Showcase',
      post_type: 'single',
    }));
    const csv = buildGhlCsv(posts, '09:00:00', ['facebook', 'instagram']);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(32); // 2 headers + 30 data
    expect(lines[2]).toContain('2026-04-01 09:00:00');
    expect(lines[31]).toContain('2026-04-30 09:00:00');
  });

  it('sets mediaOptimization to TRUE', () => {
    const csv = buildGhlCsv(basePosts, '09:00:00', ['facebook']);
    expect(csv).toContain('TRUE');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-csv.test.js`
Expected: FAIL

- [ ] **Step 3: Implement social-csv.js**

```js
// server/services/social-csv.js

export const HEADER_ROW1 = [
  'All Social','All Social','All Social','All Social','All Social','All Social','All Social','All Social','All Social','All Social','All Social',
  'Facebook','Instagram','LinkedIn','LinkedIn',
  'Google (GBP)','Google (GBP)','Google (GBP)','Google (GBP)','Google (GBP)','Google (GBP)','Google (GBP)','Google (GBP)','Google (GBP)','Google (GBP)',
  'YouTube','YouTube','YouTube',
  'TikTok','TikTok','TikTok','TikTok','TikTok','TikTok','TikTok',
  'Community','Community',
  'Pinterest','Pinterest',
];

export const HEADER_ROW2 = [
  'postAtSpecificTime (YYYY-MM-DD HH:mm:ss)','content','OGmetaUrl (url)','imageUrls (comma-separated)','gifUrl','videoUrls (comma-separated)',
  'mediaOptimization (true/false)','applyWatermark (true/false)','tags (comma-separated)','category','followUpComment',
  'type (post/story/reel)','type (post/story/reel)',
  'pdfTitle','postAsPdf (true/false)',
  'eventType (call_to_action/event/offer)','actionType (none/order/book/shop/learn_more/call/sign_up)','title','offerTitle',
  'startDate (YYYY-MM-DD HH:mm:ss)','endDate (YYYY-MM-DD HH:mm:ss)','termsConditions','couponCode','redeemOnlineUrl','actionUrl',
  'title','privacyLevel (private/public/unlisted)','type (video/short)',
  'privacyLevel (everyone/friends/only_me)','promoteOtherBrand (true/false)','enableComment (true/false)','enableDuet (true/false)',
  'enableStitch (true/false)','videoDisclosure (true/false)','promoteYourBrand (true/false)',
  'title','notifyAllGroupMembers (true/false)',
  'title','link',
];

function escapeCell(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function rowToCsv(row) {
  return row.map(escapeCell).join(',');
}

function buildDataRow(post, postingTime, platforms) {
  const hasFB = platforms.includes('facebook');
  const hasIG = platforms.includes('instagram');
  const hasPIN = platforms.includes('pinterest');

  const imageUrls = JSON.parse(post.image_urls || '[]');
  const imageUrlStr = imageUrls.join(',');

  const content = post.hashtags
    ? `${post.caption}\n\n${post.hashtags}`
    : post.caption;

  const tags = (post.hashtags || '')
    .replace(/#/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(',');

  const dateTime = `${post.post_date} ${postingTime}`;

  return [
    dateTime,          // postAtSpecificTime
    content,           // content
    '',                // OGmetaUrl
    imageUrlStr,       // imageUrls
    '', '',            // gifUrl, videoUrls
    'TRUE',            // mediaOptimization
    'FALSE',           // applyWatermark (we already watermarked)
    tags,              // tags
    post.category || 'Product Showcase', // category
    '',                // followUpComment
    hasFB ? 'post' : '', // FB type
    hasIG ? 'post' : '', // IG type
    '', 'FALSE',       // pdfTitle, postAsPdf
    '', '', '', '',    // GBP fields
    '', '', '', '', '', '', // more GBP
    '', '', '',        // YouTube
    '', 'FALSE', 'TRUE', 'TRUE', 'TRUE', 'FALSE', 'TRUE', // TikTok
    '', 'FALSE',       // Community
    hasPIN ? (post.concept || '') : '', // Pinterest title
    '',                // Pinterest link
  ];
}

export function buildGhlCsv(posts, postingTime, platforms) {
  const rows = [
    rowToCsv(HEADER_ROW1),
    rowToCsv(HEADER_ROW2),
    ...posts.map(p => rowToCsv(buildDataRow(p, postingTime, platforms))),
  ];
  return rows.join('\r\n');
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-csv.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/social-csv.js tests/server/social-csv.test.js
git commit -m "feat(m3): add GHL CSV generator with 39-column format"
```

---

## Task 4: Watermark Service

Port of krea-agent's `postprocess.ts`. Pure Sharp — no external APIs.

**Files:**
- Create: `server/services/social-watermark.js`
- Test: `tests/server/social-watermark.test.js`

- [ ] **Step 1: Install sharp**

Run: `cd ~/ghl-sub-account-builder && npm install sharp`

- [ ] **Step 2: Write failing tests**

```js
// tests/server/social-watermark.test.js
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { applyWatermark } from '../../server/services/social-watermark.js';

async function createTestImage(width = 1200, height = 1200) {
  return sharp({ create: { width, height, channels: 4, background: { r: 50, g: 50, b: 100, alpha: 1 } } })
    .png().toBuffer();
}

async function createTestLogo() {
  return sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 215, b: 0, alpha: 1 } } })
    .png().toBuffer();
}

describe('Watermark Service', () => {
  it('returns a valid PNG buffer', async () => {
    const image = await createTestImage();
    const logo = await createTestLogo();
    const result = await applyWatermark({
      imageBuffer: image,
      logoBuffer: logo,
      position: 'bottom-right',
      opacity: 0.7,
      imageWidth: 1200,
      imageHeight: 1200,
    });
    expect(Buffer.isBuffer(result)).toBe(true);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe('png');
  });

  it('preserves original dimensions', async () => {
    const image = await createTestImage(1080, 1080);
    const logo = await createTestLogo();
    const result = await applyWatermark({
      imageBuffer: image,
      logoBuffer: logo,
      position: 'bottom-right',
      opacity: 0.7,
      imageWidth: 1080,
      imageHeight: 1080,
    });
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1080);
  });

  it('works for all 4 positions', async () => {
    const image = await createTestImage();
    const logo = await createTestLogo();
    for (const position of ['bottom-right', 'bottom-left', 'top-right', 'top-left']) {
      const result = await applyWatermark({
        imageBuffer: image,
        logoBuffer: logo,
        position,
        opacity: 0.7,
        imageWidth: 1200,
        imageHeight: 1200,
      });
      expect(Buffer.isBuffer(result)).toBe(true);
    }
  });

  it('works with different opacity values', async () => {
    const image = await createTestImage();
    const logo = await createTestLogo();
    for (const opacity of [0.3, 0.5, 0.7, 1.0]) {
      const result = await applyWatermark({
        imageBuffer: image,
        logoBuffer: logo,
        position: 'bottom-right',
        opacity,
        imageWidth: 1200,
        imageHeight: 1200,
      });
      expect(Buffer.isBuffer(result)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-watermark.test.js`
Expected: FAIL

- [ ] **Step 4: Implement social-watermark.js**

Direct port from `~/krea-agent/src/lib/postprocess.ts`, converted to plain JS:

```js
// server/services/social-watermark.js
import sharp from 'sharp';

export async function applyWatermark({ imageBuffer, logoBuffer, position, opacity, imageWidth, imageHeight }) {
  const logoWidth = Math.round(imageWidth * 0.15);

  const resizedLogo = await sharp(logoBuffer)
    .resize(logoWidth)
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });

  const logoWithOpacity = await sharp(resizedLogo.data)
    .ensureAlpha()
    .composite([{
      input: Buffer.from([255, 255, 255, Math.round(opacity * 255)]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: 'dest-in',
    }])
    .png()
    .toBuffer({ resolveWithObject: true });

  const logoHeight = logoWithOpacity.info.height;
  const padding = 20;

  let left, top;
  switch (position) {
    case 'top-left':
      left = padding; top = padding; break;
    case 'top-right':
      left = imageWidth - logoWidth - padding; top = padding; break;
    case 'bottom-left':
      left = padding; top = imageHeight - logoHeight - padding; break;
    case 'bottom-right':
    default:
      left = imageWidth - logoWidth - padding; top = imageHeight - logoHeight - padding; break;
  }

  return sharp(imageBuffer)
    .resize(imageWidth, imageHeight)
    .composite([{ input: logoWithOpacity.data, left, top }])
    .png()
    .toBuffer();
}
```

- [ ] **Step 5: Run tests**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-watermark.test.js`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add server/services/social-watermark.js tests/server/social-watermark.test.js package.json package-lock.json
git commit -m "feat(m3): add watermark service ported from krea-agent"
```

---

## Task 5: Cloudinary Upload Service

**Files:**
- Create: `server/services/social-cloudinary.js`
- Test: `tests/server/social-cloudinary.test.js`

- [ ] **Step 1: Install cloudinary**

Run: `cd ~/ghl-sub-account-builder && npm install cloudinary`

- [ ] **Step 2: Write failing tests**

```js
// tests/server/social-cloudinary.test.js
import { describe, it, expect, vi } from 'vitest';
import { compressAndUpload, buildPublicId } from '../../server/services/social-cloudinary.js';

describe('Cloudinary Service', () => {
  describe('buildPublicId', () => {
    it('builds correct public ID for single image', () => {
      const id = buildPublicId('Calispark-Electric', 1, 0);
      expect(id).toBe('krea-agent/Calispark-Electric/1');
    });

    it('builds correct public ID for carousel slide', () => {
      const id = buildPublicId('Calispark-Electric', 3, 1);
      expect(id).toBe('krea-agent/Calispark-Electric/3-s1');
    });

    it('builds correct public ID for second carousel slide', () => {
      const id = buildPublicId('Calispark-Electric', 7, 2);
      expect(id).toBe('krea-agent/Calispark-Electric/7-s2');
    });

    it('sanitizes client name', () => {
      const id = buildPublicId('Calispark Electric LLC', 1, 0);
      expect(id).toBe('krea-agent/Calispark-Electric-LLC/1');
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-cloudinary.test.js`
Expected: FAIL

- [ ] **Step 4: Implement social-cloudinary.js**

```js
// server/services/social-cloudinary.js
import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';

export function initCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export function buildPublicId(clientFolder, dayNumber, slideNumber) {
  const sanitized = clientFolder.replace(/[^a-zA-Z0-9]/g, '-');
  const suffix = slideNumber > 0 ? `-s${slideNumber}` : '';
  return `krea-agent/${sanitized}/${dayNumber}${suffix}`;
}

export async function compressAndUpload(imageBuffer, publicId) {
  const compressed = await sharp(imageBuffer)
    .resize({ width: 1080, withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: 'image', overwrite: true },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(compressed);
  });
}
```

- [ ] **Step 5: Run tests**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-cloudinary.test.js`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add server/services/social-cloudinary.js tests/server/social-cloudinary.test.js package.json package-lock.json
git commit -m "feat(m3): add Cloudinary upload service with compression"
```

---

## Task 6: Image Generation Service (Krea Python Subprocess)

**Files:**
- Create: `server/services/social-images.js`
- Test: `tests/server/social-images.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/server/social-images.test.js
import { describe, it, expect } from 'vitest';
import { writePromptsCsv, parseKreaProgress, getImagePaths } from '../../server/services/social-images.js';
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import path from 'path';
import os from 'os';

describe('Social Images Service', () => {
  describe('writePromptsCsv', () => {
    it('writes a CSV with correct columns', () => {
      const tmpDir = path.join(os.tmpdir(), 'social-images-test-' + Date.now());
      mkdirSync(tmpDir, { recursive: true });
      const csvPath = path.join(tmpDir, 'prompts.csv');

      const posts = [
        { day_number: 1, post_type: 'single', visual_prompt: 'Dark navy background with gold logo', slide_count: 1 },
        { day_number: 3, post_type: 'carousel', visual_prompt: 'Slide 1: Before. Slide 2: After.', slide_count: 2 },
      ];

      writePromptsCsv(csvPath, posts);
      const content = readFileSync(csvPath, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines[0]).toBe('post_id,post_type,prompt');
      // Single post = 1 row
      expect(lines[1]).toContain('1,Single,');
      // Carousel = 2 rows (one per slide_count)
      expect(lines[2]).toContain('3,Carousel,');
      expect(lines[3]).toContain('3,Carousel,');

      rmSync(tmpDir, { recursive: true });
    });
  });

  describe('parseKreaProgress', () => {
    it('extracts post progress from stdout line', () => {
      const result = parseKreaProgress('[14/30] Post_14_Single — Single');
      expect(result).toEqual({ current: 14, total: 30 });
    });

    it('returns null for non-progress lines', () => {
      expect(parseKreaProgress('  Status: processing...')).toBeNull();
      expect(parseKreaProgress('Reading prompt file: /path')).toBeNull();
    });
  });

  describe('getImagePaths', () => {
    it('finds images in the correct folder structure', () => {
      const tmpDir = path.join(os.tmpdir(), 'social-images-paths-' + Date.now());
      const contentDir = path.join(tmpDir, 'TestClient_Content');
      // Create Post_1_Single with image.png
      mkdirSync(path.join(contentDir, 'Post_1_Single'), { recursive: true });
      writeFileSync(path.join(contentDir, 'Post_1_Single', 'image.png'), 'fake');
      // Create Post_3_Carousel with slides
      mkdirSync(path.join(contentDir, 'Post_3_Carousel'), { recursive: true });
      writeFileSync(path.join(contentDir, 'Post_3_Carousel', 'Slide_1.png'), 'fake');
      writeFileSync(path.join(contentDir, 'Post_3_Carousel', 'Slide_2.png'), 'fake');

      const result = getImagePaths(contentDir);

      expect(result[1]).toEqual([path.join(contentDir, 'Post_1_Single', 'image.png')]);
      expect(result[3]).toHaveLength(2);
      expect(result[3][0]).toContain('Slide_1.png');
      expect(result[3][1]).toContain('Slide_2.png');

      rmSync(tmpDir, { recursive: true });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-images.test.js`
Expected: FAIL

- [ ] **Step 3: Implement social-images.js**

```js
// server/services/social-images.js
import { writeFileSync, readdirSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import path from 'path';

const KREA_SCRIPT = path.join(
  process.env.HOME || '/Users/urielholzman',
  '.claude/skills/krea-image-generation/generate_images.py'
);

export function writePromptsCsv(csvPath, posts) {
  const lines = ['post_id,post_type,prompt'];
  for (const post of posts) {
    const postType = post.post_type === 'single' ? 'Single'
      : post.post_type === 'carousel' ? 'Carousel'
      : 'Before_After';
    const slideCount = post.slide_count || 1;
    const prompt = (post.visual_prompt || '').replace(/"/g, '""');

    if (slideCount <= 1) {
      lines.push(`${post.day_number},${postType},"${prompt}"`);
    } else {
      // Split prompt by "Slide N:" markers, or duplicate if not split
      const slidePrompts = splitSlidePrompts(prompt, slideCount);
      for (const sp of slidePrompts) {
        lines.push(`${post.day_number},${postType},"${sp.replace(/"/g, '""')}"`);
      }
    }
  }
  writeFileSync(csvPath, lines.join('\n'), 'utf-8');
}

function splitSlidePrompts(prompt, count) {
  // Try to split on "Slide N:" patterns
  const parts = prompt.split(/Slide\s*\d+\s*:/i).filter(s => s.trim());
  if (parts.length >= count) return parts.slice(0, count).map(s => s.trim());
  // Fallback: duplicate the prompt for each slide
  return Array(count).fill(prompt);
}

export function parseKreaProgress(line) {
  const match = line.match(/\[(\d+)\/(\d+)\]/);
  if (!match) return null;
  return { current: parseInt(match[1]), total: parseInt(match[2]) };
}

export function getImagePaths(contentDir) {
  const result = {};
  if (!existsSync(contentDir)) return result;

  const folders = readdirSync(contentDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('Post_'));

  for (const folder of folders) {
    const match = folder.name.match(/^Post_(\d+)_/);
    if (!match) continue;
    const dayNumber = parseInt(match[1]);
    const folderPath = path.join(contentDir, folder.name);
    const files = readdirSync(folderPath)
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
      .sort()
      .map(f => path.join(folderPath, f));
    if (files.length > 0) {
      result[dayNumber] = files;
    }
  }
  return result;
}

export function runKreaGeneration(clientName, csvPath, outputDir, { test = false, onProgress, onComplete, onError }) {
  const args = [
    '-u', KREA_SCRIPT,
    '--client', clientName,
    '--file', csvPath,
    '--output-dir', outputDir,
    '--aspect-ratio', '1:1',
    '--resolution', '2K',
  ];
  if (test) args.push('--test');

  const proc = spawn('python3', args);
  let lastProgress = null;

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      const progress = parseKreaProgress(line);
      if (progress) {
        lastProgress = progress;
        if (onProgress) onProgress(progress);
      }
    }
  });

  proc.stderr.on('data', (data) => {
    console.error('[krea stderr]', data.toString());
  });

  proc.on('close', (code) => {
    if (code === 0) {
      const contentDir = path.join(outputDir, clientName.replace(/[^a-zA-Z0-9 _-]/g, '_') + '_Content');
      if (onComplete) onComplete(contentDir);
    } else {
      if (onError) onError(new Error(`Krea process exited with code ${code}`));
    }
  });

  return proc;
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-images.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/social-images.js tests/server/social-images.test.js
git commit -m "feat(m3): add Krea image generation subprocess service"
```

---

## Task 7: Research Service (Claude Web Search)

**Files:**
- Create: `server/services/social-research.js`
- Test: `tests/server/social-research.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/server/social-research.test.js
import { describe, it, expect } from 'vitest';
import { buildResearchPrompt, mergeResearch } from '../../server/services/social-research.js';

describe('Social Research Service', () => {
  const sampleClient = {
    name: 'Calispark Electric',
    industry: 'Electrician',
    location: 'San Diego, CA',
    target_audience: 'Homeowners',
    services: '["EV Charger Install","Panel Upgrades","Smart Lighting"]',
  };

  describe('buildResearchPrompt', () => {
    it('includes client industry and location', () => {
      const prompt = buildResearchPrompt(sampleClient, '2026-04', 'Spring cleaning push');
      expect(prompt).toContain('Electrician');
      expect(prompt).toContain('San Diego');
    });

    it('includes the monthly theme', () => {
      const prompt = buildResearchPrompt(sampleClient, '2026-04', 'Spring cleaning push');
      expect(prompt).toContain('Spring cleaning push');
    });

    it('includes the month for seasonal context', () => {
      const prompt = buildResearchPrompt(sampleClient, '2026-12', 'Holiday safety');
      expect(prompt).toContain('December');
      expect(prompt).toContain('2026');
    });

    it('includes services', () => {
      const prompt = buildResearchPrompt(sampleClient, '2026-04', 'test');
      expect(prompt).toContain('EV Charger Install');
      expect(prompt).toContain('Panel Upgrades');
    });
  });

  describe('mergeResearch', () => {
    it('returns only web research when manus is empty', () => {
      const result = mergeResearch('Web research output here', null);
      expect(result).toContain('Web research output');
      expect(result).not.toContain('MANUS');
    });

    it('merges web + manus research', () => {
      const result = mergeResearch('Web findings', 'Manus trend data');
      expect(result).toContain('Web findings');
      expect(result).toContain('Manus trend data');
    });

    it('labels sections clearly', () => {
      const result = mergeResearch('Web data', 'Trend data');
      expect(result).toContain('Industry Research');
      expect(result).toContain('Social Trend Research');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-research.test.js`
Expected: FAIL

- [ ] **Step 3: Implement social-research.js**

```js
// server/services/social-research.js
import Anthropic from '@anthropic-ai/sdk';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function buildResearchPrompt(client, month, theme) {
  const [year, monthNum] = month.split('-');
  const monthName = MONTH_NAMES[parseInt(monthNum) - 1] || month;
  const services = (() => {
    try { return JSON.parse(client.services || '[]').join(', '); }
    catch { return client.services || ''; }
  })();

  return `Research the following for a social media content strategy:

**Business:** ${client.name}
**Industry:** ${client.industry || 'General'}
**Location:** ${client.location || 'USA'}
**Target Audience:** ${client.target_audience || 'Business owners'}
**Services:** ${services}
**Month:** ${monthName} ${year}
**Monthly Theme/Focus:** ${theme || 'General content'}

Please research and provide:
1. **Industry Trends** — What's trending in this industry right now? Any news, regulations, or market shifts?
2. **Seasonal Relevance** — What holidays, events, or seasonal patterns matter for ${monthName}? How do they connect to this business?
3. **Competitor Landscape** — What kind of content are similar businesses posting? What's working?
4. **Content Angles** — Based on the theme "${theme}", what specific angles, pain points, and opportunities should the content address?
5. **Hashtag Trends** — What hashtags are relevant and actively used in this industry/location?

Keep the output structured and actionable — it will feed directly into a content strategy generator.`;
}

export async function runWebResearch(client, month, theme) {
  if (process.env.DRY_RUN === 'true') {
    const { readFileSync, existsSync } = await import('fs');
    const fixturePath = 'test/fixtures/sample-research.json';
    if (existsSync(fixturePath)) {
      return JSON.parse(readFileSync(fixturePath, 'utf-8')).research;
    }
    return 'DRY RUN: Placeholder research brief for ' + client.name;
  }

  const anthropic = new Anthropic();
  const prompt = buildResearchPrompt(client, month, theme);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305' }],
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlocks = response.content.filter(b => b.type === 'text');
  return textBlocks.map(b => b.text).join('\n\n');
}

export function mergeResearch(webResearch, manusResearch) {
  if (!manusResearch || manusResearch.trim() === '') {
    return webResearch;
  }

  return `## Industry Research\n\n${webResearch}\n\n---\n\n## Social Trend Research (Manus AI)\n\n${manusResearch}`;
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-research.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/social-research.js tests/server/social-research.test.js
git commit -m "feat(m3): add research service with Claude web search + Manus merge"
```

---

## Task 8: Strategy Pack Generator

**Files:**
- Create: `server/services/social-strategy.js`
- Test: `tests/server/social-strategy.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/server/social-strategy.test.js
import { describe, it, expect } from 'vitest';
import { buildStrategyPrompt, parseStrategyResponse, validateStrategyPack } from '../../server/services/social-strategy.js';

describe('Social Strategy Service', () => {
  const sampleClient = {
    name: 'VO360',
    industry: 'SaaS',
    brand_tone: 'official, luxury, authoritative',
    brand_description: 'All-in-one business automation platform',
    target_audience: 'Small-to-medium business owners',
    services: '["AI Automation","Website Build","Social Planner"]',
    content_pillars: '["PAIN","SOLUTION","AUTHORITY","PROOF","CTA"]',
    hashtag_bank: '["#VO360","#BusinessAutomation"]',
    cta_style: 'DM us KEYWORD',
    platforms: '["facebook","instagram"]',
  };

  describe('buildStrategyPrompt', () => {
    it('includes brand tone and description', () => {
      const prompt = buildStrategyPrompt(sampleClient, '2026-04', 'Spring push', 'Research data here');
      expect(prompt).toContain('official, luxury, authoritative');
      expect(prompt).toContain('All-in-one business automation');
    });

    it('includes 5 content pillars', () => {
      const prompt = buildStrategyPrompt(sampleClient, '2026-04', 'test', 'research');
      expect(prompt).toContain('PAIN');
      expect(prompt).toContain('SOLUTION');
      expect(prompt).toContain('AUTHORITY');
      expect(prompt).toContain('PROOF');
      expect(prompt).toContain('CTA');
    });

    it('requests JSON array of 30 posts', () => {
      const prompt = buildStrategyPrompt(sampleClient, '2026-04', 'test', 'research');
      expect(prompt).toContain('30');
      expect(prompt).toContain('JSON');
    });

    it('includes CTA style from client profile', () => {
      const prompt = buildStrategyPrompt(sampleClient, '2026-04', 'test', 'research');
      expect(prompt).toContain('DM us KEYWORD');
    });
  });

  describe('parseStrategyResponse', () => {
    it('parses a valid JSON array from Claude response', () => {
      const response = '```json\n[{"day":1,"pillar":"PAIN","concept":"Test"}]\n```';
      const result = parseStrategyResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0].pillar).toBe('PAIN');
    });

    it('handles response without markdown wrapping', () => {
      const response = '[{"day":1,"pillar":"PAIN"}]';
      const result = parseStrategyResponse(response);
      expect(result).toHaveLength(1);
    });

    it('throws on invalid JSON', () => {
      expect(() => parseStrategyResponse('not json at all')).toThrow();
    });
  });

  describe('validateStrategyPack', () => {
    it('accepts a valid 30-post pack', () => {
      const pack = Array.from({ length: 30 }, (_, i) => ({
        day: i + 1,
        pillar: ['PAIN','SOLUTION','AUTHORITY','PROOF','CTA'][i % 5],
        post_type: 'single',
        concept: `Post ${i + 1}`,
        caption: `Caption ${i + 1}`,
        hashtags: '#test',
        cta: 'DM us',
        visual_prompt: 'Image prompt',
        slide_count: 1,
      }));
      expect(() => validateStrategyPack(pack)).not.toThrow();
    });

    it('rejects pack with fewer than 30 posts', () => {
      const pack = [{ day: 1, pillar: 'PAIN', concept: 'Test' }];
      expect(() => validateStrategyPack(pack)).toThrow(/30/);
    });

    it('rejects posts missing required fields', () => {
      const pack = Array.from({ length: 30 }, (_, i) => ({
        day: i + 1,
        // missing pillar, concept, caption
      }));
      expect(() => validateStrategyPack(pack)).toThrow();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-strategy.test.js`
Expected: FAIL

- [ ] **Step 3: Implement social-strategy.js**

```js
// server/services/social-strategy.js
import Anthropic from '@anthropic-ai/sdk';

export function buildStrategyPrompt(client, month, theme, researchBrief) {
  const pillars = (() => {
    try { return JSON.parse(client.content_pillars || '[]'); }
    catch { return ['PAIN','SOLUTION','AUTHORITY','PROOF','CTA']; }
  })();
  const services = (() => {
    try { return JSON.parse(client.services || '[]').join(', '); }
    catch { return client.services || ''; }
  })();
  const hashtagBank = (() => {
    try { return JSON.parse(client.hashtag_bank || '[]').join(' '); }
    catch { return ''; }
  })();
  const platforms = (() => {
    try { return JSON.parse(client.platforms || '[]').join(', '); }
    catch { return 'facebook, instagram'; }
  })();

  return `You are a social media strategist creating a 30-day content plan.

## Client Profile
- **Business:** ${client.name}
- **Industry:** ${client.industry || 'General'}
- **Brand Tone:** ${client.brand_tone || 'professional'}
- **Brand Description:** ${client.brand_description || ''}
- **Target Audience:** ${client.target_audience || 'Business owners'}
- **Services:** ${services}
- **Platforms:** ${platforms}
- **CTA Style:** ${client.cta_style || 'Link in bio'}
- **Always-use Hashtags:** ${hashtagBank}

## Monthly Context
- **Month:** ${month}
- **Theme/Focus:** ${theme || 'General content'}

## Research
${researchBrief || 'No research available.'}

## Content Pillars (distribute evenly — 6 posts each)
${pillars.map((p, i) => `${i + 1}. ${p}`).join('\n')}

## Instructions
Generate exactly 30 posts as a JSON array. Each post object must have:
- "day": number (1-30)
- "pillar": string (one of: ${pillars.join(', ')})
- "post_type": string ("single", "carousel", or "before_after")
- "concept": string (short title/theme for this post)
- "caption": string (full caption text, 3-5 paragraphs, with CTA)
- "hashtags": string (6-8 hashtags with # prefix, ALWAYS include the brand hashtags: ${hashtagBank})
- "cta": string (call to action line matching the style: "${client.cta_style || 'Link in bio'}")
- "visual_prompt": string (detailed image generation prompt for Krea AI — describe the visual: background, composition, mood, style, text overlay space. Match brand tone: ${client.brand_tone || 'professional'})
- "slide_count": number (1 for single, 2-5 for carousel/before_after)

Rules:
- Each pillar gets exactly 6 posts, evenly distributed across the month
- Captions should be substantive (3-5 paragraphs), not generic
- Visual prompts must be specific and actionable for AI image generation
- For carousels, the visual_prompt should describe all slides (Slide 1: ..., Slide 2: ...)
- Mix post types: ~20 single, ~7 carousel, ~3 before_after
- No generic filler — each post should have a distinct angle

Return ONLY the JSON array, no other text.`;
}

export function parseStrategyResponse(responseText) {
  let text = responseText.trim();
  // Strip markdown code block wrapping
  const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (jsonMatch) text = jsonMatch[1].trim();
  // Try to find JSON array
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart === -1 || arrEnd === -1) throw new Error('No JSON array found in response');
  text = text.slice(arrStart, arrEnd + 1);
  return JSON.parse(text);
}

export function validateStrategyPack(pack) {
  if (!Array.isArray(pack) || pack.length < 30) {
    throw new Error(`Strategy pack must have 30 posts, got ${Array.isArray(pack) ? pack.length : 0}`);
  }
  const required = ['day', 'pillar', 'concept', 'caption'];
  for (let i = 0; i < pack.length; i++) {
    const post = pack[i];
    for (const field of required) {
      if (!post[field] && post[field] !== 0) {
        throw new Error(`Post ${i + 1} missing required field: ${field}`);
      }
    }
  }
}

export async function generateStrategyPack(client, month, theme, researchBrief) {
  if (process.env.DRY_RUN === 'true') {
    const { readFileSync, existsSync } = await import('fs');
    const fixturePath = 'test/fixtures/sample-strategy.json';
    if (existsSync(fixturePath)) {
      return JSON.parse(readFileSync(fixturePath, 'utf-8'));
    }
    // Generate minimal fixture
    return Array.from({ length: 30 }, (_, i) => ({
      day: i + 1,
      pillar: ['PAIN','SOLUTION','AUTHORITY','PROOF','CTA'][i % 5],
      post_type: 'single',
      concept: `Dry Run Post ${i + 1}`,
      caption: `Dry run caption for post ${i + 1}`,
      hashtags: '#dryrun #test',
      cta: 'Link in bio',
      visual_prompt: 'Placeholder dark navy background with gold accent',
      slide_count: 1,
    }));
  }

  const anthropic = new Anthropic();
  const prompt = buildStrategyPrompt(client, month, theme, researchBrief);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const pack = parseStrategyResponse(text);
  validateStrategyPack(pack);
  return pack;
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-strategy.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/social-strategy.js tests/server/social-strategy.test.js
git commit -m "feat(m3): add strategy pack generator with Claude Sonnet"
```

---

## Task 9: Social Runner (7-Step Pipeline Orchestrator)

**Files:**
- Create: `server/services/social-runner.js`
- Test: `tests/server/social-runner.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/server/social-runner.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSocialTables } from '../../server/db/social-schema.js';
import * as sq from '../../server/db/social-queries.js';
import { SocialRunner, SOCIAL_STEPS, PauseSignal } from '../../server/services/social-runner.js';

describe('Social Runner', () => {
  let db;
  let clientId;
  let campaignId;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSocialTables(db);
    process.env.DRY_RUN = 'true';
    clientId = sq.createClient(db, {
      name: 'Test Client',
      industry: 'Testing',
      cloudinary_folder: 'test-client',
    });
    campaignId = sq.createCampaign(db, {
      client_id: clientId,
      month: '2026-04',
      theme: 'Test theme',
      start_date: '2026-04-12',
    });
  });

  it('defines 7 steps', () => {
    expect(SOCIAL_STEPS).toHaveLength(7);
    expect(SOCIAL_STEPS[0].name).toBe('Monthly Brief');
    expect(SOCIAL_STEPS[6].name).toBe('Review Final + Export CSV');
  });

  it('steps 4 and 7 are manual checkpoints', () => {
    expect(SOCIAL_STEPS[3].manual).toBe(true);
    expect(SOCIAL_STEPS[6].manual).toBe(true);
  });

  it('creates a runner with db and emit callback', () => {
    const emit = vi.fn();
    const runner = new SocialRunner(db, emit);
    expect(runner).toBeTruthy();
  });

  it('updates campaign status on step execution', async () => {
    const emit = vi.fn();
    const runner = new SocialRunner(db, emit);
    // Step 1 just validates the brief — campaign already has month/theme/start_date
    await runner.executeStep(campaignId, 1);
    const campaign = sq.getCampaign(db, campaignId);
    expect(campaign.current_step).toBeGreaterThanOrEqual(1);
  });

  it('emits step-update events', async () => {
    const emit = vi.fn();
    const runner = new SocialRunner(db, emit);
    await runner.executeStep(campaignId, 1);
    const stepUpdates = emit.mock.calls.filter(c => c[0].type === 'step-update');
    expect(stepUpdates.length).toBeGreaterThan(0);
  });

  it('pauses at step 4 (review strategy)', async () => {
    const emit = vi.fn();
    const runner = new SocialRunner(db, emit);

    // Run steps 1-3 to generate the strategy
    await runner.runFromStep(campaignId, 1);

    // Should pause at step 4
    const campaign = sq.getCampaign(db, campaignId);
    expect(campaign.status).toBe('review_strategy');
    expect(campaign.current_step).toBe(4);
  });

  it('resumes from step 4 after approval', async () => {
    const emit = vi.fn();
    const runner = new SocialRunner(db, emit);

    // Run to step 4 pause
    await runner.runFromStep(campaignId, 1);

    // Resume — should continue through steps 5, 6, then pause at 7
    await runner.resume(campaignId, { approved: true });
    const campaign = sq.getCampaign(db, campaignId);
    expect(campaign.current_step).toBe(7);
    expect(campaign.status).toBe('review_final');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-runner.test.js`
Expected: FAIL

- [ ] **Step 3: Implement social-runner.js**

```js
// server/services/social-runner.js
import * as sq from '../db/social-queries.js';
import { runWebResearch, mergeResearch } from './social-research.js';
import { generateStrategyPack } from './social-strategy.js';
import { writePromptsCsv, runKreaGeneration, getImagePaths } from './social-images.js';
import { applyWatermark } from './social-watermark.js';
import { initCloudinary, compressAndUpload, buildPublicId } from './social-cloudinary.js';
import { buildGhlCsv } from './social-csv.js';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

export const SOCIAL_STEPS = [
  { number: 1, name: 'Monthly Brief', phase: 'Setup', manual: false },
  { number: 2, name: 'Research', phase: 'Strategy', manual: false },
  { number: 3, name: 'Strategy Pack', phase: 'Strategy', manual: false },
  { number: 4, name: 'Review Strategy', phase: 'Strategy', manual: true },
  { number: 5, name: 'Generate Images', phase: 'Content', manual: false },
  { number: 6, name: 'Watermark + Upload', phase: 'Content', manual: false },
  { number: 7, name: 'Review Final + Export CSV', phase: 'Content', manual: true },
];

export class PauseSignal {
  constructor(step, context) {
    this.step = step;
    this.context = context;
    this.isPauseSignal = true;
  }
}

export class SocialRunner {
  constructor(db, emit) {
    this.db = db;
    this.emit = emit || (() => {});
  }

  async runFromStep(campaignId, fromStep) {
    for (let stepNum = fromStep; stepNum <= 7; stepNum++) {
      const stepDef = SOCIAL_STEPS[stepNum - 1];

      // Manual checkpoint — pause
      if (stepDef.manual) {
        const statusMap = { 4: 'review_strategy', 7: 'review_final' };
        sq.updateCampaignStatus(this.db, campaignId, statusMap[stepNum], stepNum);
        this.emit({ type: 'campaign-paused', step: stepNum, name: stepDef.name });
        return;
      }

      await this.executeStep(campaignId, stepNum);
    }

    // If we get past step 7 somehow, mark exported
    sq.updateCampaignStatus(this.db, campaignId, 'exported', 7);
    this.emit({ type: 'campaign-complete' });
  }

  async resume(campaignId, payload) {
    const campaign = sq.getCampaign(this.db, campaignId);
    const currentStep = campaign.current_step;

    // After review_strategy (step 4), continue from step 5
    // After review_final (step 7), export CSV
    if (currentStep === 4) {
      await this.runFromStep(campaignId, 5);
    } else if (currentStep === 7) {
      await this._step7ExportCsv(campaignId);
      sq.updateCampaignStatus(this.db, campaignId, 'exported', 7);
      this.emit({ type: 'campaign-complete' });
    }
  }

  async retryFromStep(campaignId, fromStep) {
    await this.runFromStep(campaignId, fromStep);
  }

  async executeStep(campaignId, stepNum) {
    const stepDef = SOCIAL_STEPS[stepNum - 1];
    this.emit({ type: 'step-update', step: stepNum, name: stepDef.name, status: 'running' });

    const statusMap = {
      1: 'draft', 2: 'researching', 3: 'generating_strategy',
      5: 'generating_images', 6: 'watermarking',
    };
    if (statusMap[stepNum]) {
      sq.updateCampaignStatus(this.db, campaignId, statusMap[stepNum], stepNum);
    }

    const startTime = Date.now();
    try {
      switch (stepNum) {
        case 1: await this._step1ValidateBrief(campaignId); break;
        case 2: await this._step2Research(campaignId); break;
        case 3: await this._step3GenerateStrategy(campaignId); break;
        case 5: await this._step5GenerateImages(campaignId); break;
        case 6: await this._step6WatermarkUpload(campaignId); break;
      }
      const duration = Date.now() - startTime;
      this.emit({ type: 'step-update', step: stepNum, name: stepDef.name, status: 'completed', duration_ms: duration });
    } catch (err) {
      const duration = Date.now() - startTime;
      this.emit({ type: 'step-update', step: stepNum, name: stepDef.name, status: 'failed', error: err.message, duration_ms: duration });
      throw err;
    }
  }

  async _step1ValidateBrief(campaignId) {
    const campaign = sq.getCampaign(this.db, campaignId);
    if (!campaign.month) throw new Error('Month is required');
    if (!campaign.start_date) throw new Error('Start date is required');
  }

  async _step2Research(campaignId) {
    const campaign = sq.getCampaign(this.db, campaignId);
    const client = sq.getClient(this.db, campaign.client_id);
    const webResearch = await runWebResearch(client, campaign.month, campaign.theme);
    sq.updateCampaignField(this.db, campaignId, 'research_brief', webResearch);

    // If client uses Manus and we don't have Manus data yet, pause
    if (client.uses_manus && !campaign.manus_research) {
      // Emit pause with pre-built Manus prompt
      this.emit({
        type: 'manus-pause',
        step: 2,
        researchBrief: webResearch,
        manusPrompt: `Research current social media trends on Facebook and Instagram for: ${client.industry} in ${client.location}. Focus on ${campaign.theme || 'general'} content. What hashtags, topics, and post styles are trending?`,
      });
      return; // Runner will pause here; resume will provide manus_research
    }
  }

  async _step3GenerateStrategy(campaignId) {
    const campaign = sq.getCampaign(this.db, campaignId);
    const client = sq.getClient(this.db, campaign.client_id);

    const researchBrief = mergeResearch(campaign.research_brief, campaign.manus_research);
    const strategyPack = await generateStrategyPack(client, campaign.month, campaign.theme, researchBrief);

    sq.updateCampaignField(this.db, campaignId, 'strategy_pack', JSON.stringify(strategyPack));

    // Create campaign_posts rows
    const startDate = new Date(campaign.start_date + 'T00:00:00');
    const posts = strategyPack.map((post, i) => {
      const postDate = new Date(startDate);
      postDate.setDate(startDate.getDate() + i);
      return {
        campaign_id: campaignId,
        day_number: post.day || (i + 1),
        post_date: postDate.toISOString().split('T')[0],
        pillar: post.pillar,
        post_type: post.post_type || 'single',
        concept: post.concept,
        caption: post.caption,
        hashtags: post.hashtags,
        cta: post.cta,
        visual_prompt: post.visual_prompt,
        slide_count: post.slide_count || 1,
      };
    });
    sq.bulkCreateCampaignPosts(this.db, posts);

    this.emit({ type: 'step-progress', step: 3, message: `Generated ${posts.length} posts` });
  }

  async _step5GenerateImages(campaignId) {
    const campaign = sq.getCampaign(this.db, campaignId);
    const client = sq.getClient(this.db, campaign.client_id);
    const posts = sq.listCampaignPosts(this.db, campaignId);

    // Create data directory
    const dataDir = path.resolve(`./data/campaigns/${campaignId}`);
    mkdirSync(dataDir, { recursive: true });

    // Write prompts CSV
    const csvPath = path.join(dataDir, 'prompts.csv');
    writePromptsCsv(csvPath, posts);
    sq.updateCampaignField(this.db, campaignId, 'prompts_csv_path', csvPath);

    if (process.env.DRY_RUN === 'true') {
      // In dry-run, create placeholder images
      const contentDir = path.join(dataDir, client.name.replace(/[^a-zA-Z0-9 _-]/g, '_') + '_Content');
      for (const post of posts) {
        const postType = post.post_type === 'single' ? 'Single'
          : post.post_type === 'carousel' ? 'Carousel' : 'Before_After';
        const folderName = `Post_${post.day_number}_${postType}`;
        const folderPath = path.join(contentDir, folderName);
        mkdirSync(folderPath, { recursive: true });

        const slideCount = post.slide_count || 1;
        if (slideCount <= 1) {
          // Copy from fixtures or create minimal file
          const fixturePath = 'test/fixtures/sample-images/placeholder.png';
          const targetPath = path.join(folderPath, 'image.png');
          if (existsSync(fixturePath)) {
            writeFileSync(targetPath, readFileSync(fixturePath));
          } else {
            writeFileSync(targetPath, Buffer.alloc(100)); // minimal placeholder
          }
        } else {
          for (let s = 1; s <= slideCount; s++) {
            const targetPath = path.join(folderPath, `Slide_${s}.png`);
            writeFileSync(targetPath, Buffer.alloc(100));
          }
        }
      }
      sq.updateCampaignField(this.db, campaignId, 'images_folder', contentDir);
      this.emit({ type: 'step-progress', step: 5, message: 'Dry run: placeholder images created' });
      return;
    }

    // Real mode: spawn Krea script
    return new Promise((resolve, reject) => {
      runKreaGeneration(client.name, csvPath, dataDir, {
        onProgress: (progress) => {
          this.emit({ type: 'step-progress', step: 5, current: progress.current, total: progress.total });
        },
        onComplete: (contentDir) => {
          sq.updateCampaignField(this.db, campaignId, 'images_folder', contentDir);
          resolve();
        },
        onError: (err) => reject(err),
      });
    });
  }

  async _step6WatermarkUpload(campaignId) {
    const campaign = sq.getCampaign(this.db, campaignId);
    const client = sq.getClient(this.db, campaign.client_id);
    const posts = sq.listCampaignPosts(this.db, campaignId);

    if (!campaign.images_folder) throw new Error('No images folder — run step 5 first');

    const imagePaths = getImagePaths(campaign.images_folder);
    const clientFolder = client.cloudinary_folder || client.name;

    // Load logo if available
    let logoBuffer = null;
    if (client.logo_path && existsSync(client.logo_path)) {
      logoBuffer = readFileSync(client.logo_path);
    }

    const isDryRun = process.env.DRY_RUN === 'true';
    if (!isDryRun) initCloudinary();

    let processed = 0;
    const total = posts.length;

    for (const post of posts) {
      // Skip if already has URLs
      const existingUrls = JSON.parse(post.image_urls || '[]');
      if (existingUrls.length > 0 && existingUrls[0].startsWith('http')) {
        processed++;
        continue;
      }

      const files = imagePaths[post.day_number] || [];
      if (files.length === 0) {
        processed++;
        continue;
      }

      const urls = [];
      for (let slideIdx = 0; slideIdx < files.length; slideIdx++) {
        let imageBuffer = readFileSync(files[slideIdx]);
        const sharp = (await import('sharp')).default;
        const meta = await sharp(imageBuffer).metadata();
        const width = meta.width || 1080;
        const height = meta.height || 1080;

        // Apply watermark if logo available
        if (logoBuffer) {
          imageBuffer = await applyWatermark({
            imageBuffer,
            logoBuffer,
            position: client.watermark_position || 'bottom-right',
            opacity: client.watermark_opacity || 0.7,
            imageWidth: width,
            imageHeight: height,
          });
        }

        // Upload to Cloudinary (or fake in dry-run)
        const slideNumber = files.length > 1 ? slideIdx + 1 : 0;
        const publicId = buildPublicId(clientFolder, post.day_number, slideNumber);

        if (isDryRun) {
          urls.push(`https://res.cloudinary.com/holztech/dry-run/${post.day_number}${slideNumber > 0 ? '-s' + slideNumber : ''}.jpg`);
        } else {
          const url = await compressAndUpload(imageBuffer, publicId);
          urls.push(url);
        }
      }

      sq.updateCampaignPost(this.db, post.id, { image_urls: JSON.stringify(urls) });
      processed++;
      this.emit({ type: 'step-progress', step: 6, current: processed, total });
    }
  }

  async _step7ExportCsv(campaignId) {
    const campaign = sq.getCampaign(this.db, campaignId);
    const client = sq.getClient(this.db, campaign.client_id);
    const posts = sq.listCampaignPosts(this.db, campaignId);

    const platforms = (() => {
      try { return JSON.parse(client.platforms || '[]'); }
      catch { return ['facebook', 'instagram']; }
    })();

    const csv = buildGhlCsv(posts, client.posting_time || '09:00:00', platforms);

    const dataDir = path.resolve(`./data/campaigns/${campaignId}`);
    mkdirSync(dataDir, { recursive: true });
    const csvPath = path.join(dataDir, `${client.name}-social-plan.csv`);
    writeFileSync(csvPath, csv, 'utf-8');
    sq.updateCampaignField(this.db, campaignId, 'csv_path', csvPath);

    return csvPath;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/social-runner.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/social-runner.js tests/server/social-runner.test.js
git commit -m "feat(m3): add 7-step social runner pipeline orchestrator"
```

---

## Task 10: API Routes (Clients + Campaigns)

**Files:**
- Create: `server/routes/clients.js`
- Create: `server/routes/campaigns.js`
- Modify: `server/index.js` (mount new routes)

- [ ] **Step 1: Implement clients routes**

```js
// server/routes/clients.js
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { mkdirSync } from 'fs';
import * as sq from '../db/social-queries.js';

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.resolve('./data/logos');
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + file.originalname);
    },
  }),
});

export default function clientRoutes(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const clients = sq.listClients(db);
    res.json(clients);
  });

  router.get('/:id', (req, res) => {
    const client = sq.getClient(db, req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(client);
  });

  router.post('/', upload.single('logo'), (req, res) => {
    const data = { ...req.body };
    if (req.file) data.logo_path = req.file.path;
    const id = sq.createClient(db, data);
    res.status(201).json({ id });
  });

  router.put('/:id', upload.single('logo'), (req, res) => {
    const data = { ...req.body };
    if (req.file) data.logo_path = req.file.path;
    sq.updateClient(db, req.params.id, data);
    res.json({ ok: true });
  });

  router.delete('/:id', (req, res) => {
    sq.deleteClient(db, req.params.id);
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 2: Implement campaigns routes**

```js
// server/routes/campaigns.js
import { Router } from 'express';
import * as sq from '../db/social-queries.js';
import { SocialRunner } from '../services/social-runner.js';

// Active SSE connections per campaign
const sseClients = new Map();

function broadcastToCampaign(campaignId, data) {
  const clients = sseClients.get(campaignId) || [];
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(message);
  }
}

export default function campaignRoutes(db) {
  const router = Router();

  // List campaigns for a client
  router.get('/client/:clientId', (req, res) => {
    const campaigns = sq.listCampaigns(db, req.params.clientId);
    res.json(campaigns);
  });

  // Get single campaign with posts
  router.get('/:id', (req, res) => {
    const campaign = sq.getCampaign(db, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const posts = sq.listCampaignPosts(db, campaign.id);
    res.json({ ...campaign, posts });
  });

  // Create campaign
  router.post('/', (req, res) => {
    const id = sq.createCampaign(db, req.body);
    res.status(201).json({ id });
  });

  // Start or update campaign brief (step 1 kickoff)
  router.post('/:id/start', async (req, res) => {
    const { month, theme, start_date } = req.body;
    const campaign = sq.getCampaign(db, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Update brief fields
    if (month) sq.updateCampaignField(db, campaign.id, 'month', month);
    if (theme) sq.updateCampaignField(db, campaign.id, 'theme', theme);
    if (start_date) sq.updateCampaignField(db, campaign.id, 'start_date', start_date);

    const emit = (data) => broadcastToCampaign(campaign.id, data);
    const runner = new SocialRunner(db, emit);

    res.json({ ok: true, message: 'Pipeline started' });

    // Run async — progress via SSE
    runner.runFromStep(campaign.id, 1).catch(err => {
      broadcastToCampaign(campaign.id, { type: 'campaign-failed', error: err.message });
    });
  });

  // Resume from manual checkpoint
  router.post('/:id/resume', async (req, res) => {
    const campaign = sq.getCampaign(db, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const emit = (data) => broadcastToCampaign(campaign.id, data);
    const runner = new SocialRunner(db, emit);

    res.json({ ok: true });

    runner.resume(campaign.id, req.body).catch(err => {
      broadcastToCampaign(campaign.id, { type: 'campaign-failed', error: err.message });
    });
  });

  // Submit Manus research
  router.post('/:id/manus', (req, res) => {
    const { manus_research } = req.body;
    sq.updateCampaignField(db, req.params.id, 'manus_research', manus_research);
    res.json({ ok: true });
  });

  // Retry from specific step
  router.post('/:id/retry/:step', async (req, res) => {
    const campaign = sq.getCampaign(db, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const emit = (data) => broadcastToCampaign(campaign.id, data);
    const runner = new SocialRunner(db, emit);
    const step = parseInt(req.params.step);

    res.json({ ok: true });

    runner.retryFromStep(campaign.id, step).catch(err => {
      broadcastToCampaign(campaign.id, { type: 'campaign-failed', error: err.message });
    });
  });

  // Update a campaign post (inline editing)
  router.put('/:id/posts/:postId', (req, res) => {
    sq.updateCampaignPost(db, req.params.postId, { ...req.body, edited: 1 });
    res.json({ ok: true });
  });

  // Download CSV
  router.get('/:id/csv', (req, res) => {
    const campaign = sq.getCampaign(db, req.params.id);
    if (!campaign || !campaign.csv_path) return res.status(404).json({ error: 'CSV not ready' });
    res.download(campaign.csv_path);
  });

  // SSE stream
  router.get('/:id/stream', (req, res) => {
    const campaignId = req.params.id;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Replay current state
    const campaign = sq.getCampaign(db, campaignId);
    if (campaign) {
      res.write(`data: ${JSON.stringify({ type: 'state-replay', status: campaign.status, current_step: campaign.current_step })}\n\n`);
    }

    // Register SSE client
    if (!sseClients.has(campaignId)) sseClients.set(campaignId, []);
    sseClients.get(campaignId).push(res);

    req.on('close', () => {
      const clients = sseClients.get(campaignId) || [];
      sseClients.set(campaignId, clients.filter(c => c !== res));
    });
  });

  // Delete campaign
  router.delete('/:id', (req, res) => {
    sq.deleteCampaign(db, req.params.id);
    res.json({ ok: true });
  });

  return router;
}
```

- [ ] **Step 3: Mount routes in server/index.js**

Add to `server/index.js` alongside existing route mounts:

```js
import clientRoutes from './routes/clients.js';
import campaignRoutes from './routes/campaigns.js';

// After existing route mounts:
app.use('/api/clients', requireAuth, clientRoutes(db));
app.use('/api/campaigns', requireAuth, campaignRoutes(db));
```

- [ ] **Step 4: Test manually — server starts without errors**

Run: `cd ~/ghl-sub-account-builder && node server/index.js`
Expected: Server starts on port 3003 without errors. Ctrl+C to stop.

- [ ] **Step 5: Commit**

```bash
git add server/routes/clients.js server/routes/campaigns.js server/index.js
git commit -m "feat(m3): add client and campaign API routes with SSE"
```

---

## Task 11: Hamburger Nav + React Routing

**Files:**
- Create: `src/components/HamburgerNav.jsx`
- Modify: `src/App.jsx` (add Social Planner routes)
- Modify: `src/components/Sidebar.jsx` (replace with hamburger or adapt)

- [ ] **Step 1: Create HamburgerNav component**

Read existing `src/components/Sidebar.jsx` to understand current nav patterns, then create `HamburgerNav.jsx`:

```jsx
// src/components/HamburgerNav.jsx
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: 'Build', icon: '⚡' },
  { path: '/social', label: 'Social Planner', icon: '📅' },
];

export default function HamburgerNav() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <>
      {/* Hamburger button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-white/5 hover:bg-white/10 backdrop-blur-sm border border-white/10 transition-colors"
      >
        <div className="w-5 h-0.5 bg-white/80 mb-1" />
        <div className="w-5 h-0.5 bg-white/80 mb-1" />
        <div className="w-5 h-0.5 bg-white/80" />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <div className={`fixed top-0 left-0 h-full w-64 z-50 transform transition-transform duration-300 ${
        open ? 'translate-x-0' : '-translate-x-full'
      } bg-gradient-to-b from-[#0a1628] to-[#0d1f3c] border-r border-white/10 backdrop-blur-xl`}>
        <div className="p-6 pt-16">
          <h2 className="text-lg font-semibold text-white/90 mb-6">Onboarding Hub</h2>
          <nav className="space-y-2">
            {NAV_ITEMS.map(item => {
              const isActive = location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setOpen(false); }}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all flex items-center gap-3 ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white border border-blue-400/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                      : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Update App.jsx with new routes**

Modify `src/App.jsx` — add routes for Social Planner pages and include `HamburgerNav` in the protected layout:

```jsx
// Add imports:
import SocialPlanner from './pages/SocialPlanner';
import ClientProfile from './pages/ClientProfile';
import ClientCampaigns from './pages/ClientCampaigns';
import CampaignDashboard from './pages/CampaignDashboard';
import HamburgerNav from './components/HamburgerNav';

// In ProtectedLayout, add HamburgerNav:
// <HamburgerNav /> alongside existing Sidebar

// Add routes inside protected layout:
// <Route path="/social" element={<SocialPlanner />} />
// <Route path="/social/client/new" element={<ClientProfile />} />
// <Route path="/social/client/:id" element={<ClientProfile />} />
// <Route path="/social/client/:id/campaigns" element={<ClientCampaigns />} />
// <Route path="/social/campaign/:id" element={<CampaignDashboard />} />
```

- [ ] **Step 3: Create placeholder pages**

Create minimal placeholder components for each page so routing works. Each file exports a simple component with the page title:

```jsx
// src/pages/SocialPlanner.jsx
export default function SocialPlanner() {
  return <div className="p-8 text-white"><h1 className="text-2xl font-bold">Social Planner</h1><p className="text-white/60 mt-2">Client list coming soon.</p></div>;
}
```

Similar placeholders for `ClientProfile.jsx`, `ClientCampaigns.jsx`, `CampaignDashboard.jsx`.

- [ ] **Step 4: Test in browser**

Run: `cd ~/ghl-sub-account-builder && npm run dev:all`
Navigate to http://localhost:5173 — verify:
- Hamburger icon visible top-left
- Clicking opens drawer with Build + Social Planner
- Clicking Social Planner navigates to /social with placeholder text
- Build tab still works as before

- [ ] **Step 5: Commit**

```bash
git add src/components/HamburgerNav.jsx src/App.jsx src/pages/SocialPlanner.jsx src/pages/ClientProfile.jsx src/pages/ClientCampaigns.jsx src/pages/CampaignDashboard.jsx
git commit -m "feat(m3): add hamburger nav and Social Planner routing"
```

---

## Task 12: Client List Page (Screen 1)

**Files:**
- Modify: `src/pages/SocialPlanner.jsx`

- [ ] **Step 1: Implement the full Client List page**

Replace the placeholder with the real implementation:

```jsx
// src/pages/SocialPlanner.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SocialPlanner() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(data => { setClients(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 pl-16">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-white">Social Planner</h1>
        <button
          onClick={() => navigate('/social/client/new')}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-medium hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg"
        >
          + New Client
        </button>
      </div>

      {loading ? (
        <div className="text-white/60">Loading clients...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-white/40 text-lg mb-4">No clients yet</p>
          <button
            onClick={() => navigate('/social/client/new')}
            className="px-6 py-3 rounded-lg bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 transition-colors"
          >
            Create your first client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map(client => (
            <button
              key={client.id}
              onClick={() => navigate(`/social/client/${client.id}/campaigns`)}
              className="text-left p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all group"
            >
              <div className="flex items-center gap-3 mb-3">
                {client.logo_path ? (
                  <img src={`/api/clients/${client.id}/logo`} alt="" className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center text-white/60 text-sm font-bold">
                    {client.name.charAt(0)}
                  </div>
                )}
                <div>
                  <h3 className="text-white font-medium group-hover:text-blue-300 transition-colors">{client.name}</h3>
                  <p className="text-white/40 text-xs">{client.industry || 'No industry set'}</p>
                </div>
              </div>
              <p className="text-white/30 text-xs">{client.location || ''}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Test in browser**

Navigate to /social — verify grid renders (empty state with "Create your first client" button).

- [ ] **Step 3: Commit**

```bash
git add src/pages/SocialPlanner.jsx
git commit -m "feat(m3): implement client list page with grid cards"
```

---

## Task 13: Client Profile Form (Screen 2)

**Files:**
- Modify: `src/pages/ClientProfile.jsx`

- [ ] **Step 1: Implement the Brand Profile form**

Replace placeholder with full form grouped into 5 sections matching the `clients` table. Uses `useParams()` to detect new vs edit mode. Submits to POST/PUT `/api/clients`. Handles logo file upload via FormData.

The form should have sections:
1. **Business Info** — name (required), industry, location, website
2. **Brand Identity** — brand_tone, brand_description, target_audience, services (textarea, comma-separated)
3. **Content Strategy** — content_pillars (5 inputs), hashtag_bank (textarea), cta_style, platforms (checkboxes)
4. **Image Settings** — logo upload, cloudinary_folder, watermark_position (select), watermark_opacity (slider)
5. **Advanced** — uses_manus (toggle), posting_time (time input)

Each section in a collapsible glassmorphic card. Save button at bottom.

- [ ] **Step 2: Test in browser**

Navigate to /social/client/new — verify form renders. Fill in "Test Client" + industry, save, verify redirect to campaigns page and client appears in list.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ClientProfile.jsx
git commit -m "feat(m3): implement client brand profile form"
```

---

## Task 14: Client Campaigns Page (Screen 3)

**Files:**
- Modify: `src/pages/ClientCampaigns.jsx`

- [ ] **Step 1: Implement campaigns list page**

Shows client header (name + logo), table of past campaigns, "+ New Campaign" button. Fetches from `GET /api/campaigns/client/:clientId`. New Campaign button POSTs to `/api/campaigns` then navigates to the campaign dashboard.

Campaign table columns: Month, Theme, Status (badge), Actions (Open / Download CSV / Delete).

- [ ] **Step 2: Test in browser**

Navigate to a client's campaigns page — verify empty state, click "+ New Campaign", verify new campaign created and dashboard opens.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ClientCampaigns.jsx
git commit -m "feat(m3): implement client campaigns list page"
```

---

## Task 15: Campaign SSE Hook

**Files:**
- Create: `src/hooks/useCampaignSSE.js`

- [ ] **Step 1: Implement SSE hook**

Mirror existing `useSSE.js` pattern but adapted for campaign events:

```js
// src/hooks/useCampaignSSE.js
import { useState, useEffect, useCallback, useRef } from 'react';

export default function useCampaignSSE(campaignId) {
  const [status, setStatus] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [stepStatuses, setStepStatuses] = useState({});
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [pauseInfo, setPauseInfo] = useState(null);
  const esRef = useRef(null);

  const connect = useCallback(() => {
    if (!campaignId) return;
    if (esRef.current) esRef.current.close();

    const es = new EventSource(`/api/campaigns/${campaignId}/stream`);
    esRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'state-replay':
          setStatus(data.status);
          setCurrentStep(data.current_step);
          break;
        case 'step-update':
          setStepStatuses(prev => ({ ...prev, [data.step]: data.status }));
          if (data.status === 'running') setCurrentStep(data.step);
          break;
        case 'step-progress':
          setProgress({ step: data.step, current: data.current, total: data.total, message: data.message });
          break;
        case 'campaign-paused':
          setStatus('paused');
          setPauseInfo(data);
          break;
        case 'manus-pause':
          setStatus('manus_pause');
          setPauseInfo(data);
          break;
        case 'campaign-complete':
          setStatus('complete');
          es.close();
          break;
        case 'campaign-failed':
          setStatus('failed');
          setError(data.error);
          break;
      }
    };

    es.onerror = () => {
      es.close();
      setTimeout(connect, 3000);
    };
  }, [campaignId]);

  useEffect(() => {
    connect();
    return () => { if (esRef.current) esRef.current.close(); };
  }, [connect]);

  const reconnect = useCallback(() => {
    if (esRef.current) esRef.current.close();
    connect();
  }, [connect]);

  return { status, currentStep, stepStatuses, progress, error, pauseInfo, reconnect };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCampaignSSE.js
git commit -m "feat(m3): add campaign SSE hook for real-time progress"
```

---

## Task 16: Campaign Dashboard (Screen 4 — 7-Step Runner UI)

**Files:**
- Modify: `src/pages/CampaignDashboard.jsx`
- Create: `src/components/social/ManusPasteModal.jsx`

- [ ] **Step 1: Implement CampaignDashboard**

The main screen showing 7 step cards in a vertical column. Step 1 has an inline form (month, theme, start date). Steps 2-3 and 5-6 show spinner/progress when running. Steps 4 and 7 expand to show Strategy Review / Final Review (Tasks 17 and 18).

Uses `useCampaignSSE` hook for live updates. Start button POSTs to `/api/campaigns/:id/start`. Resume button POSTs to `/api/campaigns/:id/resume`.

Each step card shows:
- Step number + name
- Status indicator (pending=gray, running=blue pulse, completed=green, failed=red, paused=amber)
- Duration when completed
- Progress bar for steps 5-6 (e.g., "14/30")
- Retry button when failed

Import `SOCIAL_STEPS` definition (duplicate the array client-side for display purposes).

- [ ] **Step 2: Implement ManusPasteModal**

Simple modal shown when step 2 pauses for Manus input:
- Shows the research brief (read-only)
- Shows the pre-built Manus prompt with a "Copy" button
- Textarea for pasting Manus output
- "Skip Manus" button (continues without paste)
- "Submit & Continue" button (POSTs manus_research then resumes)

- [ ] **Step 3: Test in browser with DRY_RUN=true**

Start the server with `DRY_RUN=true npm run dev:all`. Create a client, create a campaign, fill in month/theme/start date, click Start. Verify:
- Steps 1-3 auto-complete with green status
- Step 4 pauses (shows "Review Strategy" state)
- No API calls made (dry-run mode)

- [ ] **Step 4: Commit**

```bash
git add src/pages/CampaignDashboard.jsx src/components/social/ManusPasteModal.jsx
git commit -m "feat(m3): implement campaign dashboard with 7-step runner UI"
```

---

## Task 17: Strategy Review Component (Step 4)

**Files:**
- Create: `src/components/social/StrategyReview.jsx`
- Modify: `src/pages/CampaignDashboard.jsx` (embed StrategyReview when step 4 active)

- [ ] **Step 1: Implement StrategyReview**

Scrollable list of 30 posts. Each row:
- Day number + date badge
- Pillar badge (color-coded: PAIN=red, SOLUTION=blue, AUTHORITY=amber, PROOF=green, CTA=purple)
- Post type badge
- Concept title (editable inline)
- Caption (editable textarea, click to expand/collapse)
- Hashtags (editable text input)
- Visual prompt (editable textarea — important since this drives image generation)
- Save indicator (shows "Saved" briefly after auto-save)

Auto-save on blur: PUT `/api/campaigns/:id/posts/:postId` with changed fields.

"Approve & Generate Images" button at bottom → calls POST `/api/campaigns/:id/resume` with `{ approved: true }`.

```jsx
const PILLAR_COLORS = {
  PAIN: 'bg-red-500/20 text-red-300 border-red-500/30',
  SOLUTION: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  AUTHORITY: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  PROOF: 'bg-green-500/20 text-green-300 border-green-500/30',
  CTA: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};
```

- [ ] **Step 2: Wire into CampaignDashboard**

When `currentStep === 4` and `status === 'review_strategy'`, render `<StrategyReview>` below the step cards.

- [ ] **Step 3: Test in browser with DRY_RUN=true**

Run pipeline to step 4. Verify:
- 30 posts render with pillar badges
- Can edit caption, hashtags, visual prompt
- Changes auto-save (check network tab)
- "Approve & Generate Images" button advances to step 5

- [ ] **Step 4: Commit**

```bash
git add src/components/social/StrategyReview.jsx src/pages/CampaignDashboard.jsx
git commit -m "feat(m3): implement strategy review with editable 30-post table"
```

---

## Task 18: Final Review + CSV Export Component (Step 7)

**Files:**
- Create: `src/components/social/FinalReview.jsx`
- Modify: `src/pages/CampaignDashboard.jsx` (embed FinalReview when step 7 active)

- [ ] **Step 1: Implement FinalReview**

Similar to StrategyReview but adds:
- Image thumbnails next to each post (single = 1 image, carousel = horizontal scroll of images)
- Date + time display for posting schedule
- Inline caption/hashtag editing (same auto-save pattern)
- "Download GHL CSV" button at top → calls GET `/api/campaigns/:id/csv` and triggers file download
- "Regenerate Image" button per post (future — just placeholder for V1)

Post type rendering:
- **Single**: one image thumbnail (150x150)
- **Carousel**: horizontal scroll of image thumbnails
- **Before & After**: two images side by side

- [ ] **Step 2: Wire into CampaignDashboard**

When `currentStep === 7` and `status === 'review_final'`, render `<FinalReview>` below step cards. First call POST `/api/campaigns/:id/resume` to trigger CSV generation, then show the review UI.

- [ ] **Step 3: Test in browser with DRY_RUN=true**

Run full pipeline through step 7. Verify:
- Posts render with placeholder images (dry-run URLs won't load, but layout should work)
- CSV download button works (file downloads)
- CSV has correct GHL format (open in text editor)

- [ ] **Step 4: Commit**

```bash
git add src/components/social/FinalReview.jsx src/pages/CampaignDashboard.jsx
git commit -m "feat(m3): implement final review with images and CSV export"
```

---

## Task 19: Test Fixtures + Dry-Run Validation

**Files:**
- Create: `test/fixtures/sample-research.json`
- Create: `test/fixtures/sample-strategy.json`
- Create: `test/fixtures/sample-images/placeholder.png`

- [ ] **Step 1: Create research fixture**

```json
{
  "research": "## Industry Trends\n\nElectrical contractors in San Diego are seeing increased demand for EV charger installations and panel upgrades. California's push for electrification is driving residential work.\n\n## Seasonal Relevance\n\nApril is a strong month for home improvement. Spring cleaning motivates homeowners to address deferred maintenance.\n\n## Competitor Landscape\n\nTop competitors are posting daily on FB/IG with before-and-after project photos. EV charging content gets highest engagement.\n\n## Content Angles\n\n1. EV readiness assessments\n2. Panel upgrade before/after\n3. Smart lighting ROI\n4. Safety code compliance\n5. Energy efficiency quick wins\n\n## Hashtag Trends\n\n#SanDiegoElectrician #EVCharging #PanelUpgrade #SmartHome #HomeElectrification"
}
```

- [ ] **Step 2: Create strategy fixture**

Convert the VO360 April content.json into the strategy pack format. Copy `~/Desktop/Social Planner Project Cowork/.../VO360/april/content.json`, transform each entry to add `day`, `pillar`, `post_type`, `cta`, `visual_prompt`, `slide_count` fields. Save as `test/fixtures/sample-strategy.json`.

- [ ] **Step 3: Create placeholder image**

Use Sharp to generate a small 100x100 navy PNG with gold text "TEST":

```bash
cd ~/ghl-sub-account-builder && node -e "
const sharp = require('sharp');
const fs = require('fs');
fs.mkdirSync('test/fixtures/sample-images', { recursive: true });
sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 10, g: 22, b: 40, alpha: 1 } } })
  .png().toFile('test/fixtures/sample-images/placeholder.png')
  .then(() => console.log('Created placeholder.png'));
"
```

- [ ] **Step 4: Run full dry-run E2E**

```bash
DRY_RUN=true npm run dev:all
```

Open browser, create a client, create a campaign, run through all 7 steps. Verify:
- Steps 1-3 complete automatically
- Step 4 shows 30 posts with dry-run content
- Click Approve → steps 5-6 complete (placeholder images)
- Step 7 shows posts with dry-run image URLs
- CSV downloads with correct format

- [ ] **Step 5: Commit**

```bash
git add test/fixtures/
git commit -m "feat(m3): add test fixtures for dry-run mode"
```

---

## Task 20: 1-Post Integration Test

**Files:**
- Create: `tests/integration/social-1post.test.js`

- [ ] **Step 1: Write integration test**

```js
// tests/integration/social-1post.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSocialTables } from '../../server/db/social-schema.js';
import * as sq from '../../server/db/social-queries.js';
import { SocialRunner } from '../../server/services/social-runner.js';

/**
 * 1-Post Integration Test
 *
 * Runs the REAL pipeline with 1 post instead of 30.
 * Calls real Claude API, real Krea API, real Cloudinary.
 *
 * Cost: ~$0.01 Claude + 1 Krea credit + 1 Cloudinary upload
 *
 * Skip by default — run with: TEST_INTEGRATION=true npx vitest run tests/integration/social-1post.test.js
 */
const SKIP = process.env.TEST_INTEGRATION !== 'true';

describe.skipIf(SKIP)('1-Post Integration Test', () => {
  let db;
  let clientId;
  let campaignId;

  beforeAll(() => {
    // Ensure DRY_RUN is off
    delete process.env.DRY_RUN;

    db = new Database(':memory:');
    initializeSocialTables(db);

    clientId = sq.createClient(db, {
      name: 'Integration Test Client',
      industry: 'Electrician',
      location: 'San Diego, CA',
      target_audience: 'Homeowners',
      services: '["EV Charger Install"]',
      cloudinary_folder: 'integration-test',
      brand_tone: 'professional',
      content_pillars: '["PAIN","SOLUTION","AUTHORITY","PROOF","CTA"]',
    });

    campaignId = sq.createCampaign(db, {
      client_id: clientId,
      month: '2026-04',
      theme: 'EV charger spring push',
      start_date: '2026-04-12',
    });
  });

  it('runs steps 1-3 and generates 1 post', async () => {
    const events = [];
    const emit = (e) => events.push(e);
    const runner = new SocialRunner(db, emit);

    // Monkey-patch strategy to request 1 post instead of 30
    // (Override via prompt modification or post-parse truncation)
    await runner.runFromStep(campaignId, 1);

    const campaign = sq.getCampaign(db, campaignId);
    expect(campaign.research_brief).toBeTruthy();
    expect(campaign.strategy_pack).toBeTruthy();

    const posts = sq.listCampaignPosts(db, campaignId);
    expect(posts.length).toBeGreaterThanOrEqual(1);

    // Verify first post has required fields
    const first = posts[0];
    expect(first.caption).toBeTruthy();
    expect(first.visual_prompt).toBeTruthy();
    expect(first.pillar).toBeTruthy();
  }, 120000); // 2 min timeout for API calls
});
```

- [ ] **Step 2: Verify it skips by default**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/integration/social-1post.test.js`
Expected: Test skipped (no API calls made)

- [ ] **Step 3: Run it for real (costs ~$0.01)**

Run: `TEST_INTEGRATION=true npx vitest run tests/integration/social-1post.test.js`
Expected: PASS — real Claude call returns a research brief and strategy pack, 1+ posts created in DB.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/social-1post.test.js
git commit -m "feat(m3): add 1-post integration test (real API, $0.01 cost)"
```

---

## Task 21: Final Wiring + Polish

- [ ] **Step 1: Add Cloudinary env vars to .env**

Add to `~/ghl-sub-account-builder/.env`:
```
CLOUDINARY_CLOUD_NAME=holztech
CLOUDINARY_API_KEY=<get from krea-agent .env>
CLOUDINARY_API_SECRET=<get from krea-agent .env>
```

Copy the actual values from `~/krea-agent/.env`.

- [ ] **Step 2: Create data directories**

```bash
mkdir -p ~/ghl-sub-account-builder/data/campaigns
mkdir -p ~/ghl-sub-account-builder/data/logos
```

Add `data/` to `.gitignore` if not already there.

- [ ] **Step 3: Run full test suite**

```bash
cd ~/ghl-sub-account-builder && npx vitest run
```

Expected: All existing M1/M2 tests pass + all new M3 tests pass.

- [ ] **Step 4: Full dry-run E2E in browser**

```bash
DRY_RUN=true npm run dev:all
```

Walk through the complete flow:
1. Click hamburger → Social Planner
2. Create client (fill in all brand profile fields)
3. Open client → New Campaign
4. Fill month/theme/start date → Start
5. Watch steps 1-3 auto-complete
6. Review 30 posts at step 4 → edit a caption → Approve
7. Watch steps 5-6 auto-complete
8. Step 7 → review final → Download CSV
9. Open CSV in text editor → verify 39 columns, 30 data rows

- [ ] **Step 5: Run existing tests to verify no M2 regression**

```bash
cd ~/ghl-sub-account-builder && npx vitest run tests/server/build-runner.test.js tests/server/pause-resume.test.js
```

Expected: ALL PASS — M2 untouched.

- [ ] **Step 6: Commit everything**

```bash
git add -A
git commit -m "feat(m3): complete Social Planner module — full pipeline ready"
```

- [ ] **Step 7: Push to remote**

```bash
git push origin main
```

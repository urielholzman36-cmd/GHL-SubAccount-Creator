# Page Prompt Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone "Page Generator" tool that produces 10Web-ready page prompts (≤ 2000 chars) for adding pages to existing WordPress sites, reusing each client's brand data.

**Architecture:** New `page_prompts` table + `/api/page-prompts` CRUD routes + hybrid LLM+deterministic generator service mirroring existing `prompt-generator.js`. New React page at `/pages` under Operations sidebar, plus history section on Client Profile.

**Tech Stack:** Node.js + Express, `@libsql/client` (Turso), `@anthropic-ai/sdk`, React 19 + Vite + Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-19-page-prompt-generator-design.md`

---

## File Structure

**New files:**
- `server/services/page-prompt-generator.js` — LLM call + deterministic scaffolding + char-cap trimmer
- `server/routes/page-prompts.js` — Express router
- `tests/server/page-prompt-generator.test.js` — unit tests
- `src/pages/PageGenerator.jsx` — main tool page
- `src/components/PagePromptHistory.jsx` — list section embedded on ClientProfile
- `src/pages/PageGeneratorEdit.jsx` — edit/regenerate view (reopens an existing prompt)

**Modified files:**
- `server/db/index.js` — add `page_prompts` table migration
- `server/db/queries.js` — CRUD helpers
- `server/app.js` — mount `/api/page-prompts` router
- `src/App.jsx` — register `/pages`, `/pages/:id` routes
- `src/components/Sidebar.jsx` — add "Page Generator" nav item under Operations
- `src/pages/ClientProfile.jsx` — embed `<PagePromptHistory />`

---

## Task 1: DB migration — `page_prompts` table

**Files:**
- Modify: `server/db/index.js`
- Test: `tests/server/db.test.js` (append new test)

- [ ] **Step 1: Write the failing test**

Append to `tests/server/db.test.js`:

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@libsql/client';
import { initializeDb } from '../../server/db/index.js';

describe('page_prompts migration', () => {
  let db;
  beforeAll(async () => {
    db = createClient({ url: 'file::memory:' });
    await initializeDb(db);
  });

  it('creates page_prompts table with expected columns', async () => {
    const info = await db.execute("PRAGMA table_info(page_prompts)");
    const cols = info.rows.map((r) => r.name);
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'client_id', 'build_id', 'page_type',
      'page_name', 'page_slug', 'user_notes',
      'generated_prompt', 'brand_snapshot_json',
      'created_at', 'updated_at',
    ]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/db.test.js -t "page_prompts"`
Expected: FAIL — table does not exist.

- [ ] **Step 3: Add the migration**

In `server/db/index.js`, inside `initializeDb` after the other `CREATE TABLE` / `ALTER TABLE` blocks (find a good insertion point — e.g., right after the `builds` brand-cols migration around line 117), add:

```javascript
  // Page Prompt Generator (M3.5)
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS page_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      build_id INTEGER,
      page_type TEXT NOT NULL,
      page_name TEXT NOT NULL,
      page_slug TEXT,
      user_notes TEXT,
      generated_prompt TEXT,
      brand_snapshot_json TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (build_id) REFERENCES builds(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_page_prompts_client ON page_prompts(client_id);
  `);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/db.test.js -t "page_prompts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db/index.js tests/server/db.test.js
git commit -m "feat(page-prompts): add page_prompts table migration"
```

---

## Task 2: DB query helpers

**Files:**
- Modify: `server/db/queries.js`
- Test: `tests/server/clients-crud.test.js` style → create new `tests/server/page-prompts-crud.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/server/page-prompts-crud.test.js`:

```javascript
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { initializeDb } from '../../server/db/index.js';
import {
  createPagePrompt,
  listPagePromptsByClient,
  getPagePromptById,
  updatePagePrompt,
  deletePagePrompt,
} from '../../server/db/queries.js';

describe('page_prompts CRUD', () => {
  let db;
  beforeAll(async () => {
    db = createClient({ url: 'file::memory:' });
    await initializeDb(db);
    await db.execute("INSERT INTO clients (id, name) VALUES (1, 'Test Client')");
  });

  beforeEach(async () => {
    await db.execute('DELETE FROM page_prompts');
  });

  it('creates, lists, reads, updates, deletes', async () => {
    const created = await createPagePrompt(db, {
      client_id: 1,
      build_id: null,
      page_type: 'pricing',
      page_name: 'Pricing',
      page_slug: '/pricing',
      user_notes: '3 tiers',
      generated_prompt: 'PAGE TYPE: Pricing\n...',
      brand_snapshot_json: JSON.stringify({ palette: ['#111'] }),
    });
    expect(created.id).toBeTruthy();

    const list = await listPagePromptsByClient(db, 1);
    expect(list).toHaveLength(1);
    expect(list[0].page_type).toBe('pricing');

    const one = await getPagePromptById(db, created.id);
    expect(one.page_name).toBe('Pricing');

    await updatePagePrompt(db, created.id, { user_notes: '4 tiers', generated_prompt: 'v2' });
    const updated = await getPagePromptById(db, created.id);
    expect(updated.user_notes).toBe('4 tiers');
    expect(updated.generated_prompt).toBe('v2');

    await deletePagePrompt(db, created.id);
    const afterDelete = await listPagePromptsByClient(db, 1);
    expect(afterDelete).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/page-prompts-crud.test.js`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Add the helpers**

Append to `server/db/queries.js`:

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/page-prompts-crud.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db/queries.js tests/server/page-prompts-crud.test.js
git commit -m "feat(page-prompts): add CRUD helpers for page_prompts"
```

---

## Task 3: Page prompt generator service

**Files:**
- Create: `server/services/page-prompt-generator.js`
- Create: `tests/server/page-prompt-generator.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/server/page-prompt-generator.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { buildDeterministicBlock, assemblePagePrompt, enforceCharCap, PRESETS } from '../../server/services/page-prompt-generator.js';

describe('page prompt generator — deterministic pieces', () => {
  const brand = {
    name: 'Restoration Pro NW',
    industry: 'Water damage restoration',
    brand_palette_json: JSON.stringify({
      primary: '#0A2540', secondary: '#06B6D4', accent: '#F97316',
      neutral: '#E5E7EB', background: '#0B1220',
    }),
    brand_personality: 'Trustworthy, calm, emergency-ready',
    brand_mood_description: 'Reassuring emergency-response',
    recommended_surface_style: 'clean geometric cards',
    industry_cues_json: JSON.stringify(['water droplet', 'shield icon', 'truck']),
    service_areas: 'Mukilteo, Everett, Seattle',
    primary_cta: 'Get Help Now',
    secondary_cta: 'Call 425-595-4500',
  };

  it('builds a compact deterministic brand block under 600 chars', () => {
    const block = buildDeterministicBlock(brand);
    expect(block.length).toBeLessThan(600);
    expect(block).toContain('#0A2540');
    expect(block).toContain('#06B6D4');
    expect(block).toContain('#F97316');
    expect(block).toContain('clean geometric cards');
    expect(block).toContain('Mukilteo');
  });

  it('exposes the 7 expected presets', () => {
    expect(Object.keys(PRESETS).sort()).toEqual([
      'about', 'custom', 'landing', 'pricing',
      'service_areas', 'services_detail', 'testimonials',
    ]);
  });

  it('assembles a full prompt under 2000 chars', () => {
    const prompt = assemblePagePrompt({
      page_type: 'pricing',
      page_name: 'Pricing',
      page_slug: '/pricing',
      brand,
      creativeSections: 'HERO: "Fair pricing, no surprises"\nTIERS: Basic / Pro / Elite ...',
    });
    expect(prompt.length).toBeLessThanOrEqual(2000);
    expect(prompt).toContain('PAGE TYPE: Pricing');
  });

  it('trims overflowing prompts in priority order', () => {
    const longCreative = 'x'.repeat(3000);
    const prompt = assemblePagePrompt({
      page_type: 'pricing',
      page_name: 'Pricing',
      page_slug: '/pricing',
      brand,
      creativeSections: longCreative,
    });
    expect(prompt.length).toBeLessThanOrEqual(2000);
    expect(prompt).toContain('PAGE TYPE: Pricing');
    expect(prompt).toContain('#0A2540'); // brand context preserved
  });

  it('enforceCharCap trims MUST-HAVES first, brand context last', () => {
    const oversized = {
      header: 'PAGE TYPE: X\nPAGE NAME: Y\n',
      brandBlock: 'BRAND: palette #111\n',
      creative: 'NARRATIVE: ' + 'n'.repeat(200),
      mustHaves: 'MUST-HAVES:\n- ' + 'm'.repeat(2000),
    };
    const out = enforceCharCap(oversized, 500);
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out).toContain('BRAND:');
    expect(out).toContain('NARRATIVE:');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/page-prompt-generator.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the service**

Create `server/services/page-prompt-generator.js`:

```javascript
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-4-7';
const MAX_CHARS = 2000;
const CREATIVE_BUDGET = 1200;

export const PRESETS = {
  services_detail: {
    label: 'Services Detail',
    sections: 'Hero (headline + subhead), Problem/Solution (2-3 lines), Benefits (3-5 bullets), Process (3-5 steps), Trust Block (badges/guarantees), CTA',
  },
  pricing: {
    label: 'Pricing',
    sections: 'Hero, Tier Cards (3 tiers unless notes say otherwise — name, price, 4-6 feature bullets per tier), Feature Comparison snippet, FAQ snippet (3 Qs), CTA',
  },
  about: {
    label: 'About',
    sections: 'Origin Story (3-4 lines), Mission (1 line), Values (3-5 bullets), Team/Credentials (1 line), CTA',
  },
  testimonials: {
    label: 'Testimonials',
    sections: 'Hero, Review Cards (5-8 industry-relevant quotes with name/role), Stats/Proof bar, CTA',
  },
  service_areas: {
    label: 'Service Areas',
    sections: 'Hero, City List (from service areas), Local Trust Signals (licensing, response time), Map/Coverage note, CTA',
  },
  landing: {
    label: 'Landing / Lead Magnet',
    sections: 'Single Hero with offer, 3 Benefit bullets, Social Proof (1 line), Single CTA',
  },
  custom: {
    label: 'Custom',
    sections: 'Pick the structure based on user notes.',
  },
};

function parseJsonSafe(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function paletteLine(brand) {
  const p = parseJsonSafe(brand.brand_palette_json, null) || parseJsonSafe(brand.brand_colors_json, null);
  if (p && !Array.isArray(p)) {
    const { primary, secondary, accent, neutral, background } = p;
    const parts = [];
    if (primary) parts.push(`primary ${primary}`);
    if (secondary) parts.push(`secondary ${secondary}`);
    if (accent) parts.push(`accent ${accent}`);
    if (neutral) parts.push(`neutral ${neutral}`);
    if (background) parts.push(`background ${background}`);
    return parts.join(', ');
  }
  if (Array.isArray(p) && p.length) return p.join(', ');
  return 'pick industry-appropriate hex codes';
}

export function buildDeterministicBlock(brand) {
  const cues = parseJsonSafe(brand.industry_cues_json, []);
  const cuesLine = Array.isArray(cues) && cues.length ? cues.slice(0, 4).join(', ') : '';
  const lines = [
    `Company: ${brand.name || 'Unknown'} — ${brand.industry || ''}`.trim(),
    `Palette: ${paletteLine(brand)}`,
    brand.brand_personality && `Personality: ${brand.brand_personality}`,
    brand.brand_mood_description && `Mood: ${brand.brand_mood_description}`,
    brand.recommended_surface_style && `Surface style: ${brand.recommended_surface_style}`,
    cuesLine && `Industry cues: ${cuesLine}`,
    brand.service_areas && `Service areas: ${brand.service_areas}`,
    (brand.primary_cta || brand.secondary_cta) && `CTAs: ${[brand.primary_cta, brand.secondary_cta].filter(Boolean).join(' / ')}`,
  ].filter(Boolean);
  return 'BRAND CONTEXT:\n' + lines.map((l) => `- ${l}`).join('\n');
}

function header(page_type, page_name, page_slug) {
  return [
    `PAGE TYPE: ${PRESETS[page_type]?.label || page_type}`,
    `PAGE NAME: ${page_name}`,
    page_slug && `TARGET URL SLUG: ${page_slug}`,
  ].filter(Boolean).join('\n');
}

const MUST_HAVES = `MUST-HAVES:
- Match existing site's header/footer/nav
- Use palette roles consistently
- Mobile-first responsive
- CTA placement top + mid + bottom`;

export function enforceCharCap({ header: h, brandBlock, creative, mustHaves }, cap = MAX_CHARS) {
  const join = (parts) => parts.filter(Boolean).join('\n\n');
  let out = join([h, brandBlock, creative, mustHaves]);
  if (out.length <= cap) return out;

  // 1. Drop MUST-HAVES
  out = join([h, brandBlock, creative]);
  if (out.length <= cap) return out;

  // 2. Trim creative (keep the first N chars)
  const overhead = join([h, brandBlock]).length + 2;
  const room = Math.max(0, cap - overhead);
  const trimmed = creative.slice(0, room);
  return join([h, brandBlock, trimmed]);
}

export function assemblePagePrompt({ page_type, page_name, page_slug, brand, creativeSections }) {
  return enforceCharCap({
    header: header(page_type, page_name, page_slug),
    brandBlock: buildDeterministicBlock(brand),
    creative: creativeSections,
    mustHaves: MUST_HAVES,
  });
}

export async function generatePagePrompt({
  page_type, page_name, page_slug, user_notes,
  brand, tenweb_site_prompt,
}) {
  const preset = PRESETS[page_type] || PRESETS.custom;

  const systemPrompt = `You write compact page prompts for 10Web's "add a page" AI builder.
Rules:
- Output ONLY the creative sections listed below (no preamble, no trailing chatter).
- Use bullet points and short phrases, not prose.
- Honor the provided brand palette hex codes, personality, mood, and surface style verbatim.
- Do not invent facts about the company.
- Your creative sections must total ≤ ${CREATIVE_BUDGET} characters.`;

  const userMessage = [
    buildDeterministicBlock(brand),
    tenweb_site_prompt ? `\nORIGINAL SITE PROMPT (for tone reference):\n${tenweb_site_prompt.slice(0, 800)}` : '',
    `\nPage type: ${preset.label}`,
    `Page name: ${page_name}`,
    page_slug && `Target slug: ${page_slug}`,
    user_notes && `User notes: ${user_notes}`,
    `\nWrite these creative sections (bullets/phrases, not prose):\n${preset.sections}`,
    `\nAlso include a TONE line (one sentence synthesising personality + mood)`,
    `and a DESIGN NOTES line (palette roles + surface style + industry cues translated to layout hints).`,
    `\nTotal creative output must be ≤ ${CREATIVE_BUDGET} chars.`,
  ].filter(Boolean).join('\n');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const creative = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const final = assemblePagePrompt({
    page_type, page_name, page_slug, brand,
    creativeSections: creative,
  });

  return {
    prompt: final,
    brand_snapshot: {
      palette: parseJsonSafe(brand.brand_palette_json, null) || parseJsonSafe(brand.brand_colors_json, null),
      personality: brand.brand_personality,
      mood: brand.brand_mood_description,
      surface_style: brand.recommended_surface_style,
      industry_cues: parseJsonSafe(brand.industry_cues_json, null),
      service_areas: brand.service_areas,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/page-prompt-generator.test.js`
Expected: PASS on the 5 deterministic tests (LLM call not tested in unit tests).

- [ ] **Step 5: Commit**

```bash
git add server/services/page-prompt-generator.js tests/server/page-prompt-generator.test.js
git commit -m "feat(page-prompts): add generator service with 2000-char cap"
```

---

## Task 4: Express routes

**Files:**
- Create: `server/routes/page-prompts.js`

- [ ] **Step 1: Create the router file**

Create `server/routes/page-prompts.js`:

```javascript
import { Router } from 'express';
import {
  createPagePrompt,
  listPagePromptsByClient,
  getPagePromptById,
  updatePagePrompt,
  deletePagePrompt,
} from '../db/queries.js';
import { generatePagePrompt, PRESETS } from '../services/page-prompt-generator.js';

export function createPagePromptsRouter(db) {
  const router = Router();

  // GET /api/page-prompts?client_id=1
  router.get('/', async (req, res, next) => {
    try {
      const clientId = Number(req.query.client_id);
      if (!clientId) return res.status(400).json({ error: 'client_id required' });
      const rows = await listPagePromptsByClient(db, clientId);
      res.json(rows);
    } catch (e) { next(e); }
  });

  // GET /api/page-prompts/presets  → list of preset types for the UI dropdown
  router.get('/presets', (_req, res) => {
    res.json(Object.entries(PRESETS).map(([value, { label }]) => ({ value, label })));
  });

  // GET /api/page-prompts/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const row = await getPagePromptById(db, Number(req.params.id));
      if (!row) return res.status(404).json({ error: 'not found' });
      res.json(row);
    } catch (e) { next(e); }
  });

  // POST /api/page-prompts  { client_id, page_type, page_name, page_slug, user_notes }
  router.post('/', async (req, res, next) => {
    try {
      const { client_id, page_type, page_name, page_slug, user_notes } = req.body || {};
      if (!client_id || !page_type || !page_name) {
        return res.status(400).json({ error: 'client_id, page_type, page_name required' });
      }
      if (!PRESETS[page_type]) {
        return res.status(400).json({ error: `invalid page_type (must be one of ${Object.keys(PRESETS).join(', ')})` });
      }

      // Load brand from client + most recent build (if any)
      const clientRow = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [client_id] });
      const client = clientRow.rows[0];
      if (!client) return res.status(404).json({ error: 'client not found' });

      const buildRow = await db.execute({
        sql: 'SELECT * FROM builds WHERE client_id = ? ORDER BY created_at DESC LIMIT 1',
        args: [client_id],
      });
      const build = buildRow.rows[0];

      const brand = {
        name: client.name,
        industry: client.industry || build?.industry,
        brand_palette_json: build?.brand_palette_json || null,
        brand_colors_json: client.brand_colors_json,
        brand_personality: build?.brand_personality || client.brand_personality,
        brand_mood_description: build?.brand_mood_description || client.brand_mood_description,
        recommended_surface_style: build?.recommended_surface_style || client.recommended_surface_style,
        industry_cues_json: build?.industry_cues_json || client.industry_cues_json,
        service_areas: build?.service_areas || client.service_areas,
        primary_cta: build?.primary_cta,
        secondary_cta: build?.secondary_cta,
      };

      // Require at least some brand signal
      if (!brand.brand_personality && !brand.brand_palette_json && !brand.brand_colors_json) {
        return res.status(400).json({ error: 'Client has no brand data — run Analyze Brand first.' });
      }

      const { prompt, brand_snapshot } = await generatePagePrompt({
        page_type, page_name,
        page_slug: page_slug || null,
        user_notes: user_notes || null,
        brand,
        tenweb_site_prompt: build?.tenweb_prompt || null,
      });

      const { id } = await createPagePrompt(db, {
        client_id,
        build_id: build?.id || null,
        page_type, page_name,
        page_slug: page_slug || null,
        user_notes: user_notes || null,
        generated_prompt: prompt,
        brand_snapshot_json: JSON.stringify(brand_snapshot),
      });

      const row = await getPagePromptById(db, id);
      res.status(201).json(row);
    } catch (e) { next(e); }
  });

  // PUT /api/page-prompts/:id  { regenerate: true } OR { user_notes }
  router.put('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await getPagePromptById(db, id);
      if (!existing) return res.status(404).json({ error: 'not found' });

      const { regenerate, user_notes, page_name, page_slug } = req.body || {};

      if (user_notes !== undefined) {
        await updatePagePrompt(db, id, { user_notes });
      }
      if (page_name !== undefined) {
        await updatePagePrompt(db, id, { page_name });
      }
      if (page_slug !== undefined) {
        await updatePagePrompt(db, id, { page_slug });
      }

      if (regenerate) {
        const fresh = await getPagePromptById(db, id);
        const clientRow = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [fresh.client_id] });
        const client = clientRow.rows[0];
        const buildRow = fresh.build_id
          ? await db.execute({ sql: 'SELECT * FROM builds WHERE id = ?', args: [fresh.build_id] })
          : { rows: [] };
        const build = buildRow.rows[0];

        const brand = {
          name: client.name,
          industry: client.industry || build?.industry,
          brand_palette_json: build?.brand_palette_json || null,
          brand_colors_json: client.brand_colors_json,
          brand_personality: build?.brand_personality || client.brand_personality,
          brand_mood_description: build?.brand_mood_description || client.brand_mood_description,
          recommended_surface_style: build?.recommended_surface_style || client.recommended_surface_style,
          industry_cues_json: build?.industry_cues_json || client.industry_cues_json,
          service_areas: build?.service_areas || client.service_areas,
          primary_cta: build?.primary_cta,
          secondary_cta: build?.secondary_cta,
        };

        const { prompt, brand_snapshot } = await generatePagePrompt({
          page_type: fresh.page_type,
          page_name: fresh.page_name,
          page_slug: fresh.page_slug,
          user_notes: fresh.user_notes,
          brand,
          tenweb_site_prompt: build?.tenweb_prompt || null,
        });

        await updatePagePrompt(db, id, {
          generated_prompt: prompt,
          brand_snapshot_json: JSON.stringify(brand_snapshot),
        });
      }

      const updated = await getPagePromptById(db, id);
      res.json(updated);
    } catch (e) { next(e); }
  });

  // DELETE /api/page-prompts/:id
  router.delete('/:id', async (req, res, next) => {
    try {
      await deletePagePrompt(db, Number(req.params.id));
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/page-prompts.js
git commit -m "feat(page-prompts): add Express CRUD + generate routes"
```

---

## Task 5: Mount routes in `app.js`

**Files:**
- Modify: `server/app.js`

- [ ] **Step 1: Add import + mount**

In `server/app.js`:

1. Add the import next to the other route imports:

```javascript
import { createPagePromptsRouter } from './routes/page-prompts.js';
```

2. Find where other routers are mounted under `requireAuth` middleware (look for `app.use('/api/clients', requireAuth, createClientsRouter(db));` or similar). Add:

```javascript
app.use('/api/page-prompts', requireAuth, createPagePromptsRouter(db));
```

- [ ] **Step 2: Start the dev server and verify the route responds**

Run in one terminal: `npm run dev:server`
In another, run (you'll need to be authenticated via browser first, or skip if auth is tricky — substitute with a real session cookie):

```bash
curl -s http://localhost:3003/api/page-prompts/presets -H "Cookie: <your-session-cookie>" | head
```

Expected: JSON array of 7 presets `[{"value":"services_detail","label":"Services Detail"},...]`.

- [ ] **Step 3: Commit**

```bash
git add server/app.js
git commit -m "feat(page-prompts): mount /api/page-prompts router"
```

---

## Task 6: `PageGenerator.jsx` main page

**Files:**
- Create: `src/pages/PageGenerator.jsx`

- [ ] **Step 1: Create the page component**

Create `src/pages/PageGenerator.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { useToast } from '../hooks/useToast.jsx';

function slugify(s) {
  return '/' + String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function PageGenerator() {
  const toast = useToast();
  const [clients, setClients] = useState([]);
  const [presets, setPresets] = useState([]);
  const [form, setForm] = useState({
    client_id: '', page_type: 'services_detail', page_name: '', page_slug: '', user_notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch('/api/clients').then((r) => r.json()).then(setClients).catch(() => {});
    fetch('/api/page-prompts/presets').then((r) => r.json()).then(setPresets).catch(() => {});
  }, []);

  const selectedClient = clients.find((c) => String(c.id) === String(form.client_id));
  const brandReady = selectedClient && (
    selectedClient.brand_personality || selectedClient.brand_colors_json
  );

  function update(key, value) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'page_name' && !f.page_slug) next.page_slug = slugify(value);
      return next;
    });
  }

  async function generate() {
    if (!form.client_id || !form.page_name) {
      toast.error('Pick a client and enter a page name.');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/page-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          client_id: Number(form.client_id),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setResult(data);
      toast.success('Prompt generated.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function regenerate() {
    if (!result?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/page-prompts/${result.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: true, user_notes: form.user_notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Regenerate failed');
      setResult(data);
      toast.success('Regenerated.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function copyPrompt() {
    if (!result?.generated_prompt) return;
    await navigator.clipboard.writeText(result.generated_prompt);
    toast.success('Copied to clipboard.');
  }

  const charCount = result?.generated_prompt?.length || 0;
  const counterColor = charCount >= 2000 ? 'text-red-400' : charCount >= 1800 ? 'text-amber-400' : 'text-white/40';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold gradient-text">Page Generator</h1>
        <p className="text-white/40 text-sm mt-1">Generate a 10Web-ready prompt for a new page on an existing WordPress site.</p>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Client">
            <select
              value={form.client_id}
              onChange={(e) => update('client_id', e.target.value)}
              className="input"
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {selectedClient && !brandReady && (
              <p className="text-amber-400 text-xs mt-1">This client has no brand data — run Analyze Brand first.</p>
            )}
          </Field>

          <Field label="Page Type">
            <select
              value={form.page_type}
              onChange={(e) => update('page_type', e.target.value)}
              className="input"
            >
              {presets.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Page Name">
            <input className="input" value={form.page_name} onChange={(e) => update('page_name', e.target.value)} placeholder="Water Damage Restoration" />
          </Field>

          <Field label="URL Slug">
            <input className="input" value={form.page_slug} onChange={(e) => update('page_slug', e.target.value)} placeholder="/water-damage-restoration" />
          </Field>
        </div>

        <Field label="Notes (optional)">
          <textarea
            className="input min-h-[80px]"
            value={form.user_notes}
            onChange={(e) => update('user_notes', e.target.value)}
            placeholder="e.g., 3 tiers at $99/$199/$399 — focus on emergency response"
          />
        </Field>

        <div className="flex justify-end">
          <button
            onClick={generate}
            disabled={loading || !brandReady || !form.page_name}
            className="btn-primary disabled:opacity-40"
          >
            {loading ? 'Generating…' : 'Generate Prompt'}
          </button>
        </div>
      </div>

      {result && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white/80">Generated Prompt</h2>
            <span className={`text-xs font-mono ${counterColor}`}>{charCount}/2000</span>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-white/70 font-mono bg-black/20 p-4 rounded-lg border border-white/5 max-h-[500px] overflow-auto">
            {result.generated_prompt}
          </pre>
          <div className="flex gap-2 justify-end">
            <button onClick={copyPrompt} className="btn-secondary">Copy</button>
            <button onClick={regenerate} disabled={loading} className="btn-secondary disabled:opacity-40">Regenerate</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-white/40 uppercase tracking-wide mb-1">{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Verify styles exist**

The component uses existing utility classes: `glass-card`, `input`, `btn-primary`, `btn-secondary`, `gradient-text`. Verify these exist by running:

```bash
grep -rE "(glass-card|btn-primary|btn-secondary|gradient-text)" ~/ghl-sub-account-builder/src/index.css ~/ghl-sub-account-builder/tailwind.config.js
```

If any are missing, either use the closest existing equivalents (look at `src/pages/ClientProfile.jsx` for the pattern actually used) or inline Tailwind classes. Fix the JSX accordingly before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PageGenerator.jsx
git commit -m "feat(page-prompts): add PageGenerator page component"
```

---

## Task 7: Register route in `App.jsx`

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add the import and route**

In `src/App.jsx`:

1. Add import after the `ManusImport` import:

```jsx
import PageGenerator from './pages/PageGenerator';
```

2. Inside the `<Routes>` block, in the Operations group (right after the `<Route path="/reports" ... />` line):

```jsx
<Route path="/pages" element={<PageGenerator />} />
<Route path="/pages/:id" element={<PageGenerator />} />
```

- [ ] **Step 2: Start dev server and verify**

```bash
npm run dev:all
```

Open `http://localhost:5173/pages`. You should see the Page Generator UI with a client dropdown.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat(page-prompts): register /pages route"
```

---

## Task 8: Sidebar entry

**Files:**
- Modify: `src/components/Sidebar.jsx`

- [ ] **Step 1: Add the nav item**

In `src/components/Sidebar.jsx`, in the `operationsItems` array (around line 10), add a new item **between** `Onboarding` and `Social Planner`:

```jsx
  { label: 'Page Generator', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', to: '/pages' },
```

(The icon path is a generic document/page icon from Heroicons.)

- [ ] **Step 2: Verify in the running dev server**

Reload `http://localhost:5173/` and confirm "Page Generator" appears under the Operations section of the sidebar, and clicking it navigates to the Page Generator page.

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.jsx
git commit -m "feat(page-prompts): add sidebar entry under Operations"
```

---

## Task 9: `PagePromptHistory` + embed in `ClientProfile`

**Files:**
- Create: `src/components/PagePromptHistory.jsx`
- Modify: `src/pages/ClientProfile.jsx`

- [ ] **Step 1: Create the history component**

Create `src/components/PagePromptHistory.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../hooks/useToast.jsx';

export default function PagePromptHistory({ clientId }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    fetch(`/api/page-prompts?client_id=${clientId}`)
      .then((r) => r.json())
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  async function remove(id) {
    if (!confirm('Delete this generated prompt?')) return;
    const res = await fetch(`/api/page-prompts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success('Deleted.');
    } else {
      toast.error('Failed to delete.');
    }
  }

  if (!clientId) return null;

  return (
    <div className="glass-card p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="font-semibold text-white/80">
          Generated Pages {rows.length > 0 && <span className="text-white/40 ml-1">({rows.length})</span>}
        </span>
        <span className="text-white/40 text-sm">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-2">
          {loading && <p className="text-white/40 text-sm">Loading…</p>}
          {!loading && rows.length === 0 && (
            <p className="text-white/40 text-sm">No page prompts yet. <Link to="/pages" className="text-brand-cyan underline">Generate one</Link>.</p>
          )}
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5">
              <div className="min-w-0">
                <p className="text-sm text-white/80 truncate">{row.page_name}</p>
                <p className="text-xs text-white/40">
                  {row.page_type} · {new Date(row.created_at).toLocaleDateString()} · {row.generated_prompt?.length || 0} chars
                </p>
              </div>
              <div className="flex gap-2 shrink-0 ml-2">
                <Link to={`/pages/${row.id}`} className="text-xs text-brand-cyan hover:underline">Open</Link>
                <button onClick={() => remove(row.id)} className="text-xs text-red-400 hover:underline">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update PageGenerator to support `/pages/:id` (re-open an existing prompt)**

In `src/pages/PageGenerator.jsx`, add `useParams` import and load existing prompt on mount if an `:id` param is present. Change the top of the file:

```jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useToast } from '../hooks/useToast.jsx';
```

Add inside the component, after the existing `useEffect`:

```jsx
  const { id } = useParams();
  useEffect(() => {
    if (!id) return;
    fetch(`/api/page-prompts/${id}`)
      .then((r) => r.json())
      .then((row) => {
        setResult(row);
        setForm({
          client_id: String(row.client_id),
          page_type: row.page_type,
          page_name: row.page_name,
          page_slug: row.page_slug || '',
          user_notes: row.user_notes || '',
        });
      })
      .catch(() => {});
  }, [id]);
```

- [ ] **Step 3: Embed `<PagePromptHistory />` on ClientProfile**

In `src/pages/ClientProfile.jsx`:

1. Add the import (near other component imports):

```jsx
import PagePromptHistory from '../components/PagePromptHistory';
```

2. Find a sensible spot in the JSX (usually near other per-client sections like campaigns/builds). Add:

```jsx
<PagePromptHistory clientId={client?.id} />
```

(Replace `client?.id` with whatever the actual client id variable is named in that file.)

- [ ] **Step 4: Smoke test in dev server**

With `npm run dev:all` running:

1. Visit `http://localhost:5173/pages`, pick a client with brand data (e.g., Restoration Pro NW), pick "Services Detail", type "Water Damage Restoration", click Generate.
2. Verify a prompt appears under 2000 chars, char counter turns amber/red appropriately.
3. Click Copy, confirm toast says "Copied".
4. Navigate to that client's profile page. Expand "Generated Pages" section — the new entry should appear.
5. Click "Open" — confirm `/pages/:id` opens the prompt pre-filled.
6. Click Delete on the history row — confirm it disappears.

- [ ] **Step 5: Commit**

```bash
git add src/components/PagePromptHistory.jsx src/pages/PageGenerator.jsx src/pages/ClientProfile.jsx
git commit -m "feat(page-prompts): add history component + embed on ClientProfile"
```

---

## Task 10: End-to-end verification + deploy

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass (including the 3 new test files from Tasks 1-3).

- [ ] **Step 2: Local end-to-end pass**

Already covered in Task 9 Step 4 — confirm once more with a different preset (try "Pricing" with notes "3 tiers at $99/$199/$399") and verify the prompt contains tier-like structure.

- [ ] **Step 3: Push + deploy**

```bash
git push origin main
```

Vercel auto-deploys on push (~18s). If the user says "upload the agent," also run `npx vercel --prod` after the push.

- [ ] **Step 4: Prod smoke test**

Hit `https://vo360-onboarding-hub.vercel.app/pages`, log in, generate one prompt against Restoration Pro NW, verify no errors. Confirm the generated prompt persists across page reload (proves Turso write hit prod).

- [ ] **Step 5: Update project memory**

Update `~/.claude/projects/-Users-urielholzman/memory/project_onboarding_hub.md`:
- Add "Page Generator (M3.5) shipped" under Completed features with date 2026-04-XX
- Remove from queue / Next Steps

---

## Self-Review

**1. Spec coverage:**
- ✅ Sidebar entry under Operations (Task 8)
- ✅ Client dropdown with brand-data gating (Task 6)
- ✅ 7 presets: services_detail, pricing, about, testimonials, service_areas, landing, custom (Task 3 PRESETS)
- ✅ Optional notes field (Task 6)
- ✅ Generate button with LLM call (Tasks 3 + 4)
- ✅ 2000-char hard cap + char counter (Tasks 3 + 6)
- ✅ Save history per client (Tasks 1-2 + 9)
- ✅ Copy / Regenerate / Delete (Tasks 4 + 6 + 9)
- ✅ Brand data source priority: build first, else client (Task 4 route)
- ✅ Brand snapshot JSON stored with each prompt (Task 3 + Task 4 route)
- ✅ Client Profile history section (Task 9)
- ✅ Regenerate via `/pages/:id` (Task 9)

**2. Placeholder scan:** No TBDs, all code blocks complete, all test code shown.

**3. Type consistency:**
- `createPagePrompt`, `listPagePromptsByClient`, `getPagePromptById`, `updatePagePrompt`, `deletePagePrompt` — names match across Tasks 2, 4.
- `generatePagePrompt`, `assemblePagePrompt`, `buildDeterministicBlock`, `enforceCharCap`, `PRESETS` — exports match between Task 3 implementation and Task 3 tests + Task 4 import.
- Preset keys (`services_detail`, `pricing`, `about`, `testimonials`, `service_areas`, `landing`, `custom`) consistent across spec, test, service, and UI.

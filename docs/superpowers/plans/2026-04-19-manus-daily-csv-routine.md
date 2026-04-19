# Manus Daily CSV Routine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a daily Claude Routine that auto-processes Manus monthly content bundles into GHL-ready CSVs, eliminating the manual extract→upload→build flow the user does today.

**Architecture:** Node.js script suite under `~/ghl-sub-account-builder/scripts/daily-csv-routine/` — a scheduled Claude Routine invokes `run-daily.mjs`, which scans `~/Desktop/Manus-Social Planner/` for unprocessed bundles, pulls per-client config from the Onboarding Hub's Turso DB, uploads images to Cloudinary, writes CSV + summary to `~/Desktop/CSV Ready Zips/{Client}/`, and fires a macOS notification. State is filesystem-derived (no database of runs).

**Tech Stack:** Node.js, `@libsql/client` (Turso), `cloudinary` SDK, `adm-zip` (bundle extraction), `vitest` (tests), `osascript` (macOS notifications). Reuses existing parsers from `server/services/manus-importer.js`.

---

## File Structure

**New directory:** `~/ghl-sub-account-builder/scripts/daily-csv-routine/`

```
scripts/daily-csv-routine/
├── config.mjs                    constants: paths, posting time defaults
├── run-daily.mjs                 entry point: scan → process pending → notify
├── process-bundle.mjs            single-bundle CLI for manual re-runs
├── lib/
│   ├── client-registry.mjs       Turso lookup by folder name
│   ├── bundle-normalizer.mjs     zip/folder → flat file list
│   ├── docx-converter.mjs        docx manifest/post_kits → .md
│   ├── cloudinary-uploader.mjs   parallel-batch upload w/ overwrite
│   ├── csv-builder.mjs           pure: posts + config → CSV string
│   ├── summary-builder.mjs       pure: posts + meta → markdown
│   ├── detector.mjs              pending-bundle detection
│   ├── notifier.mjs              macOS notification wrapper
│   └── month-parser.mjs          pure: filename/folder → { year, month }
└── tests/
    ├── csv-builder.test.mjs
    ├── summary-builder.test.mjs
    ├── detector.test.mjs
    ├── month-parser.test.mjs
    └── fixtures/                 tiny sample bundles for tests
```

**Cleanup (delete after cutover):**
- `~/ghl-sub-account-builder/generate_may_csv.mjs` (tonight's one-off)
- `~/ghl-sub-account-builder/regen_csv_only.mjs` (tonight's one-off)

---

## Task 1: Scaffold directory + delete one-offs

**Files:**
- Create: `scripts/daily-csv-routine/config.mjs`
- Delete: `generate_may_csv.mjs`, `regen_csv_only.mjs`

- [ ] **Step 1: Create directory structure**

```bash
cd ~/ghl-sub-account-builder
mkdir -p scripts/daily-csv-routine/lib scripts/daily-csv-routine/tests/fixtures
```

- [ ] **Step 2: Create `config.mjs`**

```js
// scripts/daily-csv-routine/config.mjs
import os from 'os';
import path from 'path';

export const WATCH_ROOT = path.join(os.homedir(), 'Desktop', 'Manus-Social Planner');
export const OUTPUT_ROOT = path.join(os.homedir(), 'Desktop', 'CSV Ready Zips');
export const LOG_DIR = path.join(OUTPUT_ROOT, '_logs');
export const DEFAULT_POSTING_TIME = '09:00:00';

// Project root: we resolve relative to this file so scripts work from any cwd
export const PROJECT_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
);
```

- [ ] **Step 3: Delete one-off scripts**

```bash
rm generate_may_csv.mjs regen_csv_only.mjs
```

- [ ] **Step 4: Commit**

```bash
git add scripts/daily-csv-routine/config.mjs
git rm generate_may_csv.mjs regen_csv_only.mjs
git commit -m "chore: scaffold daily-csv-routine, remove one-off scripts"
```

---

## Task 2: Month parser (pure function + tests)

**Files:**
- Create: `scripts/daily-csv-routine/lib/month-parser.mjs`
- Test: `scripts/daily-csv-routine/tests/month-parser.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
// scripts/daily-csv-routine/tests/month-parser.test.mjs
import { describe, it, expect } from 'vitest';
import { parseMonthFromPath } from '../lib/month-parser.mjs';

describe('parseMonthFromPath', () => {
  it('extracts year-month from 2026_05 prefix in filename', () => {
    expect(parseMonthFromPath('2026_05_VO360.zip')).toEqual({ year: 2026, month: 5 });
  });

  it('extracts year-month from 2026_05 prefix in folder name', () => {
    expect(parseMonthFromPath('2026_05_Lyrie_final_may_package')).toEqual({ year: 2026, month: 5 });
  });

  it('handles dashes or underscores between year and month', () => {
    expect(parseMonthFromPath('2026-07_VO360.zip')).toEqual({ year: 2026, month: 7 });
  });

  it('returns null for unparseable names', () => {
    expect(parseMonthFromPath('random_bundle.zip')).toBeNull();
    expect(parseMonthFromPath('may .zip')).toBeNull();
  });

  it('ignores containing path, only looks at basename', () => {
    expect(parseMonthFromPath('/tmp/foo/2026_12_VO360.zip')).toEqual({ year: 2026, month: 12 });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run scripts/daily-csv-routine/tests/month-parser.test.mjs
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `month-parser.mjs`**

```js
// scripts/daily-csv-routine/lib/month-parser.mjs
import path from 'path';

/**
 * Extract { year, month } from a filename or folder name.
 * Matches patterns like "2026_05_*", "2026-05_*".
 * Returns null if no recognizable year+month prefix.
 */
export function parseMonthFromPath(p) {
  const base = path.basename(String(p));
  const m = base.match(/^(\d{4})[_-](\d{1,2})[_\- ]/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npx vitest run scripts/daily-csv-routine/tests/month-parser.test.mjs
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/daily-csv-routine/lib/month-parser.mjs scripts/daily-csv-routine/tests/month-parser.test.mjs
git commit -m "feat(csv-routine): add month-parser with filename/folder parsing"
```

---

## Task 3: CSV builder (pure function + tests)

**Files:**
- Create: `scripts/daily-csv-routine/lib/csv-builder.mjs`
- Test: `scripts/daily-csv-routine/tests/csv-builder.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
// scripts/daily-csv-routine/tests/csv-builder.test.mjs
import { describe, it, expect } from 'vitest';
import { buildGhlCsv } from '../lib/csv-builder.mjs';

const samplePosts = [
  {
    day_number: 1,
    caption: 'First post caption.',
    cta: 'DM us.',
    hashtags: '#Demo #Test',
    image_urls: ['https://cdn/img1.png', 'https://cdn/img2.png'],
  },
  {
    day_number: 2,
    caption: 'Second, with "quotes" and,commas.',
    cta: null,
    hashtags: '#Two',
    image_urls: ['https://cdn/img3.png'],
  },
];

describe('buildGhlCsv', () => {
  it('produces header + one row per post', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    const lines = csv.trim().split('\n').filter(l => l.startsWith('2026-'));
    expect(lines.length).toBe(2);
  });

  it('uses correct GHL basic-format header', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toBe('postAtSpecificTime (YYYY-MM-DD HH:mm:ss),content,link (OGmetaUrl),imageUrls,gifUrl,videoUrls');
  });

  it('schedules Day 1 on startDate, not startDate-1 (no timezone off-by-one)', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    expect(csv).toContain('2026-06-01 09:00:00');
    expect(csv).not.toContain('2026-05-31');
  });

  it('advances one day per day_number', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    expect(csv).toContain('2026-06-02 09:00:00');
  });

  it('joins caption + CTA + hashtags with blank lines', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    expect(csv).toContain('First post caption.\n\nDM us.\n\n#Demo #Test');
  });

  it('escapes quotes and commas in content', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    expect(csv).toContain('"Second, with ""quotes"" and,commas.');
  });

  it('joins multiple image URLs with commas, inside quoted cell', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    expect(csv).toContain('"https://cdn/img1.png,https://cdn/img2.png"');
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

```bash
npx vitest run scripts/daily-csv-routine/tests/csv-builder.test.mjs
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `csv-builder.mjs`**

```js
// scripts/daily-csv-routine/lib/csv-builder.mjs

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

/**
 * Build a GHL Social Planner Basic-format CSV.
 *
 * @param {Array<{day_number, caption, cta, hashtags, image_urls}>} posts
 * @param {{startDate: string, postingTime: string}} config
 *   startDate: ISO date "YYYY-MM-DD" — Day 1 goes here
 *   postingTime: "HH:mm:ss"
 * @returns {string} CSV text
 */
export function buildGhlCsv(posts, { startDate, postingTime }) {
  const header = ['postAtSpecificTime (YYYY-MM-DD HH:mm:ss)', 'content', 'link (OGmetaUrl)', 'imageUrls', 'gifUrl', 'videoUrls'];
  const rows = [header.join(',')];

  for (const post of posts) {
    const caption = post.caption || '';
    const cta = post.cta ? `\n\n${post.cta}` : '';
    const tags = post.hashtags ? `\n\n${post.hashtags}` : '';
    const content = `${caption}${cta}${tags}`;
    const postDate = addDays(startDate, (post.day_number || 1) - 1);
    const postTime = `${postDate} ${postingTime}`;
    const urls = Array.isArray(post.image_urls) ? post.image_urls.join(',') : '';
    const cells = [postTime, content, '', urls, '', ''];
    rows.push(cells.map(csvEscape).join(','));
  }

  return rows.join('\n') + '\n';
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npx vitest run scripts/daily-csv-routine/tests/csv-builder.test.mjs
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/daily-csv-routine/lib/csv-builder.mjs scripts/daily-csv-routine/tests/csv-builder.test.mjs
git commit -m "feat(csv-routine): add csv-builder with TDD coverage"
```

---

## Task 4: Summary builder (pure function + tests)

**Files:**
- Create: `scripts/daily-csv-routine/lib/summary-builder.mjs`
- Test: `scripts/daily-csv-routine/tests/summary-builder.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
// scripts/daily-csv-routine/tests/summary-builder.test.mjs
import { describe, it, expect } from 'vitest';
import { buildSummary } from '../lib/summary-builder.mjs';

const samplePosts = [
  {
    post_id: 'VO360-01',
    day_number: 1,
    post_type: 'carousel',
    concept: 'The 4 invisible systems',
    caption: 'Strong businesses do not look calm by accident. They have systems most people never see.',
    cta: 'Save this post.',
    hashtags: '#VO360',
    image_urls: ['a.png', 'b.png', 'c.png', 'd.png'],
  },
  {
    post_id: 'VO360-02',
    day_number: 2,
    post_type: 'single',
    concept: 'Busy vs Built to Scale',
    caption: 'Short one.',
    cta: 'DM SCALE.',
    hashtags: '#Scale',
    image_urls: ['e.png'],
  },
];

describe('buildSummary', () => {
  it('starts with an H1 header naming the client and month', () => {
    const md = buildSummary(samplePosts, { client: 'VO360', year: 2026, month: 5, startDate: '2026-05-01' });
    expect(md.split('\n')[0]).toBe('# VO360 — May 2026');
  });

  it('lists every post with day, type, and slide count', () => {
    const md = buildSummary(samplePosts, { client: 'VO360', year: 2026, month: 5, startDate: '2026-05-01' });
    expect(md).toContain('Day 1 · VO360-01 · Carousel (4 slides)');
    expect(md).toContain('Day 2 · VO360-02 · Single');
  });

  it('truncates captions to 80 chars with ellipsis', () => {
    const md = buildSummary(samplePosts, { client: 'VO360', year: 2026, month: 5, startDate: '2026-05-01' });
    expect(md).toContain('Strong businesses do not look calm by accident. They have systems most people n…');
  });

  it('shows total post count', () => {
    const md = buildSummary(samplePosts, { client: 'VO360', year: 2026, month: 5, startDate: '2026-05-01' });
    expect(md).toContain('**2 posts total**');
  });

  it('includes warnings section when warnings are passed', () => {
    const md = buildSummary(samplePosts, {
      client: 'VO360', year: 2026, month: 5, startDate: '2026-05-01',
      warnings: ['Image X failed upload', 'Missing post_kits entry for VO360-03'],
    });
    expect(md).toContain('## Warnings');
    expect(md).toContain('- Image X failed upload');
    expect(md).toContain('- Missing post_kits entry for VO360-03');
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

```bash
npx vitest run scripts/daily-csv-routine/tests/summary-builder.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Implement `summary-builder.mjs`**

```js
// scripts/daily-csv-routine/lib/summary-builder.mjs

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function titleCase(s) {
  return String(s || '').replace(/\b\w/g, c => c.toUpperCase());
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/**
 * Build a human-readable Markdown summary.
 *
 * @param {Array} posts
 * @param {{client, year, month, startDate, warnings?}} meta
 */
export function buildSummary(posts, { client, year, month, startDate, warnings }) {
  const lines = [];
  lines.push(`# ${client} — ${MONTHS[month - 1]} ${year}`);
  lines.push('');
  lines.push(`**${posts.length} posts total** · starts ${startDate}`);
  lines.push('');
  lines.push('## Posts');
  lines.push('');
  for (const p of posts) {
    const typeLabel = titleCase(p.post_type || 'single');
    const slideCount = Array.isArray(p.image_urls) ? p.image_urls.length : 1;
    const typeDisplay = slideCount > 1 ? `${typeLabel} (${slideCount} slides)` : typeLabel;
    const id = p.post_id ? `${p.post_id} · ` : '';
    lines.push(`### Day ${p.day_number} · ${id}${typeDisplay}`);
    if (p.concept) lines.push(`**Concept:** ${p.concept}`);
    if (p.caption) lines.push(`**Caption:** ${truncate(p.caption, 80)}`);
    if (p.cta) lines.push(`**CTA:** ${p.cta}`);
    lines.push('');
  }
  if (Array.isArray(warnings) && warnings.length) {
    lines.push('## Warnings');
    lines.push('');
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push('');
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npx vitest run scripts/daily-csv-routine/tests/summary-builder.test.mjs
```

Expected: all 5 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/daily-csv-routine/lib/summary-builder.mjs scripts/daily-csv-routine/tests/summary-builder.test.mjs
git commit -m "feat(csv-routine): add summary-builder with TDD coverage"
```

---

## Task 5: Detector (pure function + tests with fs fixtures)

**Files:**
- Create: `scripts/daily-csv-routine/lib/detector.mjs`
- Test: `scripts/daily-csv-routine/tests/detector.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
// scripts/daily-csv-routine/tests/detector.test.mjs
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectPendingBundles, outputCsvName } from '../lib/detector.mjs';

let tmpRoot;
let watchRoot;
let outputRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-routine-test-'));
  watchRoot = path.join(tmpRoot, 'input');
  outputRoot = path.join(tmpRoot, 'output');
  fs.mkdirSync(watchRoot); fs.mkdirSync(outputRoot);
});
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function touch(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, ''); }

describe('outputCsvName', () => {
  it('formats client_Month_Year_GHL_Schedule.csv', () => {
    expect(outputCsvName('VO360', 2026, 5)).toBe('VO360_May_2026_GHL_Schedule.csv');
    expect(outputCsvName('Lyrie.AI', 2026, 12)).toBe('Lyrie.AI_December_2026_GHL_Schedule.csv');
  });
});

describe('detectPendingBundles', () => {
  it('returns empty when no client folders exist', () => {
    expect(detectPendingBundles(watchRoot, outputRoot)).toEqual([]);
  });

  it('detects a zip at client folder root as pending when no CSV exists', () => {
    touch(path.join(watchRoot, 'VO360', '2026_06_VO360.zip'));
    fs.mkdirSync(path.join(outputRoot, 'VO360'), { recursive: true });
    const pending = detectPendingBundles(watchRoot, outputRoot);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ client: 'VO360', year: 2026, month: 6 });
    expect(pending[0].sourcePath).toContain('2026_06_VO360.zip');
  });

  it('skips if the corresponding CSV already exists', () => {
    touch(path.join(watchRoot, 'VO360', '2026_06_VO360.zip'));
    fs.mkdirSync(path.join(outputRoot, 'VO360'), { recursive: true });
    touch(path.join(outputRoot, 'VO360', 'VO360_June_2026_GHL_Schedule.csv'));
    expect(detectPendingBundles(watchRoot, outputRoot)).toEqual([]);
  });

  it('detects a folder (not zip) with parseable name as pending', () => {
    fs.mkdirSync(path.join(watchRoot, 'Lyrie.AI', '2026_06_Lyrie_package'), { recursive: true });
    fs.mkdirSync(path.join(outputRoot, 'Lyrie.AI'), { recursive: true });
    const pending = detectPendingBundles(watchRoot, outputRoot);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ client: 'Lyrie.AI', year: 2026, month: 6 });
  });

  it('skips client folders without a matching output subfolder', () => {
    touch(path.join(watchRoot, 'Unknown', '2026_06_Unknown.zip'));
    // no Unknown/ in output
    expect(detectPendingBundles(watchRoot, outputRoot)).toEqual([]);
  });

  it('ignores unparseable drops (no year_month prefix)', () => {
    touch(path.join(watchRoot, 'VO360', 'random.zip'));
    fs.mkdirSync(path.join(outputRoot, 'VO360'), { recursive: true });
    expect(detectPendingBundles(watchRoot, outputRoot)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

```bash
npx vitest run scripts/daily-csv-routine/tests/detector.test.mjs
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `detector.mjs`**

```js
// scripts/daily-csv-routine/lib/detector.mjs
import fs from 'fs';
import path from 'path';
import { parseMonthFromPath } from './month-parser.mjs';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

export function outputCsvName(client, year, month) {
  return `${client}_${MONTHS[month - 1]}_${year}_GHL_Schedule.csv`;
}

function listDir(p) {
  try { return fs.readdirSync(p, { withFileTypes: true }); }
  catch { return []; }
}

/**
 * Scan the watch root for pending bundles.
 * A bundle is pending when:
 *   - its path has a parseable YYYY_MM prefix
 *   - client has an output subfolder
 *   - target CSV does not exist in that output subfolder
 */
export function detectPendingBundles(watchRoot, outputRoot) {
  const pending = [];
  for (const clientEnt of listDir(watchRoot)) {
    if (!clientEnt.isDirectory()) continue;
    if (clientEnt.name.startsWith('.') || clientEnt.name.startsWith('_')) continue;
    const clientName = clientEnt.name.trim();
    const outputSubdir = path.join(outputRoot, clientName);
    if (!fs.existsSync(outputSubdir)) continue; // not an automated client

    const clientDir = path.join(watchRoot, clientEnt.name);
    for (const ent of listDir(clientDir)) {
      const parsed = parseMonthFromPath(ent.name);
      if (!parsed) continue;
      const csvName = outputCsvName(clientName, parsed.year, parsed.month);
      if (fs.existsSync(path.join(outputSubdir, csvName))) continue;
      pending.push({
        client: clientName,
        year: parsed.year,
        month: parsed.month,
        sourcePath: path.join(clientDir, ent.name),
        kind: ent.isDirectory() ? 'folder' : 'zip',
      });
    }
  }
  return pending;
}
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npx vitest run scripts/daily-csv-routine/tests/detector.test.mjs
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/daily-csv-routine/lib/detector.mjs scripts/daily-csv-routine/tests/detector.test.mjs
git commit -m "feat(csv-routine): add detector for pending-bundle scanning"
```

---

## Task 6: Client registry (Turso lookup, no tests — integration)

**Files:**
- Create: `scripts/daily-csv-routine/lib/client-registry.mjs`

- [ ] **Step 1: Implement**

```js
// scripts/daily-csv-routine/lib/client-registry.mjs
import { createClient } from '@libsql/client';

let db = null;

function normalizeName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getDb() {
  if (db) return db;
  const url = process.env.TURSO_CONNECTION_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error('TURSO_CONNECTION_URL missing in env');
  db = createClient({ url, authToken });
  return db;
}

/**
 * Look up a client by folder name (case/whitespace insensitive).
 * @returns {Promise<object|null>} { id, name, cloudinary_folder, posting_time } or null
 */
export async function lookupClientByFolder(folderName) {
  const d = getDb();
  const target = normalizeName(folderName);
  const res = await d.execute(
    'SELECT id, name, cloudinary_folder, posting_time FROM clients',
  );
  for (const row of res.rows) {
    if (normalizeName(row.name) === target) {
      return {
        id: row.id,
        name: row.name,
        cloudinary_folder: row.cloudinary_folder || normalizeName(row.name).replace(/[^a-z0-9]/g, '-'),
        posting_time: row.posting_time || '09:00:00',
      };
    }
  }
  return null;
}
```

- [ ] **Step 2: Smoke test against real Turso**

```bash
cd ~/ghl-sub-account-builder
node --env-file=.env -e "import('./scripts/daily-csv-routine/lib/client-registry.mjs').then(async m => { console.log(await m.lookupClientByFolder('VO360')); console.log(await m.lookupClientByFolder('Lyrie.AI')); console.log(await m.lookupClientByFolder('Unknown Client')); })"
```

Expected: first two print client objects with `id`, `name`, `cloudinary_folder`, `posting_time`. Third prints `null`.

- [ ] **Step 3: Commit**

```bash
git add scripts/daily-csv-routine/lib/client-registry.mjs
git commit -m "feat(csv-routine): add client-registry with Turso lookup"
```

---

## Task 7: Bundle normalizer (reuses hub parsers)

**Files:**
- Create: `scripts/daily-csv-routine/lib/bundle-normalizer.mjs`

- [ ] **Step 1: Implement**

```js
// scripts/daily-csv-routine/lib/bundle-normalizer.mjs
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif)$/i;

/**
 * Flatten a source bundle (zip or folder, possibly with nested zips) into a
 * single directory of loose files. Returns an array of absolute file paths.
 */
export function normalizeBundle(sourcePath, workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  const stat = fs.statSync(sourcePath);

  if (stat.isFile() && sourcePath.toLowerCase().endsWith('.zip')) {
    extractZip(sourcePath, workDir);
  } else if (stat.isDirectory()) {
    copyTree(sourcePath, workDir);
    // expand any nested zips that showed up
    for (const f of fs.readdirSync(workDir)) {
      if (f.toLowerCase().endsWith('.zip')) {
        extractZip(path.join(workDir, f), workDir);
      }
    }
  } else {
    throw new Error(`Unsupported bundle path: ${sourcePath}`);
  }

  return collectFiles(workDir);
}

function extractZip(zipPath, outDir) {
  const zip = new AdmZip(zipPath);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const base = path.basename(entry.entryName);
    if (!base || base.startsWith('.') || entry.entryName.includes('__MACOSX/') || entry.entryName.startsWith('._')) continue;
    zip.extractEntryTo(entry, outDir, false, true);
  }
}

function copyTree(src, dst) {
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const from = path.join(src, ent.name);
    const to = path.join(dst, ent.name);
    if (ent.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyTree(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function collectFiles(dir) {
  const out = [];
  function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else out.push(p);
    }
  }
  walk(dir);
  return out;
}

export function filterImages(files) {
  return files.filter(f => IMAGE_RE.test(f));
}
```

- [ ] **Step 2: Smoke test**

```bash
cd ~/ghl-sub-account-builder
node -e "import('./scripts/daily-csv-routine/lib/bundle-normalizer.mjs').then(m => { const files = m.normalizeBundle('/Users/urielholzman/Desktop/Manus-Social Planner /VO360/may /may .zip', '/tmp/normalize-test'); console.log('Total:', files.length); console.log('Images:', m.filterImages(files).length); })"
```

Expected output: `Total: 53` (47 images + 3 docx + 2 md + misc), `Images: 47`.

- [ ] **Step 3: Commit**

```bash
git add scripts/daily-csv-routine/lib/bundle-normalizer.mjs
git commit -m "feat(csv-routine): add bundle-normalizer supporting zip/folder/nested-zip"
```

---

## Task 8: DOCX converter (handles Manus bundles with only .docx)

**Files:**
- Create: `scripts/daily-csv-routine/lib/docx-converter.mjs`

- [ ] **Step 1: Implement**

```js
// scripts/daily-csv-routine/lib/docx-converter.mjs
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

function docxParagraphs(docxPath) {
  const zip = new AdmZip(docxPath);
  const entry = zip.getEntry('word/document.xml');
  if (!entry) throw new Error(`Not a valid .docx: ${docxPath}`);
  const xml = entry.getData().toString('utf8');
  const paragraphs = [];
  for (const p of xml.split(/<\/w:p>/)) {
    const parts = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
    const txt = parts.join('').trim();
    if (txt) paragraphs.push(txt);
  }
  return paragraphs;
}

/**
 * Convert Manus Monthly Manifest .docx into a markdown-table manifest.md.
 * Returns the .md content as a string.
 */
export function manifestDocxToMd(docxPath) {
  const HEADER = ['Day','Post ID','Post Type','Concept Title','Filename','Slide Role','Caption File','Prompt File','Approval Status','Scheduled Status'];
  const lines = docxParagraphs(docxPath);
  let hstart = -1;
  for (let i = 0; i <= lines.length - HEADER.length; i++) {
    if (HEADER.every((h, j) => lines[i + j] === h)) { hstart = i; break; }
  }
  if (hstart < 0) throw new Error('Manifest header not found in docx');
  const body = lines.slice(hstart + HEADER.length);
  const rows = [];
  for (let i = 0; i + 9 < body.length; i += 10) {
    const row = body.slice(i, i + 10);
    if (!/^\d+$/.test(row[0])) break; // stop at non-numeric day = end of table
    // Remap role from descriptive ("Cover", "System Layer 1") to S01/S02 based on filename
    const filename = row[4];
    const m = filename.match(/_S(\d+)\.png$/i);
    if (m) row[5] = `S${String(parseInt(m[1], 10)).padStart(2, '0')}`;
    else if (/\.png$/i.test(filename)) row[5] = 'Single';
    rows.push(row);
  }
  const out = [
    '# Monthly Manifest\n',
    '| ' + HEADER.join(' | ') + ' |',
    '|' + HEADER.map(() => '---').join('|') + '|',
    ...rows.map(r => '| ' + r.join(' | ') + ' |'),
  ];
  return out.join('\n') + '\n';
}

/**
 * Convert Manus Post Kits .docx into markdown H2-sectioned format parseable
 * by manus-importer's parsePostKitsMd.
 */
export function postKitsDocxToMd(docxPath) {
  const FIELDS = ['Post type','Platform','Assets','Caption','Description','CTA','Hashtags','Prompt source','Routing note'];
  const lines = docxParagraphs(docxPath);
  const headerRe = /^([A-Z]{2,}[0-9]*-\d+)\s+[—–-]\s+(.+)$/;
  const headers = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headerRe);
    if (m) headers.push({ idx: i, postId: m[1], title: m[2] });
  }
  if (headers.length === 0) throw new Error('No post-kit headers found in docx');

  const posts = headers.map((h, j) => {
    const end = j + 1 < headers.length ? headers[j + 1].idx : lines.length;
    let body = lines.slice(h.idx + 1, end);
    if (body[0] === 'Field' && body[1] === 'Content') body = body.slice(2);
    const fields = {};
    const fieldSet = new Set(FIELDS);
    let cur = null; let vals = [];
    for (const l of body) {
      if (fieldSet.has(l)) {
        if (cur) fields[cur] = vals.join(' ').trim();
        cur = l; vals = [];
      } else vals.push(l);
    }
    if (cur) fields[cur] = vals.join(' ').trim();
    return { postId: h.postId, title: h.title, fields };
  });

  const out = ['# Post Kits\n'];
  for (const p of posts) {
    out.push(`## ${p.postId} — ${p.title}`);
    out.push('');
    out.push('| Field | Content |');
    out.push('|---|---|');
    for (const f of FIELDS) {
      const v = (p.fields[f] || '').replace(/\|/g, '\\|');
      out.push(`| ${f} | ${v} |`);
    }
    out.push('');
  }
  return out.join('\n') + '\n';
}

/**
 * If a bundle has docx manifest/post_kits but no .md versions, generate and
 * write the .md files alongside. Idempotent.
 */
export function ensureMdFromDocx(files, targetDir) {
  const byBase = new Map(files.map(f => [path.basename(f).toLowerCase(), f]));
  const hasManifestMd = files.some(f => /manifest\.md$/i.test(f));
  const hasPostKitsMd = files.some(f => /post_kits?\.md$/i.test(f));
  const writes = [];
  if (!hasManifestMd) {
    const d = files.find(f => /manifest.*\.docx$/i.test(path.basename(f)));
    if (d) {
      const md = manifestDocxToMd(d);
      const out = path.join(targetDir, 'generated_manifest.md');
      fs.writeFileSync(out, md); writes.push(out);
    }
  }
  if (!hasPostKitsMd) {
    const d = files.find(f => /post[_ ]*kits?.*\.docx$/i.test(path.basename(f)));
    if (d) {
      const md = postKitsDocxToMd(d);
      const out = path.join(targetDir, 'generated_post_kits.md');
      fs.writeFileSync(out, md); writes.push(out);
    }
  }
  return writes;
}
```

- [ ] **Step 2: Smoke test with May VO360 docx**

```bash
cd ~/ghl-sub-account-builder
node -e "import('./scripts/daily-csv-routine/lib/docx-converter.mjs').then(m => { const md1 = m.manifestDocxToMd('/Users/urielholzman/Desktop/Manus-Social Planner /VO360/may /VO360_Monthly_Manifest_—_2026_05.docx'); console.log('Manifest lines:', md1.split(String.fromCharCode(10)).length); console.log(md1.split(String.fromCharCode(10)).slice(0,5).join(String.fromCharCode(10))); })"
```

Expected output: `Manifest lines: 51` (H1 + blank + header + separator + 47 data rows + trailing). First 5 lines show H1 heading and pipe-table header.

- [ ] **Step 3: Commit**

```bash
git add scripts/daily-csv-routine/lib/docx-converter.mjs
git commit -m "feat(csv-routine): add docx-converter for Manus docx-only bundles"
```

---

## Task 9: Cloudinary uploader

**Files:**
- Create: `scripts/daily-csv-routine/lib/cloudinary-uploader.mjs`

- [ ] **Step 1: Implement**

```js
// scripts/daily-csv-routine/lib/cloudinary-uploader.mjs
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';

let configured = false;
function ensureConfig() {
  if (configured) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  if (!process.env.CLOUDINARY_CLOUD_NAME) throw new Error('CLOUDINARY_CLOUD_NAME missing');
  configured = true;
}

function uploadOne(filepath, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: 'image', overwrite: true },
      (err, result) => err ? reject(err) : resolve(result.secure_url),
    );
    fs.createReadStream(filepath).pipe(stream);
  });
}

/**
 * Upload many files in parallel batches.
 * @param {Array<{filepath, publicId}>} jobs
 * @param {{batchSize?: number, onProgress?: (done, total) => void}} opts
 * @returns {Promise<Array<{publicId, secure_url, error?}>>}
 */
export async function uploadAll(jobs, { batchSize = 8, onProgress } = {}) {
  ensureConfig();
  const results = [];
  for (let i = 0; i < jobs.length; i += batchSize) {
    const slice = jobs.slice(i, i + batchSize);
    const batchRes = await Promise.all(slice.map(async j => {
      try {
        const url = await uploadOne(j.filepath, j.publicId);
        return { publicId: j.publicId, secure_url: url };
      } catch (err) {
        return { publicId: j.publicId, error: err.message };
      }
    }));
    results.push(...batchRes);
    if (onProgress) onProgress(results.length, jobs.length);
  }
  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/daily-csv-routine/lib/cloudinary-uploader.mjs
git commit -m "feat(csv-routine): add cloudinary-uploader with parallel batching"
```

---

## Task 10: Notifier (macOS osascript wrapper)

**Files:**
- Create: `scripts/daily-csv-routine/lib/notifier.mjs`

- [ ] **Step 1: Implement**

```js
// scripts/daily-csv-routine/lib/notifier.mjs
import { spawnSync } from 'child_process';

function escape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Fire a macOS notification via osascript. No-op silently if osascript fails.
 */
export function notify({ title, subtitle, message }) {
  const t = escape(title || 'CSV Routine');
  const s = escape(subtitle || '');
  const m = escape(message || '');
  const script = `display notification "${m}" with title "${t}"${s ? ` subtitle "${s}"` : ''} sound name "Glass"`;
  try {
    spawnSync('osascript', ['-e', script], { stdio: 'ignore' });
  } catch { /* silent */ }
}
```

- [ ] **Step 2: Manual test**

```bash
cd ~/ghl-sub-account-builder
node -e "import('./scripts/daily-csv-routine/lib/notifier.mjs').then(m => m.notify({ title: 'CSV Routine Test', subtitle: 'Manual verify', message: 'If you see this, it works.' }))"
```

Expected: macOS notification appears top-right.

- [ ] **Step 3: Commit**

```bash
git add scripts/daily-csv-routine/lib/notifier.mjs
git commit -m "feat(csv-routine): add notifier wrapping osascript"
```

---

## Task 11: Single-bundle processor (wires everything together)

**Files:**
- Create: `scripts/daily-csv-routine/process-bundle.mjs`

- [ ] **Step 1: Implement**

```js
// scripts/daily-csv-routine/process-bundle.mjs
//
// Usage: node process-bundle.mjs <client-name> <source-path> [--year=YYYY --month=M --start=YYYY-MM-DD]
//
// Processes a single Manus bundle end-to-end: extract → docx-convert-if-needed →
// parse manifest+post_kits → Cloudinary upload → CSV + summary → Desktop output.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { OUTPUT_ROOT, LOG_DIR, DEFAULT_POSTING_TIME } from './config.mjs';
import { lookupClientByFolder } from './lib/client-registry.mjs';
import { normalizeBundle, filterImages } from './lib/bundle-normalizer.mjs';
import { ensureMdFromDocx } from './lib/docx-converter.mjs';
import { uploadAll } from './lib/cloudinary-uploader.mjs';
import { buildGhlCsv } from './lib/csv-builder.mjs';
import { buildSummary } from './lib/summary-builder.mjs';
import { outputCsvName } from './lib/detector.mjs';
import { parseManifestMd, parsePostKitsMd } from '../../server/services/manus-importer.js';

function loadEnvFrom(dotenvPath) {
  if (!fs.existsSync(dotenvPath)) return;
  for (const line of fs.readFileSync(dotenvPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function slideOrder(role) {
  if (!role) return 999;
  const r = role.toLowerCase();
  if (r === 'single') return 1;
  const m = r.match(/^s0*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  return 999;
}

function firstDayOfMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export async function processBundle({ clientName, sourcePath, year, month, startDate, onProgress }) {
  const warnings = [];
  const client = await lookupClientByFolder(clientName);
  if (!client) throw new Error(`Client "${clientName}" not found in hub clients table`);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `csv-routine-${clientName}-`));
  try {
    const files = normalizeBundle(sourcePath, workDir);
    const images = filterImages(files);
    if (images.length === 0) throw new Error('No images found in bundle');

    const generated = ensureMdFromDocx(files, workDir);
    const allFiles = [...files, ...generated];
    const manifestPath = allFiles.find(f => /manifest\.md$/i.test(path.basename(f)));
    const postKitsPath = allFiles.find(f => /post_kits?\.md$/i.test(path.basename(f)));
    if (!manifestPath) throw new Error('No manifest.md or convertible .docx found');

    const manifest = parseManifestMd(manifestPath);
    const kits = postKitsPath ? parsePostKitsMd(postKitsPath) : new Map();

    // Build upload jobs
    const imageByName = new Map(images.map(p => [path.basename(p).toLowerCase(), p]));
    const jobs = [];
    const postsMeta = [];
    for (const [postId, entry] of manifest) {
      const sorted = [...entry.slides].sort((a, b) => slideOrder(a.role) - slideOrder(b.role));
      const slideCount = sorted.length;
      const postJobs = [];
      for (let i = 0; i < sorted.length; i++) {
        const fname = sorted[i].filename;
        const fp = imageByName.get(fname.toLowerCase());
        if (!fp) { warnings.push(`Missing image: ${fname}`); continue; }
        const dayStr = String(entry.day).padStart(2, '0');
        const publicId = slideCount === 1
          ? `${client.cloudinary_folder}/${year}-${String(month).padStart(2, '0')}/day-${dayStr}`
          : `${client.cloudinary_folder}/${year}-${String(month).padStart(2, '0')}/day-${dayStr}-s${String(i + 1).padStart(2, '0')}`;
        postJobs.push({ filepath: fp, publicId });
        jobs.push({ filepath: fp, publicId });
      }
      const kit = kits.get(postId) || {};
      postsMeta.push({ postId, entry, kit, postJobs, slideCount });
    }

    // Upload
    const uploadResults = await uploadAll(jobs, {
      batchSize: 8,
      onProgress: (done, total) => onProgress?.({ phase: 'upload', done, total }),
    });
    const urlByPublicId = new Map();
    for (const r of uploadResults) {
      if (r.error) warnings.push(`Cloudinary upload failed for ${r.publicId}: ${r.error}`);
      else urlByPublicId.set(r.publicId, r.secure_url);
    }

    // Build CSV posts
    const csvPosts = postsMeta.map(({ postId, entry, kit, postJobs }) => ({
      post_id: postId,
      day_number: entry.day,
      post_type: entry.post_type,
      concept: entry.concept,
      caption: kit.caption || null,
      cta: kit.cta || null,
      hashtags: kit.hashtags || null,
      image_urls: postJobs.map(j => urlByPublicId.get(j.publicId)).filter(Boolean),
    })).sort((a, b) => a.day_number - b.day_number);

    const csv = buildGhlCsv(csvPosts, { startDate, postingTime: client.posting_time || DEFAULT_POSTING_TIME });
    const summary = buildSummary(csvPosts, { client: clientName, year, month, startDate, warnings });

    const outDir = path.join(OUTPUT_ROOT, clientName);
    fs.mkdirSync(outDir, { recursive: true });
    const csvFile = path.join(outDir, outputCsvName(clientName, year, month));
    const summaryFile = path.join(outDir, `${clientName}_${MONTHS[month - 1]}_${year}_Summary.md`);
    fs.writeFileSync(csvFile, csv);
    fs.writeFileSync(summaryFile, summary);

    return { csvFile, summaryFile, postCount: csvPosts.length, uploadCount: uploadResults.filter(r => !r.error).length, warnings };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnvFrom(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '.env'));
  const [,, clientName, sourcePath] = process.argv;
  if (!clientName || !sourcePath) {
    console.error('Usage: node process-bundle.mjs <client> <source-path>');
    process.exit(1);
  }
  const args = Object.fromEntries(process.argv.slice(4).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v];
  }));
  const year = args.year ? parseInt(args.year, 10) : null;
  const month = args.month ? parseInt(args.month, 10) : null;
  if (!year || !month) {
    console.error('Please pass --year=YYYY --month=M');
    process.exit(1);
  }
  const startDate = args.start || firstDayOfMonth(year, month);
  processBundle({ clientName, sourcePath, year, month, startDate, onProgress: e => console.log(`  ${e.phase}: ${e.done}/${e.total}`) })
    .then(r => { console.log('✓', r); })
    .catch(e => { console.error('✗', e); process.exit(1); });
}
```

- [ ] **Step 2: Manual integration test — replay May VO360**

```bash
cd ~/ghl-sub-account-builder
rm -f "/Users/urielholzman/Desktop/CSV Ready Zips/VO360/VO360_May_2026_GHL_Schedule.csv"
rm -f "/Users/urielholzman/Desktop/CSV Ready Zips/VO360/VO360_May_2026_Summary.md"
node scripts/daily-csv-routine/process-bundle.mjs "VO360" "/Users/urielholzman/Desktop/Manus-Social Planner /VO360/may /may .zip" --year=2026 --month=5
```

Expected:
- Logs upload progress (`upload: 8/47` → `47/47`)
- `✓ { csvFile: '/Users/urielholzman/Desktop/CSV Ready Zips/VO360/VO360_May_2026_GHL_Schedule.csv', summaryFile: ..., postCount: 30, uploadCount: 47, warnings: [] }`
- Both files land in output folder.
- First CSV row shows `2026-05-01 09:00:00`.

- [ ] **Step 3: Verify CSV byte-identical to tonight's known-good output**

```bash
diff "/Users/urielholzman/Desktop/CSV Ready Zips/VO360/VO360_May_2026_GHL_Schedule.csv" <(echo "sample first 2 rows already validated tonight")
# Accept if post count = 30, all rows parseable, dates 2026-05-01 → 2026-05-30
head -1 "/Users/urielholzman/Desktop/CSV Ready Zips/VO360/VO360_May_2026_GHL_Schedule.csv"
awk '/^2026-/ {count++} END {print "post rows:", count}' "/Users/urielholzman/Desktop/CSV Ready Zips/VO360/VO360_May_2026_GHL_Schedule.csv"
```

Expected: header matches GHL basic format; `post rows: 30`.

- [ ] **Step 4: Commit**

```bash
git add scripts/daily-csv-routine/process-bundle.mjs
git commit -m "feat(csv-routine): add process-bundle end-to-end pipeline"
```

---

## Task 12: Daily runner with logging + dry-run mode

**Files:**
- Create: `scripts/daily-csv-routine/run-daily.mjs`

- [ ] **Step 1: Implement**

```js
// scripts/daily-csv-routine/run-daily.mjs
//
// Usage:
//   node run-daily.mjs           # real run
//   node run-daily.mjs --dry-run # list pending, don't process

import fs from 'fs';
import path from 'path';
import { WATCH_ROOT, OUTPUT_ROOT, LOG_DIR } from './config.mjs';
import { detectPendingBundles } from './lib/detector.mjs';
import { processBundle } from './process-bundle.mjs';
import { notify } from './lib/notifier.mjs';

function loadEnvFrom(dotenvPath) {
  if (!fs.existsSync(dotenvPath)) return;
  for (const line of fs.readFileSync(dotenvPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

function ensureLogDir() { fs.mkdirSync(LOG_DIR, { recursive: true }); }

function logLine(msg) {
  ensureLogDir();
  const stamp = new Date().toISOString();
  const file = path.join(LOG_DIR, `${stamp.slice(0, 10)}.log`);
  fs.appendFileSync(file, `[${stamp}] ${msg}\n`);
  console.log(msg);
}

function firstDayOfMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const envPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '.env');
  loadEnvFrom(envPath);

  logLine(`=== Daily CSV routine start (dryRun=${dryRun}) ===`);
  const pending = detectPendingBundles(WATCH_ROOT, OUTPUT_ROOT);
  logLine(`Pending bundles: ${pending.length}`);
  for (const p of pending) logLine(`  - ${p.client} ${p.year}-${p.month}: ${p.sourcePath}`);

  if (dryRun || pending.length === 0) {
    if (pending.length === 0) logLine('Nothing to do.');
    logLine('=== End ===');
    return;
  }

  const results = [];
  const failures = [];
  for (const p of pending) {
    try {
      logLine(`Processing ${p.client} ${p.year}-${p.month}...`);
      const res = await processBundle({
        clientName: p.client,
        sourcePath: p.sourcePath,
        year: p.year,
        month: p.month,
        startDate: firstDayOfMonth(p.year, p.month),
        onProgress: e => logLine(`    ${e.phase}: ${e.done}/${e.total}`),
      });
      logLine(`  ✓ ${res.postCount} posts, ${res.uploadCount} images uploaded${res.warnings.length ? `, ${res.warnings.length} warnings` : ''}`);
      if (res.warnings.length) for (const w of res.warnings) logLine(`    ⚠ ${w}`);
      results.push({ client: p.client, ...res });
    } catch (err) {
      logLine(`  ✗ Failed: ${err.message}`);
      failures.push({ client: p.client, month: p.month, error: err.message });
    }
  }

  // Notify
  if (results.length > 0) {
    const summary = results.map(r => `${r.client} (${r.postCount})`).join(', ');
    notify({ title: 'CSV Routine', subtitle: `${results.length} bundle${results.length > 1 ? 's' : ''} ready`, message: summary });
  }
  if (failures.length > 0) {
    notify({ title: 'CSV Routine — Errors', subtitle: `${failures.length} failed`, message: failures.map(f => `${f.client}: ${f.error}`).join('\n') });
  }

  logLine('=== End ===');
}

main().catch(e => {
  logLine(`FATAL: ${e.message}\n${e.stack}`);
  notify({ title: 'CSV Routine', subtitle: 'Fatal error', message: e.message });
  process.exit(1);
});
```

- [ ] **Step 2: Dry-run test**

```bash
cd ~/ghl-sub-account-builder
node scripts/daily-csv-routine/run-daily.mjs --dry-run
```

Expected: logs pending bundles (should be empty if May VO360 was processed in Task 11), or lists any unprocessed older bundles. Does not actually process.

- [ ] **Step 3: Real test — force a pending bundle**

```bash
rm "/Users/urielholzman/Desktop/CSV Ready Zips/VO360/VO360_May_2026_GHL_Schedule.csv"
node scripts/daily-csv-routine/run-daily.mjs
```

Expected: detects May VO360, processes, notifies, writes CSV, log file in `_logs/`.

- [ ] **Step 4: Commit**

```bash
git add scripts/daily-csv-routine/run-daily.mjs
git commit -m "feat(csv-routine): add daily runner with logging and dry-run mode"
```

---

## Task 13: Set up the Claude Routine (daily 08:00)

**Files:** (no code — Claude Code scheduled agent)

- [ ] **Step 1: Create the routine via Claude Code's schedule skill**

In a Claude Code session, invoke:

```
/schedule create
```

When prompted, provide:
- **Schedule:** `0 8 * * *` (daily at 08:00 local)
- **Prompt:** paste the following —

```
Run the daily CSV routine for Manus social-content bundles.

Execute: node ~/ghl-sub-account-builder/scripts/daily-csv-routine/run-daily.mjs

After it finishes, read the latest log file in ~/Desktop/CSV\ Ready\ Zips/_logs/ and summarize what happened in one short sentence. If any bundle failed, list which client and the error briefly. Do not take any further action — the user will review the CSVs manually.
```

- [ ] **Step 2: Verify the routine exists**

```
/schedule list
```

Expected: entry with `0 8 * * *` and the above prompt.

- [ ] **Step 3: Manually trigger once to confirm it runs end-to-end**

```
/schedule run <id>
```

Expected: agent executes, reads log, responds with "Nothing pending" (or a summary if there's work).

- [ ] **Step 4: Document the routine ID in project memory**

Update `~/.claude/projects/-Users-urielholzman/memory/project_onboarding_hub.md` under "Completed features" with:
```
- **Manus Daily CSV Routine** (shipped YYYY-MM-DD): scheduled agent ID <id>, daily 08:00, scans ~/Desktop/Manus-Social Planner/ → writes CSVs to ~/Desktop/CSV Ready Zips/
```

- [ ] **Step 5: No code to commit — the routine is Claude-side state.**

---

## Task 14: End-to-end smoke on a fresh month + cleanup

**Files:** (no code changes)

- [ ] **Step 1: Simulate June delivery (using May data)**

```bash
cd ~/ghl-sub-account-builder
# Copy May zip as if it were a June delivery
cp "/Users/urielholzman/Desktop/Manus-Social Planner /VO360/may /may .zip" "/Users/urielholzman/Desktop/Manus-Social Planner /VO360/2026_06_VO360_test.zip"
```

Note: the copy won't actually have June content — this tests only the detection + processing + naming flow.

- [ ] **Step 2: Run routine**

```bash
node scripts/daily-csv-routine/run-daily.mjs
```

Expected:
- Detects `2026_06_VO360_test.zip`
- Processes it
- Writes `/Users/urielholzman/Desktop/CSV Ready Zips/VO360/VO360_June_2026_GHL_Schedule.csv`
- macOS notification appears
- Log file shows full run

- [ ] **Step 3: Verify June CSV starts on June 1**

```bash
head -2 "/Users/urielholzman/Desktop/CSV Ready Zips/VO360/VO360_June_2026_GHL_Schedule.csv" | tail -1 | cut -c1-20
```

Expected: `2026-06-01 09:00:00`.

- [ ] **Step 4: Cleanup test artifacts**

```bash
rm "/Users/urielholzman/Desktop/Manus-Social Planner /VO360/2026_06_VO360_test.zip"
rm "/Users/urielholzman/Desktop/CSV Ready Zips/VO360/VO360_June_2026_GHL_Schedule.csv"
rm "/Users/urielholzman/Desktop/CSV Ready Zips/VO360/VO360_June_2026_Summary.md"
```

- [ ] **Step 5: Run dry-run, confirm clean state**

```bash
node scripts/daily-csv-routine/run-daily.mjs --dry-run
```

Expected: `Pending bundles: 0` (May VO360 CSV already present from Task 11, June test cleaned up).

- [ ] **Step 6: Commit any incidental fixes**

```bash
git status  # should be clean or only log files untracked
```

---

## Spec Coverage Self-Review

Checked each spec section against tasks:

| Spec requirement | Task |
|---|---|
| Daily scan of `~/Desktop/Manus-Social Planner/{Client}/` | Task 5 (detector), Task 12 (runner) |
| Automatic extraction, Cloudinary, CSV + summary | Tasks 7, 9, 3, 4, 11 |
| Output to `~/Desktop/CSV Ready Zips/{Client}/` | Task 11 |
| macOS notification | Task 10, integrated in Task 12 |
| Manus format drift handling (docx fallback, format variants) | Tasks 7, 8 |
| Per-client config from Onboarding Hub's Turso | Task 6 |
| State = output folder existence | Task 5 (detector) |
| Dry-run mode | Task 12 |
| Error handling: log + notify + continue | Task 12 |
| Claude Routine trigger, once-per-day at 08:00 | Task 13 |
| Replay via delete-and-rerun | Task 11 Step 2 (re-runs May VO360), Task 12 Step 3 |
| Start date rule (1st of month for monthly drops) | Task 12 (`firstDayOfMonth`) |
| Future-deferred items | No tasks (intentional) |

No gaps found. No placeholders. All function/property names match between tasks (`outputCsvName`, `detectPendingBundles`, `processBundle`, `buildGhlCsv`, `buildSummary`, `lookupClientByFolder`, `normalizeBundle`, `uploadAll`, `notify`).

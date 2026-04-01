# GHL Sub-Account Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js + React web app that creates GoHighLevel sub-accounts via a 6-step automated pipeline with real-time progress tracking and build history.

**Architecture:** Express backend on port 3003 handles auth, build orchestration, and GHL API calls. React + Vite + Tailwind frontend provides the UI with SSE for real-time progress. SQLite stores builds, steps, and settings.

**Tech Stack:** Node.js, Express, React 18, Vite, Tailwind CSS, SQLite (better-sqlite3), SSE, bcrypt, express-session

**Spec:** `docs/superpowers/specs/2026-03-31-ghl-sub-account-builder-design.md`

---

## File Map

```
ghl-sub-account-builder/
├── package.json                    # Root package.json with dev/build/start scripts
├── .env.example                    # Template env file
├── .gitignore
├── vite.config.js                  # Vite config with proxy to Express
├── tailwind.config.js              # VO360 brand theme
├── postcss.config.js               # Tailwind PostCSS setup
├── index.html                      # Vite HTML entry
├── server/
│   ├── index.js                    # Express app setup, middleware, route mounting
│   ├── db/
│   │   ├── index.js               # SQLite connection + schema migrations
│   │   └── queries.js             # All prepared statements
│   ├── middleware/
│   │   └── auth.js                # Session check middleware
│   ├── routes/
│   │   ├── auth.js                # POST /api/auth/login, /logout
│   │   ├── builds.js              # POST /api/builds, GET list/detail/stream, retry
│   │   └── stats.js               # GET /api/stats
│   ├── services/
│   │   ├── ghl-api.js             # GHL API client (HTTP calls + auth headers)
│   │   ├── build-runner.js        # 6-step orchestrator with retry logic
│   │   ├── phone-fallback.js      # Area code fallback algorithm
│   │   └── pipelines.js           # Industry pipeline stage definitions
│   └── config/
│       └── snapshots.json         # Industry → snapshot ID mapping
├── src/
│   ├── main.jsx                   # React entry
│   ├── App.jsx                    # Router + layout
│   ├── index.css                  # Tailwind imports + global styles
│   ├── pages/
│   │   ├── Login.jsx              # Password login page
│   │   ├── NewBuild.jsx           # Form + progress tracker page
│   │   └── BuildHistory.jsx       # History table + stats page
│   ├── components/
│   │   ├── Sidebar.jsx            # Dark sidebar navigation
│   │   ├── BuildForm.jsx          # Client details form with validation
│   │   ├── ProgressTracker.jsx    # 6-step vertical stepper
│   │   ├── StatsCards.jsx         # 4 stat cards for history page
│   │   ├── BuildTable.jsx         # Paginated builds table
│   │   └── BuildDetailRow.jsx     # Expandable row with step details
│   └── hooks/
│       ├── useSSE.js              # SSE connection + reconnect hook
│       └── useAuth.js             # Auth state + login/logout
└── tests/
    ├── server/
    │   ├── db.test.js             # Database schema + query tests
    │   ├── auth.test.js           # Auth middleware + routes tests
    │   ├── build-runner.test.js   # Build orchestrator tests
    │   ├── phone-fallback.test.js # Area code fallback tests
    │   ├── pipelines.test.js      # Pipeline stage definition tests
    │   └── builds-api.test.js     # Build routes integration tests
    └── setup.js                   # Test setup (in-memory SQLite)
```

---

## Task 1: Project Scaffolding + Dependencies

**Files:**
- Create: `package.json`, `.env.example`, `.gitignore`, `vite.config.js`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.jsx`, `src/index.css`, `src/App.jsx`

- [ ] **Step 1: Initialize project and install dependencies**

```bash
cd /Users/urielholzman/ghl-sub-account-builder
npm init -y
npm install express better-sqlite3 better-sqlite3-session-store express-session bcryptjs uuid cors dotenv
npm install -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite postcss autoprefixer react react-dom react-router-dom vitest
```

- [ ] **Step 2: Create .gitignore**

```gitignore
node_modules/
dist/
.env
*.db
.superpowers/
```

- [ ] **Step 3: Create .env.example**

```
GHL_AGENCY_API_KEY=your_ghl_agency_api_key
APP_PASSWORD=changeme
PORT=3003
SESSION_SECRET=
```

- [ ] **Step 4: Create vite.config.js with proxy**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 5: Create tailwind.config.js with VO360 brand**

```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        magenta: '#ff00ff',
        navy: '#000080',
        sidebar: '#1a2133',
        'page-bg': '#f2f7fa',
      },
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 6: Create postcss.config.js**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 7: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
    <title>VO360 — Sub-Account Builder</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create src/index.css**

```css
@import "tailwindcss";
```

- [ ] **Step 9: Create src/main.jsx**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 10: Create src/App.jsx placeholder**

```jsx
import { Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <div className="min-h-screen bg-page-bg font-sans">
      <Routes>
        <Route path="/" element={<div className="p-8 text-navy text-xl font-bold">VO360 Sub-Account Builder</div>} />
      </Routes>
    </div>
  );
}
```

- [ ] **Step 11: Update package.json scripts**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "dev": "vite",
    "dev:server": "node server/index.js",
    "dev:all": "concurrently \"npm run dev:server\" \"npm run dev\"",
    "build": "vite build",
    "start": "node server/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Install concurrently: `npm install -D concurrently`

- [ ] **Step 12: Verify frontend boots**

```bash
cd /Users/urielholzman/ghl-sub-account-builder && npx vite --host 127.0.0.1 &
sleep 3
curl -s http://127.0.0.1:5173 | head -20
kill %1
```

Expected: HTML with "VO360 Sub-Account Builder" in the output.

- [ ] **Step 13: Commit**

```bash
git add -A && git commit -m "feat: project scaffolding with Vite, React, Tailwind, Express deps"
```

---

## Task 2: Database Layer

**Files:**
- Create: `server/db/index.js`, `server/db/queries.js`
- Create: `tests/setup.js`, `tests/server/db.test.js`

- [ ] **Step 1: Write failing database tests**

Create `tests/setup.js`:
```js
import Database from 'better-sqlite3';

export function createTestDb() {
  const db = new Database(':memory:');
  return db;
}
```

Create `tests/server/db.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeDb } from '../../server/db/index.js';
import * as queries from '../../server/db/queries.js';

describe('Database', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    initializeDb(db);
  });

  it('creates builds table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='builds'").get();
    expect(tables).toBeTruthy();
  });

  it('creates build_steps table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='build_steps'").get();
    expect(tables).toBeTruthy();
  });

  it('creates settings table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
    expect(tables).toBeTruthy();
  });

  it('inserts and retrieves a build', () => {
    const build = {
      id: 'test-uuid-123',
      business_name: 'Acme Plumbing',
      business_email: 'info@acme.com',
      business_phone: '5551234567',
      address: '123 Main St',
      city: 'Miami',
      state: 'FL',
      zip: '33101',
      country: 'US',
      industry: 'plumbing',
      timezone: 'America/New_York',
      owner_first_name: 'John',
      owner_last_name: 'Smith',
      area_code: '305',
      website_url: null,
    };
    queries.insertBuild(db, build);
    const result = queries.getBuildById(db, 'test-uuid-123');
    expect(result.business_name).toBe('Acme Plumbing');
    expect(result.status).toBe('pending');
  });

  it('inserts and retrieves build steps', () => {
    const build = {
      id: 'test-uuid-456',
      business_name: 'Test',
      business_email: 'test@test.com',
      business_phone: '5551234567',
      address: '', city: '', state: '', zip: '', country: 'US',
      industry: 'general',
      timezone: 'America/New_York',
      owner_first_name: 'Test',
      owner_last_name: 'User',
      area_code: '305',
      website_url: null,
    };
    queries.insertBuild(db, build);
    queries.createBuildSteps(db, 'test-uuid-456');
    const steps = queries.getBuildSteps(db, 'test-uuid-456');
    expect(steps).toHaveLength(6);
    expect(steps[0].step_name).toBe('Create Sub-Account');
    expect(steps[5].step_name).toBe('Send Welcome Comms');
  });

  it('updates build step status', () => {
    const build = {
      id: 'test-uuid-789',
      business_name: 'Test',
      business_email: 'test@test.com',
      business_phone: '5551234567',
      address: '', city: '', state: '', zip: '', country: 'US',
      industry: 'general',
      timezone: 'America/New_York',
      owner_first_name: 'Test',
      owner_last_name: 'User',
      area_code: '305',
      website_url: null,
    };
    queries.insertBuild(db, build);
    queries.createBuildSteps(db, 'test-uuid-789');
    queries.updateStepStatus(db, 'test-uuid-789', 1, 'completed', 2100, null, '{"location":{"id":"loc123"}}');
    const steps = queries.getBuildSteps(db, 'test-uuid-789');
    expect(steps[0].status).toBe('completed');
    expect(steps[0].duration_ms).toBe(2100);
    expect(JSON.parse(steps[0].api_response).location.id).toBe('loc123');
  });

  it('lists builds with pagination', () => {
    for (let i = 0; i < 25; i++) {
      queries.insertBuild(db, {
        id: `build-${i}`,
        business_name: `Business ${i}`,
        business_email: `b${i}@test.com`,
        business_phone: '5551234567',
        address: '', city: '', state: '', zip: '', country: 'US',
        industry: 'general',
        timezone: 'America/New_York',
        owner_first_name: 'Test',
        owner_last_name: 'User',
        area_code: '305',
        website_url: null,
      });
    }
    const page1 = queries.listBuilds(db, { page: 1, perPage: 20 });
    expect(page1.builds).toHaveLength(20);
    expect(page1.total).toBe(25);
    const page2 = queries.listBuilds(db, { page: 2, perPage: 20 });
    expect(page2.builds).toHaveLength(5);
  });

  it('gets aggregate stats', () => {
    queries.insertBuild(db, {
      id: 'b1', business_name: 'A', business_email: 'a@t.com', business_phone: '555',
      address: '', city: '', state: '', zip: '', country: 'US',
      industry: 'general', timezone: 'UTC', owner_first_name: 'A', owner_last_name: 'B',
      area_code: '305', website_url: null,
    });
    queries.updateBuildStatus(db, 'b1', 'completed', 12000);
    const stats = queries.getStats(db);
    expect(stats.total).toBe(1);
    expect(stats.successful).toBe(1);
    expect(stats.failed).toBe(0);
  });

  it('stores and retrieves settings', () => {
    queries.setSetting(db, 'password_hash', 'hashed_value');
    const result = queries.getSetting(db, 'password_hash');
    expect(result).toBe('hashed_value');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/urielholzman/ghl-sub-account-builder && npx vitest run tests/server/db.test.js
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement server/db/index.js**

```js
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
```

- [ ] **Step 4: Implement server/db/queries.js**

```js
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
  const stmt = db.prepare(`
    INSERT INTO build_steps (build_id, step_number, step_name)
    VALUES (?, ?, ?)
  `);
  const insertMany = db.transaction(() => {
    STEP_NAMES.forEach((name, i) => {
      stmt.run(buildId, i + 1, name);
    });
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
    db.prepare('UPDATE builds SET status = ?, completed_at = datetime(\'now\'), total_duration_ms = ? WHERE id = ?')
      .run(status, totalDurationMs, id);
  } else {
    db.prepare('UPDATE builds SET status = ? WHERE id = ?').run(status, id);
  }
}

export function updateBuildLocationId(db, id, locationId) {
  db.prepare('UPDATE builds SET location_id = ? WHERE id = ?').run(locationId, id);
}

export function updateStepStatus(db, buildId, stepNumber, status, durationMs = null, errorMessage = null, apiResponse = null) {
  if (status === 'running') {
    db.prepare(`
      UPDATE build_steps SET status = ?, started_at = datetime('now')
      WHERE build_id = ? AND step_number = ?
    `).run(status, buildId, stepNumber);
  } else {
    db.prepare(`
      UPDATE build_steps SET status = ?, completed_at = datetime('now'), duration_ms = ?, error_message = ?, api_response = ?
      WHERE build_id = ? AND step_number = ?
    `).run(status, durationMs, errorMessage, apiResponse, buildId, stepNumber);
  }
}

export function incrementStepRetry(db, buildId, stepNumber) {
  db.prepare('UPDATE build_steps SET retry_count = retry_count + 1 WHERE build_id = ? AND step_number = ?')
    .run(buildId, stepNumber);
}

export function listBuilds(db, { page = 1, perPage = 20, search = '', industry = '', status = '' } = {}) {
  let where = 'WHERE 1=1';
  const params = {};

  if (search) {
    where += ' AND (business_name LIKE @search OR business_email LIKE @search OR location_id LIKE @search)';
    params.search = `%${search}%`;
  }
  if (industry) {
    where += ' AND industry = @industry';
    params.industry = industry;
  }
  if (status) {
    where += ' AND status = @status';
    params.status = status;
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM builds ${where}`).get(params).count;
  const builds = db.prepare(`SELECT * FROM builds ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: perPage, offset: (page - 1) * perPage });

  return { builds, total, page, perPage };
}

export function getStats(db) {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      AVG(CASE WHEN status = 'completed' THEN total_duration_ms END) as avg_duration_ms
    FROM builds
  `).get();
  return {
    total: row.total,
    successful: row.successful || 0,
    failed: row.failed || 0,
    avg_duration_ms: row.avg_duration_ms ? Math.round(row.avg_duration_ms) : 0,
  };
}

export function setSetting(db, key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/urielholzman/ghl-sub-account-builder && npx vitest run tests/server/db.test.js
```
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/db/ tests/ && git commit -m "feat: database layer with schema, queries, and tests"
```

---

## Task 3: Authentication

**Files:**
- Create: `server/middleware/auth.js`, `server/routes/auth.js`
- Create: `tests/server/auth.test.js`

- [ ] **Step 1: Write failing auth tests**

Create `tests/server/auth.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeDb } from '../../server/db/index.js';
import * as queries from '../../server/db/queries.js';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../../server/middleware/auth.js';

describe('Auth', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    initializeDb(db);
  });

  it('requireAuth rejects when no session', () => {
    const req = { session: {} };
    const res = { status: (code) => ({ json: (body) => ({ code, body }) }) };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAuth(req, res, next);
    expect(nextCalled).toBe(false);
  });

  it('requireAuth allows when session authenticated', () => {
    const req = { session: { authenticated: true } };
    const res = {};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    requireAuth(req, res, next);
    expect(nextCalled).toBe(true);
  });

  it('password hash comparison works', async () => {
    const hash = await bcrypt.hash('testpassword', 10);
    queries.setSetting(db, 'password_hash', hash);
    const storedHash = queries.getSetting(db, 'password_hash');
    const match = await bcrypt.compare('testpassword', storedHash);
    expect(match).toBe(true);
    const noMatch = await bcrypt.compare('wrongpassword', storedHash);
    expect(noMatch).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/server/auth.test.js
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement server/middleware/auth.js**

```js
export function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}
```

- [ ] **Step 4: Implement server/routes/auth.js**

```js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import * as queries from '../db/queries.js';

export function createAuthRouter(db) {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    const storedHash = queries.getSetting(db, 'password_hash');
    if (!storedHash) {
      return res.status(500).json({ error: 'App not configured — no password set' });
    }

    const match = await bcrypt.compare(password, storedHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    req.session.authenticated = true;
    res.json({ ok: true });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: 'Logout failed' });
      res.json({ ok: true });
    });
  });

  return router;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/server/auth.test.js
```
Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add server/middleware/ server/routes/auth.js tests/server/auth.test.js && git commit -m "feat: auth middleware and login/logout routes"
```

---

## Task 4: GHL API Client + Pipeline Definitions

**Files:**
- Create: `server/services/ghl-api.js`, `server/services/pipelines.js`, `server/services/phone-fallback.js`, `server/config/snapshots.json`
- Create: `tests/server/pipelines.test.js`, `tests/server/phone-fallback.test.js`

- [ ] **Step 1: Write failing pipeline tests**

Create `tests/server/pipelines.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { getStagesForIndustry } from '../../server/services/pipelines.js';

describe('Pipeline Stages', () => {
  it('returns construction stages', () => {
    const stages = getStagesForIndustry('construction');
    expect(stages[0].name).toBe('New Lead');
    expect(stages[stages.length - 1].name).toBe('Completed');
    expect(stages).toHaveLength(7);
  });

  it('returns plumbing stages', () => {
    const stages = getStagesForIndustry('plumbing');
    expect(stages[0].name).toBe('Emergency');
    expect(stages).toHaveLength(6);
  });

  it('returns same stages for electrical as plumbing', () => {
    const plumbing = getStagesForIndustry('plumbing');
    const electrical = getStagesForIndustry('electrical');
    expect(plumbing).toEqual(electrical);
  });

  it('returns cleaning stages', () => {
    const stages = getStagesForIndustry('cleaning');
    expect(stages).toHaveLength(5);
    expect(stages[2].name).toBe('Booked');
  });

  it('returns general stages', () => {
    const stages = getStagesForIndustry('general');
    expect(stages).toHaveLength(6);
  });

  it('throws on unknown industry', () => {
    expect(() => getStagesForIndustry('unknown')).toThrow();
  });

  it('stages have sequential positions', () => {
    const stages = getStagesForIndustry('construction');
    stages.forEach((s, i) => {
      expect(s.position).toBe(i);
    });
  });
});
```

- [ ] **Step 2: Write failing phone fallback tests**

Create `tests/server/phone-fallback.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { getNearbyAreaCodes } from '../../server/services/phone-fallback.js';

describe('Phone Fallback', () => {
  it('returns nearby area codes in order', () => {
    const codes = getNearbyAreaCodes('305');
    expect(codes).toEqual(['304', '306', '303']);
  });

  it('handles low area codes', () => {
    const codes = getNearbyAreaCodes('201');
    expect(codes).toEqual(['200', '202', '199']);
  });

  it('handles string input', () => {
    const codes = getNearbyAreaCodes('415');
    expect(codes[0]).toBe('414');
    expect(codes[1]).toBe('416');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/server/pipelines.test.js tests/server/phone-fallback.test.js
```
Expected: FAIL.

- [ ] **Step 4: Implement server/services/pipelines.js**

```js
const PIPELINE_STAGES = {
  construction: ['New Lead', 'Site Visit', 'Estimate Sent', 'Negotiation', 'Contract Signed', 'In Progress', 'Completed'],
  plumbing: ['Emergency', 'Scheduled', 'Dispatched', 'Completed', 'Invoice Sent', 'Paid'],
  electrical: ['Emergency', 'Scheduled', 'Dispatched', 'Completed', 'Invoice Sent', 'Paid'],
  cleaning: ['New Lead', 'Quote Sent', 'Booked', 'Recurring', 'Cancelled'],
  general: ['New Lead', 'Contacted', 'Estimate Sent', 'Follow Up', 'Won', 'Lost'],
};

export function getStagesForIndustry(industry) {
  const names = PIPELINE_STAGES[industry];
  if (!names) throw new Error(`Unknown industry: ${industry}`);
  return names.map((name, i) => ({ name, position: i }));
}
```

- [ ] **Step 5: Implement server/services/phone-fallback.js**

```js
export function getNearbyAreaCodes(areaCode) {
  const code = parseInt(areaCode, 10);
  return [
    String(code - 1),
    String(code + 1),
    String(code - 2),
  ];
}
```

- [ ] **Step 6: Implement server/services/ghl-api.js**

```js
const BASE_URL = 'https://services.leadconnectorhq.com';

export class GhlApi {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async request(method, path, body = null, version = '2021-07-28') {
    const url = `${BASE_URL}${path}`;
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Version': version,
      'Content-Type': 'application/json',
    };

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(`GHL API error: ${response.status} ${data.message || JSON.stringify(data)}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async createLocation(locationData) {
    return this.request('POST', '/locations/', locationData);
  }

  async buyPhoneNumber(locationId, areaCode) {
    return this.request('POST', '/phone-numbers/buy', {
      locationId,
      areaCode,
      capabilities: ['sms', 'voice', 'mms'],
    });
  }

  async setCustomValues(locationId, customValues) {
    return this.request('POST', `/locations/${locationId}/customValues`, { customValues });
  }

  async createPipeline(locationId, name, stages) {
    return this.request('POST', '/opportunities/pipelines', { locationId, name, stages });
  }

  async createUser(locationId, firstName, lastName, email) {
    return this.request('POST', '/users/', {
      locationIds: [locationId],
      firstName,
      lastName,
      email,
      role: 'admin',
      permissions: {},
    });
  }

  async createContact(locationId, firstName, lastName, email, phone) {
    return this.request('POST', '/contacts/', { locationId, firstName, lastName, email, phone });
  }

  async sendMessage(type, locationId, contactId, message, subject = null) {
    const body = { type, locationId, contactId, message };
    if (subject) body.subject = subject;
    return this.request('POST', '/conversations/messages', body);
  }
}
```

- [ ] **Step 7: Create server/config/snapshots.json**

```json
{
  "construction": { "id": "REPLACE_ME", "type": "own" },
  "plumbing": { "id": "REPLACE_ME", "type": "own" },
  "electrical": { "id": "REPLACE_ME", "type": "own" },
  "cleaning": { "id": "REPLACE_ME", "type": "own" },
  "general": { "id": "REPLACE_ME", "type": "own" }
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx vitest run tests/server/pipelines.test.js tests/server/phone-fallback.test.js
```
Expected: All PASS.

- [ ] **Step 9: Commit**

```bash
git add server/services/ server/config/ tests/server/pipelines.test.js tests/server/phone-fallback.test.js && git commit -m "feat: GHL API client, pipeline stages, phone fallback"
```

---

## Task 5: Build Runner (6-Step Orchestrator)

**Files:**
- Create: `server/services/build-runner.js`
- Create: `tests/server/build-runner.test.js`

- [ ] **Step 1: Write failing build runner tests**

Create `tests/server/build-runner.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeDb } from '../../server/db/index.js';
import * as queries from '../../server/db/queries.js';
import { BuildRunner } from '../../server/services/build-runner.js';

function createMockGhl() {
  return {
    createLocation: vi.fn().mockResolvedValue({ location: { id: 'loc-123' } }),
    buyPhoneNumber: vi.fn().mockResolvedValue({ phoneNumber: { id: 'ph-1', number: '+13051234567' } }),
    setCustomValues: vi.fn().mockResolvedValue({ success: true }),
    createPipeline: vi.fn().mockResolvedValue({ pipeline: { id: 'pipe-1' } }),
    createUser: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
    createContact: vi.fn().mockResolvedValue({ contact: { id: 'contact-1' } }),
    sendMessage: vi.fn().mockResolvedValue({ messageId: 'msg-1' }),
  };
}

describe('BuildRunner', () => {
  let db, ghl, runner;

  beforeEach(() => {
    db = createTestDb();
    initializeDb(db);
    ghl = createMockGhl();
    runner = new BuildRunner(db, ghl);
  });

  function createTestBuild() {
    const build = {
      id: 'build-test-1',
      business_name: 'Test Biz',
      business_email: 'test@biz.com',
      business_phone: '5551234567',
      address: '123 Main',
      city: 'Miami',
      state: 'FL',
      zip: '33101',
      country: 'US',
      industry: 'general',
      timezone: 'America/New_York',
      owner_first_name: 'John',
      owner_last_name: 'Doe',
      area_code: '305',
      website_url: 'https://testbiz.com',
    };
    queries.insertBuild(db, build);
    queries.createBuildSteps(db, build.id);
    return build;
  }

  it('runs all 6 steps successfully', async () => {
    const build = createTestBuild();
    const events = [];
    await runner.run(build.id, (event) => events.push(event));

    const updatedBuild = queries.getBuildById(db, build.id);
    expect(updatedBuild.status).toBe('completed');
    expect(updatedBuild.location_id).toBe('loc-123');

    expect(ghl.createLocation).toHaveBeenCalledTimes(1);
    expect(ghl.buyPhoneNumber).toHaveBeenCalledWith('loc-123', '305');
    expect(ghl.createPipeline).toHaveBeenCalledTimes(1);
    expect(ghl.createUser).toHaveBeenCalledTimes(1);
    expect(ghl.createContact).toHaveBeenCalledTimes(1);
    expect(ghl.sendMessage).toHaveBeenCalledTimes(2); // email + SMS
  });

  it('marks build as failed when step fails after retries', async () => {
    const build = createTestBuild();
    ghl.buyPhoneNumber.mockRejectedValue(new Error('No numbers available'));

    const events = [];
    await runner.run(build.id, (event) => events.push(event));

    const updatedBuild = queries.getBuildById(db, build.id);
    expect(updatedBuild.status).toBe('failed');

    const steps = queries.getBuildSteps(db, build.id);
    expect(steps[0].status).toBe('completed');
    expect(steps[1].status).toBe('failed');
    expect(steps[1].retry_count).toBeGreaterThan(0);
  });

  it('emits SSE events for each step', async () => {
    const build = createTestBuild();
    const events = [];
    await runner.run(build.id, (event) => events.push(event));

    const runningEvents = events.filter(e => e.status === 'running');
    const completedEvents = events.filter(e => e.status === 'completed');
    expect(runningEvents.length).toBe(6);
    expect(completedEvents.length).toBe(6);
  });

  it('can retry from a failed step', async () => {
    const build = createTestBuild();
    // Fail step 2 first
    ghl.buyPhoneNumber.mockRejectedValueOnce(new Error('fail'));
    ghl.buyPhoneNumber.mockRejectedValueOnce(new Error('fail'));
    ghl.buyPhoneNumber.mockRejectedValueOnce(new Error('fail'));
    ghl.buyPhoneNumber.mockRejectedValueOnce(new Error('fail'));
    await runner.run(build.id, () => {});

    // Now fix and retry
    ghl.buyPhoneNumber.mockResolvedValue({ phoneNumber: { id: 'ph-1', number: '+13051234567' } });
    const events = [];
    await runner.retryFromStep(build.id, 2, (event) => events.push(event));

    const updatedBuild = queries.getBuildById(db, build.id);
    expect(updatedBuild.status).toBe('completed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/server/build-runner.test.js
```
Expected: FAIL.

- [ ] **Step 3: Implement server/services/build-runner.js**

```js
import * as queries from '../db/queries.js';
import { getStagesForIndustry } from './pipelines.js';
import { getNearbyAreaCodes } from './phone-fallback.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const snapshots = JSON.parse(readFileSync(join(__dirname, '../config/snapshots.json'), 'utf-8'));

const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class BuildRunner {
  constructor(db, ghl) {
    this.db = db;
    this.ghl = ghl;
  }

  async run(buildId, emit) {
    const build = queries.getBuildById(this.db, buildId);
    queries.updateBuildStatus(this.db, buildId, 'running');
    const startTime = Date.now();

    try {
      await this.executeStep(buildId, build, 1, emit);
      await this.executeStep(buildId, build, 2, emit);
      await this.executeStep(buildId, build, 3, emit);
      await this.executeStep(buildId, build, 4, emit);
      await this.executeStep(buildId, build, 5, emit);
      await this.executeStep(buildId, build, 6, emit);

      const totalMs = Date.now() - startTime;
      queries.updateBuildStatus(this.db, buildId, 'completed', totalMs);
      const updatedBuild = queries.getBuildById(this.db, buildId);
      emit({ type: 'build-complete', location_id: updatedBuild.location_id, total_duration_ms: totalMs });
    } catch (err) {
      const totalMs = Date.now() - startTime;
      queries.updateBuildStatus(this.db, buildId, 'failed', totalMs);
      emit({ type: 'build-failed', step: err.step, error: err.message, retry_count: err.retryCount || 0 });
    }
  }

  async retryFromStep(buildId, fromStep, emit) {
    const build = queries.getBuildById(this.db, buildId);
    queries.updateBuildStatus(this.db, buildId, 'running');
    const startTime = Date.now();

    try {
      for (let step = fromStep; step <= 6; step++) {
        // Reset step status before retrying
        queries.updateStepStatus(this.db, buildId, step, 'pending');
        await this.executeStep(buildId, build, step, emit);
      }

      const totalMs = Date.now() - startTime;
      queries.updateBuildStatus(this.db, buildId, 'completed', totalMs);
      const updatedBuild = queries.getBuildById(this.db, buildId);
      emit({ type: 'build-complete', location_id: updatedBuild.location_id, total_duration_ms: totalMs });
    } catch (err) {
      const totalMs = Date.now() - startTime;
      queries.updateBuildStatus(this.db, buildId, 'failed', totalMs);
      emit({ type: 'build-failed', step: err.step, error: err.message, retry_count: err.retryCount || 0 });
    }
  }

  getStateFromPriorSteps(buildId) {
    const steps = queries.getBuildSteps(this.db, buildId);
    const state = {};
    const build = queries.getBuildById(this.db, buildId);
    if (build.location_id) state.locationId = build.location_id;

    for (const step of steps) {
      if (step.status === 'completed' && step.api_response) {
        const resp = JSON.parse(step.api_response);
        if (step.step_number === 2 && resp.phoneNumber) {
          state.phoneNumber = resp.phoneNumber.number;
          state.phoneNumberId = resp.phoneNumber.id;
        }
        if (step.step_number === 4 && resp.pipeline) {
          state.pipelineId = resp.pipeline.id;
        }
        if (step.step_number === 5 && resp.user) {
          state.userId = resp.user.id;
        }
        if (step.step_number === 6 && resp.contact) {
          state.contactId = resp.contact.id;
        }
      }
    }
    return state;
  }

  async executeStep(buildId, build, stepNumber, emit) {
    emit({ type: 'step-update', step: stepNumber, status: 'running' });
    queries.updateStepStatus(this.db, buildId, stepNumber, 'running');
    const stepStart = Date.now();

    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          queries.incrementStepRetry(this.db, buildId, stepNumber);
          await sleep(BACKOFF_MS[attempt - 1] || 4000);
        }

        const result = await this.runStepLogic(buildId, build, stepNumber);
        const durationMs = Date.now() - stepStart;
        const apiResponse = JSON.stringify(result);

        queries.updateStepStatus(this.db, buildId, stepNumber, 'completed', durationMs, null, apiResponse);
        emit({ type: 'step-update', step: stepNumber, status: 'completed', duration_ms: durationMs });
        return result;
      } catch (err) {
        lastError = err;
      }
    }

    const durationMs = Date.now() - stepStart;
    const steps = queries.getBuildSteps(this.db, buildId);
    const retryCount = steps.find(s => s.step_number === stepNumber)?.retry_count || MAX_RETRIES;

    queries.updateStepStatus(this.db, buildId, stepNumber, 'failed', durationMs, lastError.message, null);
    emit({ type: 'step-update', step: stepNumber, status: 'failed', error: lastError.message });

    const error = new Error(lastError.message);
    error.step = stepNumber;
    error.retryCount = retryCount;
    throw error;
  }

  async runStepLogic(buildId, build, stepNumber) {
    const state = this.getStateFromPriorSteps(buildId);

    switch (stepNumber) {
      case 1: {
        const snapshot = snapshots[build.industry];
        let name = build.business_name;
        const result = await this.ghl.createLocation({
          name,
          phone: build.business_phone,
          email: build.business_email,
          address: build.address,
          city: build.city,
          state: build.state,
          postalCode: build.zip,
          country: build.country,
          timezone: build.timezone,
          snapshot: snapshot,
        }).catch(async (err) => {
          if (err.data?.message?.includes('duplicate') || err.data?.message?.includes('already exists')) {
            name = `${build.business_name}-${Date.now()}`;
            return this.ghl.createLocation({
              name,
              phone: build.business_phone,
              email: build.business_email,
              address: build.address,
              city: build.city,
              state: build.state,
              postalCode: build.zip,
              country: build.country,
              timezone: build.timezone,
              snapshot: snapshot,
            });
          }
          throw err;
        });

        queries.updateBuildLocationId(this.db, buildId, result.location.id);
        return result;
      }

      case 2: {
        const locationId = state.locationId;
        try {
          return await this.ghl.buyPhoneNumber(locationId, build.area_code);
        } catch (err) {
          const fallbackCodes = getNearbyAreaCodes(build.area_code);
          for (const code of fallbackCodes) {
            try {
              return await this.ghl.buyPhoneNumber(locationId, code);
            } catch (_) {
              continue;
            }
          }
          throw err;
        }
      }

      case 3: {
        const locationId = state.locationId;
        const phoneNumber = state.phoneNumber || '';
        const fullAddress = [build.address, build.city, build.state, build.zip, build.country].filter(Boolean).join(', ');
        return this.ghl.setCustomValues(locationId, [
          { fieldKey: 'contact.business_name', value: build.business_name },
          { fieldKey: 'contact.business_phone', value: build.business_phone },
          { fieldKey: 'contact.business_email', value: build.business_email },
          { fieldKey: 'contact.business_address', value: fullAddress },
          { fieldKey: 'contact.website_url', value: build.website_url || '' },
          { fieldKey: 'contact.provisioned_phone', value: phoneNumber },
        ]);
      }

      case 4: {
        const locationId = state.locationId;
        const stages = getStagesForIndustry(build.industry);
        return this.ghl.createPipeline(locationId, 'Sales Pipeline', stages);
      }

      case 5: {
        const locationId = state.locationId;
        return this.ghl.createUser(locationId, build.owner_first_name, build.owner_last_name, build.business_email);
      }

      case 6: {
        const locationId = state.locationId;
        const contactResult = await this.ghl.createContact(
          locationId, build.owner_first_name, build.owner_last_name,
          build.business_email, build.business_phone
        );

        const contactId = contactResult.contact.id;
        const emailBody = `Hi ${build.owner_first_name},\n\nWelcome! Your ${build.business_name} account is now set up and ready to go.\n\nYou should receive a separate email with your login invitation — please check your inbox (and spam folder).\n\nHere are your account details for reference:\n- Business: ${build.business_name}\n- Email: ${build.business_email}\n- Phone: ${build.business_phone}\n\nIf you need any help, reach out to us at VO360.\n\nBest,\nThe VO360 Team`;

        await this.ghl.sendMessage(
          'Email', locationId, contactId, emailBody,
          `Welcome to ${build.business_name} — Your Account is Ready`
        );

        const smsBody = `Hi ${build.owner_first_name}! Your ${build.business_name} account is ready. Check your email for the login invitation. — VO360`;
        await this.ghl.sendMessage('SMS', locationId, contactId, smsBody);

        return { contact: contactResult.contact, emailSent: true, smsSent: true };
      }

      default:
        throw new Error(`Unknown step: ${stepNumber}`);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/server/build-runner.test.js
```
Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/build-runner.js tests/server/build-runner.test.js && git commit -m "feat: build runner with 6-step orchestration, retry, and state recovery"
```

---

## Task 6: Express Server + API Routes

**Files:**
- Create: `server/index.js`, `server/routes/builds.js`, `server/routes/stats.js`

- [ ] **Step 1: Implement server/routes/builds.js**

```js
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as queries from '../db/queries.js';
import { BuildRunner } from '../services/build-runner.js';

export function createBuildsRouter(db, ghl) {
  const router = Router();
  const activeSseClients = new Map(); // buildId → Set of response objects

  function emitToClients(buildId, event) {
    const clients = activeSseClients.get(buildId);
    if (!clients) return;
    for (const res of clients) {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    }
  }

  // Validation
  function validateBuildInput(body) {
    const errors = {};
    const required = ['business_name', 'business_email', 'business_phone', 'industry', 'timezone', 'owner_first_name', 'owner_last_name', 'area_code'];
    for (const field of required) {
      if (!body[field] || !String(body[field]).trim()) {
        errors[field] = 'Required';
      }
    }
    if (body.business_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.business_email)) {
      errors.business_email = 'Invalid email format';
    }
    if (body.business_phone && String(body.business_phone).replace(/\D/g, '').length < 10) {
      errors.business_phone = 'Must be at least 10 digits';
    }
    if (body.area_code && !/^\d{3}$/.test(body.area_code)) {
      errors.area_code = 'Must be exactly 3 digits';
    }
    if (body.website_url && body.website_url.trim()) {
      try { new URL(body.website_url); } catch { errors.website_url = 'Invalid URL'; }
    }
    const validIndustries = ['construction', 'plumbing', 'electrical', 'cleaning', 'general'];
    if (body.industry && !validIndustries.includes(body.industry)) {
      errors.industry = 'Invalid industry';
    }
    return Object.keys(errors).length > 0 ? errors : null;
  }

  router.post('/', (req, res) => {
    const errors = validateBuildInput(req.body);
    if (errors) return res.status(400).json({ errors });

    const id = uuidv4();
    const build = {
      id,
      business_name: req.body.business_name.trim(),
      business_email: req.body.business_email.trim(),
      business_phone: String(req.body.business_phone).replace(/\D/g, ''),
      address: (req.body.address || '').trim(),
      city: (req.body.city || '').trim(),
      state: (req.body.state || '').trim(),
      zip: (req.body.zip || '').trim(),
      country: (req.body.country || 'US').trim(),
      industry: req.body.industry,
      timezone: req.body.timezone,
      owner_first_name: req.body.owner_first_name.trim(),
      owner_last_name: req.body.owner_last_name.trim(),
      area_code: req.body.area_code.trim(),
      website_url: req.body.website_url?.trim() || null,
    };

    queries.insertBuild(db, build);
    queries.createBuildSteps(db, id);

    const runner = new BuildRunner(db, ghl);
    runner.run(id, (event) => emitToClients(id, event));

    res.status(201).json({ id });
  });

  router.get('/:id/stream', (req, res) => {
    const { id } = req.params;
    const build = queries.getBuildById(db, id);
    if (!build) return res.status(404).json({ error: 'Build not found' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send current state first
    const steps = queries.getBuildSteps(db, id);
    for (const step of steps) {
      if (step.status !== 'pending') {
        res.write(`event: step-update\ndata: ${JSON.stringify({
          type: 'step-update', step: step.step_number, status: step.status,
          duration_ms: step.duration_ms, error: step.error_message,
        })}\n\n`);
      }
    }
    if (build.status === 'completed') {
      res.write(`event: build-complete\ndata: ${JSON.stringify({
        type: 'build-complete', location_id: build.location_id, total_duration_ms: build.total_duration_ms,
      })}\n\n`);
    }

    if (!activeSseClients.has(id)) activeSseClients.set(id, new Set());
    activeSseClients.get(id).add(res);

    req.on('close', () => {
      activeSseClients.get(id)?.delete(res);
    });
  });

  router.get('/:id', (req, res) => {
    const build = queries.getBuildById(db, req.params.id);
    if (!build) return res.status(404).json({ error: 'Build not found' });
    const steps = queries.getBuildSteps(db, req.params.id);
    res.json({ build, steps });
  });

  router.get('/', (req, res) => {
    const { page = 1, search = '', industry = '', status = '' } = req.query;
    const result = queries.listBuilds(db, {
      page: parseInt(page, 10),
      perPage: 20,
      search, industry, status,
    });
    res.json(result);
  });

  router.post('/:id/retry/:step', (req, res) => {
    const { id, step } = req.params;
    const build = queries.getBuildById(db, id);
    if (!build) return res.status(404).json({ error: 'Build not found' });
    if (build.status !== 'failed') return res.status(400).json({ error: 'Build is not in failed state' });

    const stepNumber = parseInt(step, 10);
    if (stepNumber < 1 || stepNumber > 6) return res.status(400).json({ error: 'Invalid step number' });

    const runner = new BuildRunner(db, ghl);
    runner.retryFromStep(id, stepNumber, (event) => emitToClients(id, event));

    res.json({ ok: true, message: `Retrying from step ${stepNumber}` });
  });

  return router;
}
```

- [ ] **Step 2: Implement server/routes/stats.js**

```js
import { Router } from 'express';
import * as queries from '../db/queries.js';

export function createStatsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const stats = queries.getStats(db);
    res.json(stats);
  });

  return router;
}
```

- [ ] **Step 3: Implement server/index.js**

```js
import express from 'express';
import session from 'express-session';
import BetterSqlite3SessionStore from 'better-sqlite3-session-store';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { initializeDb } from './db/index.js';
import * as queries from './db/queries.js';
import { requireAuth } from './middleware/auth.js';
import { createAuthRouter } from './routes/auth.js';
import { createBuildsRouter } from './routes/builds.js';
import { createStatsRouter } from './routes/stats.js';
import { GhlApi } from './services/ghl-api.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3003;

// Database
const dbPath = join(__dirname, '..', 'data.db');
const db = new Database(dbPath);
initializeDb(db);

// First-boot: hash password and store
const existingHash = queries.getSetting(db, 'password_hash');
if (!existingHash && process.env.APP_PASSWORD) {
  const hash = bcrypt.hashSync(process.env.APP_PASSWORD, 10);
  queries.setSetting(db, 'password_hash', hash);
  console.log('Password hashed and stored in database.');
}

// Session secret
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = queries.getSetting(db, 'session_secret');
  if (!sessionSecret) {
    sessionSecret = randomBytes(32).toString('hex');
    queries.setSetting(db, 'session_secret', sessionSecret);
  }
}

// GHL API client
const ghl = new GhlApi(process.env.GHL_AGENCY_API_KEY);

// Middleware
app.use(express.json());

const SqliteStore = BetterSqlite3SessionStore(session);
app.use(session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 900000 } }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24h
}));

// Serve built frontend in production
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Routes
app.use('/api/auth', createAuthRouter(db));
app.use('/api/builds', requireAuth, createBuildsRouter(db, ghl));
app.use('/api/stats', requireAuth, createStatsRouter(db));

// SPA fallback (production)
if (existsSync(distPath)) {
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`VO360 Sub-Account Builder running on http://localhost:${PORT}`);
});

export default app;
```

- [ ] **Step 4: Install uuid**

```bash
npm install uuid
```

- [ ] **Step 5: Verify server starts**

Create a `.env` file:
```bash
echo 'GHL_AGENCY_API_KEY=test\nAPP_PASSWORD=test123\nPORT=3003' > /Users/urielholzman/ghl-sub-account-builder/.env
```

```bash
cd /Users/urielholzman/ghl-sub-account-builder && timeout 5 node server/index.js || true
```
Expected: "VO360 Sub-Account Builder running on http://localhost:3003"

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/routes/ && git commit -m "feat: Express server with auth, builds, stats, and SSE routes"
```

---

## Task 7: Frontend — Login Page + Auth Hook

**Files:**
- Create: `src/hooks/useAuth.js`, `src/pages/Login.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create src/hooks/useAuth.js**

```jsx
import { useState, useEffect, createContext, useContext } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(null); // null = loading

  useEffect(() => {
    fetch('/api/auth/check').then(r => {
      setAuthenticated(r.ok);
    }).catch(() => setAuthenticated(false));
  }, []);

  async function login(password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthenticated(true);
      return { ok: true };
    }
    const data = await res.json();
    return { ok: false, error: data.error };
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ authenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

Note: We need to add a `/api/auth/check` endpoint. Add to `server/routes/auth.js`:
```js
router.get('/check', (req, res) => {
  if (req.session?.authenticated) return res.json({ ok: true });
  res.status(401).json({ ok: false });
});
```

- [ ] **Step 2: Create src/pages/Login.jsx**

```jsx
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(password);
    setLoading(false);
    if (!result.ok) setError(result.error || 'Login failed');
  }

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-magenta">VO360</h1>
          <p className="text-sm text-gray-500 mt-1">Sub-Account Builder</p>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-magenta focus:ring-1 focus:ring-magenta"
            placeholder="Enter team password"
            autoFocus
          />
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full mt-4 bg-gradient-to-r from-magenta to-purple-700 text-white rounded-lg py-3 font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update src/App.jsx with routing + auth**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import NewBuild from './pages/NewBuild';
import BuildHistory from './pages/BuildHistory';
import Sidebar from './components/Sidebar';

function ProtectedLayout() {
  const { authenticated } = useAuth();
  if (authenticated === null) return <div className="min-h-screen bg-page-bg flex items-center justify-center text-gray-400">Loading...</div>;
  if (!authenticated) return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-page-bg flex">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<NewBuild />} />
          <Route path="/history" element={<BuildHistory />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 4: Create src/components/Sidebar.jsx**

```jsx
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Sidebar() {
  const { logout } = useAuth();

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-3 text-sm transition ${
      isActive
        ? 'bg-magenta/20 border-l-[3px] border-magenta text-white'
        : 'text-white/50 hover:text-white/80 border-l-[3px] border-transparent'
    }`;

  return (
    <div className="w-52 bg-sidebar flex flex-col flex-shrink-0">
      <div className="px-4 py-5 border-b border-white/10">
        <div className="text-magenta font-bold text-lg">VO360</div>
        <div className="text-white/50 text-xs">Sub-Account Builder</div>
      </div>
      <nav className="mt-2 flex-1">
        <NavLink to="/" end className={linkClass}>🏗️ New Build</NavLink>
        <NavLink to="/history" className={linkClass}>📋 Build History</NavLink>
      </nav>
      <button onClick={logout} className="px-4 py-3 text-sm text-white/40 hover:text-white/60 text-left border-t border-white/10">
        Logout
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Create placeholder pages**

Create `src/pages/NewBuild.jsx`:
```jsx
export default function NewBuild() {
  return <div className="p-6"><h1 className="text-xl font-bold text-navy">New Build</h1><p className="text-gray-500 mt-1">Coming next...</p></div>;
}
```

Create `src/pages/BuildHistory.jsx`:
```jsx
export default function BuildHistory() {
  return <div className="p-6"><h1 className="text-xl font-bold text-navy">Build History</h1><p className="text-gray-500 mt-1">Coming next...</p></div>;
}
```

- [ ] **Step 6: Add auth check endpoint to server**

Add to `server/routes/auth.js` before the return:
```js
router.get('/check', (req, res) => {
  if (req.session?.authenticated) return res.json({ ok: true });
  res.status(401).json({ ok: false });
});
```

- [ ] **Step 7: Verify login page renders**

```bash
cd /Users/urielholzman/ghl-sub-account-builder && npx vite build && node server/index.js &
sleep 2
curl -s http://localhost:3003 | head -5
kill %1
```

- [ ] **Step 8: Commit**

```bash
git add src/ server/routes/auth.js && git commit -m "feat: login page, auth hook, sidebar, and protected routing"
```

---

## Task 8: Frontend — Build Form + Validation

**Files:**
- Create: `src/components/BuildForm.jsx`
- Modify: `src/pages/NewBuild.jsx`

- [ ] **Step 1: Create src/components/BuildForm.jsx**

Full form component with all fields (Business Info, Configuration, Account Owner), inline validation, and submit handler. Fields:
- business_name, business_phone, business_email (required)
- address, city, state, zip, country
- industry dropdown, timezone dropdown, area_code (required)
- website_url (optional)
- owner_first_name, owner_last_name (required)

Validation on blur and on submit:
- Email regex, phone 10+ digits, area_code 3 digits, URL format if provided

Submit: `POST /api/builds` with form data as JSON. Returns `{ id }` which gets passed to the ProgressTracker.

Use Tailwind classes matching the VO360 brand: white card with rounded corners, navy section headers, magenta gradient submit button, grey input backgrounds.

- [ ] **Step 2: Update src/pages/NewBuild.jsx to include form + progress tracker**

Layout: flex row with form on left (flex-1), progress tracker on right (w-80).

- [ ] **Step 3: Verify form renders and validates**

Boot the app and manually test the form renders with all fields.

- [ ] **Step 4: Commit**

```bash
git add src/components/BuildForm.jsx src/pages/NewBuild.jsx && git commit -m "feat: build form with validation and VO360 styling"
```

---

## Task 9: Frontend — Progress Tracker + SSE Hook

**Files:**
- Create: `src/hooks/useSSE.js`, `src/components/ProgressTracker.jsx`
- Modify: `src/pages/NewBuild.jsx`

- [ ] **Step 1: Create src/hooks/useSSE.js**

```jsx
import { useState, useEffect, useRef } from 'react';

const STEP_NAMES = [
  'Create Sub-Account',
  'Provision Phone',
  'Set Custom Values',
  'Create Pipeline',
  'Create Admin User',
  'Send Welcome Comms',
];

export function useSSE(buildId) {
  const [steps, setSteps] = useState(
    STEP_NAMES.map((name, i) => ({ step: i + 1, name, status: 'pending', duration_ms: null, error: null }))
  );
  const [buildStatus, setBuildStatus] = useState(null); // null | 'complete' | 'failed'
  const [buildResult, setBuildResult] = useState(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!buildId) return;

    // Reset state
    setSteps(STEP_NAMES.map((name, i) => ({ step: i + 1, name, status: 'pending', duration_ms: null, error: null })));
    setBuildStatus(null);
    setBuildResult(null);

    const es = new EventSource(`/api/builds/${buildId}/stream`);
    eventSourceRef.current = es;

    es.addEventListener('step-update', (e) => {
      const data = JSON.parse(e.data);
      setSteps(prev => prev.map(s =>
        s.step === data.step ? { ...s, status: data.status, duration_ms: data.duration_ms || s.duration_ms, error: data.error || s.error } : s
      ));
    });

    es.addEventListener('build-complete', (e) => {
      const data = JSON.parse(e.data);
      setBuildStatus('complete');
      setBuildResult(data);
      es.close();
    });

    es.addEventListener('build-failed', (e) => {
      const data = JSON.parse(e.data);
      setBuildStatus('failed');
      setBuildResult(data);
      es.close();
    });

    es.onerror = () => {
      // EventSource auto-reconnects; if build is done, it'll get current state on reconnect
    };

    return () => es.close();
  }, [buildId]);

  return { steps, buildStatus, buildResult };
}
```

- [ ] **Step 2: Create src/components/ProgressTracker.jsx**

Vertical stepper component showing 6 steps with:
- Grey circle + number for pending
- Magenta pulsing spinner for running
- Green checkmark for completed (with duration)
- Red X for failed (with error message + retry button)
- Success banner when all complete
- Retry button calls `POST /api/builds/:id/retry/:step`

- [ ] **Step 3: Wire up NewBuild page with form → tracker flow**

Update `NewBuild.jsx`:
- State: `activeBuildId` (null until form submits)
- On form submit success → set activeBuildId → show progress tracker
- Progress tracker uses `useSSE(activeBuildId)`

- [ ] **Step 4: Test the full flow manually**

Boot both servers, fill form, submit, watch progress tracker update.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSSE.js src/components/ProgressTracker.jsx src/pages/NewBuild.jsx && git commit -m "feat: progress tracker with SSE real-time updates and retry"
```

---

## Task 10: Frontend — Build History Page

**Files:**
- Create: `src/components/StatsCards.jsx`, `src/components/BuildTable.jsx`, `src/components/BuildDetailRow.jsx`
- Modify: `src/pages/BuildHistory.jsx`

- [ ] **Step 1: Create src/components/StatsCards.jsx**

4 stat cards in a grid: Total Builds (navy), Successful (green), Failed (red), Avg Build Time (magenta). Fetches from `GET /api/stats`.

- [ ] **Step 2: Create src/components/BuildTable.jsx**

Table with columns: Business (name + email), Owner, Industry badge, Status badge, Date, Build Time. Fetches from `GET /api/builds?page=X&search=X&industry=X&status=X`. Includes search input and filter dropdowns. Pagination at bottom.

- [ ] **Step 3: Create src/components/BuildDetailRow.jsx**

Expandable row that fetches `GET /api/builds/:id` and shows the 6 steps with timestamps, durations, error messages, and API responses for debugging.

- [ ] **Step 4: Wire up BuildHistory page**

```jsx
import StatsCards from '../components/StatsCards';
import BuildTable from '../components/BuildTable';

export default function BuildHistory() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-navy mb-1">Build History</h1>
      <p className="text-gray-500 text-sm mb-6">All sub-account builds</p>
      <StatsCards />
      <BuildTable />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/StatsCards.jsx src/components/BuildTable.jsx src/components/BuildDetailRow.jsx src/pages/BuildHistory.jsx && git commit -m "feat: build history page with stats, search, filters, and expandable rows"
```

---

## Task 11: Integration Testing + Polish

**Files:**
- Modify: various files for fixes found during testing

- [ ] **Step 1: Build frontend for production**

```bash
cd /Users/urielholzman/ghl-sub-account-builder && npm run build
```
Expected: Vite builds to `dist/` with no errors.

- [ ] **Step 2: Boot production server and test login**

```bash
node server/index.js &
sleep 2
# Test login
curl -s -c cookies.txt -X POST http://localhost:3003/api/auth/login -H 'Content-Type: application/json' -d '{"password":"test123"}'
```
Expected: `{"ok":true}`

- [ ] **Step 3: Test build creation (will fail on GHL API since no real key, but validates flow)**

```bash
curl -s -b cookies.txt -X POST http://localhost:3003/api/builds -H 'Content-Type: application/json' -d '{
  "business_name":"Test Co",
  "business_email":"test@test.com",
  "business_phone":"5551234567",
  "industry":"general",
  "timezone":"America/New_York",
  "owner_first_name":"John",
  "owner_last_name":"Doe",
  "area_code":"305"
}'
```
Expected: `{"id":"<uuid>"}` — build starts (will fail at GHL API step since no real key).

- [ ] **Step 4: Test history endpoint**

```bash
curl -s -b cookies.txt http://localhost:3003/api/builds
curl -s -b cookies.txt http://localhost:3003/api/stats
```
Expected: JSON responses with build data and stats.

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```
Expected: All tests pass.

- [ ] **Step 6: Fix any issues found**

Address any bugs or styling issues discovered during testing.

- [ ] **Step 7: Final commit**

```bash
git add -A && git commit -m "feat: integration testing and polish"
```

- [ ] **Step 8: Kill test server**

```bash
kill %1 2>/dev/null; rm -f cookies.txt
```

---

## Summary

| Task | What it builds | Depends on |
|------|---------------|------------|
| 1 | Project scaffolding | — |
| 2 | Database layer | 1 |
| 3 | Authentication | 2 |
| 4 | GHL API client + pipelines | 1 |
| 5 | Build runner (orchestrator) | 2, 4 |
| 6 | Express server + API routes | 2, 3, 5 |
| 7 | Frontend login + layout | 1, 6 |
| 8 | Build form + validation | 7 |
| 9 | Progress tracker + SSE | 7, 8 |
| 10 | Build history page | 7 |
| 11 | Integration testing | All |

**Parallel opportunities:** Tasks 2-3 and Task 4 can run in parallel. Tasks 8, 9, and 10 can run in parallel after Task 7.

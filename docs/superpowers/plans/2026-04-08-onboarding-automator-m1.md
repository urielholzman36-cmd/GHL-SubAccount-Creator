# Onboarding Automator M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing GHL Sub-Account Builder into the foundation of the Client Onboarding Hub by adding a phased execution model, durable pause/resume, and a stub Phase 2 step used to verify the mechanism end-to-end.

**Architecture:** Minimal-wrap refactor. Existing 6 GHL step functions in `server/services/build-runner.js` are untouched. A new `phases.config.js` declares which step numbers belong to which phase. The runner loop emits phase-level SSE events around batches of steps and supports a "pause" signal from any step; pause state is persisted to SQLite so builds survive server restarts.

**Tech Stack:** Node.js + Express, better-sqlite3, Vitest, React 19 + Vite + Tailwind, SSE (EventSource).

**Spec:** `docs/superpowers/specs/2026-04-08-onboarding-automator-m1-design.md`

---

## File Structure

### New files
- `server/services/phases.config.js` — phase → step number mapping, exported as `PHASES`.
- `tests/server/phases.config.test.js` — unit tests for the config shape and helpers.
- `tests/server/pause-resume.test.js` — unit tests for pause/resume mechanism.

### Modified files
- `server/db/index.js` — additive migrations: new `builds` columns (`paused_at_step`, `pause_context`), new `build_steps` column (`phase`).
- `server/db/queries.js` — new query helpers for pause/resume and phase-aware step insertion; `STEP_NAMES` extended with the stub Phase 2 step.
- `server/services/build-runner.js` — runner loop iterates phases; supports PauseSignal; `_executeSteps` accepts dynamic step count; adds stub step 7 implementation.
- `server/routes/builds.js` — new `POST /:id/resume` endpoint; rename `stepNumber` → `step` in SSE replay; broadcast new `phase-start` / `phase-complete` / `build-paused` events.
- `tests/server/build-runner.test.js` — update existing tests to cover phase events and stub step.
- `src/hooks/useSSE.js` — dynamic step list (derived from build row), handle new events, expose `paused` and `pauseContext`.
- `src/components/ProgressTracker.jsx` — group steps under phase headers, render paused banner with Continue button.
- `src/components/BuildTable.jsx` — render "Paused" badge.
- `src/App.jsx` (or wherever the header text lives) — rename header to "Client Onboarding Hub".

---

## Task 1: Add phase configuration

**Files:**
- Create: `server/services/phases.config.js`
- Create: `tests/server/phases.config.test.js`

- [ ] **Step 1: Write the failing test**

`tests/server/phases.config.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { PHASES, getPhaseForStep, getAllSteps, getStepName } from '../../server/services/phases.config.js';

describe('phases config', () => {
  it('defines phase 1 with steps 1-6', () => {
    const p1 = PHASES.find((p) => p.id === 1);
    expect(p1).toBeDefined();
    expect(p1.name).toBe('GHL Sub-Account Setup');
    expect(p1.steps.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('defines phase 2 with stub step 7', () => {
    const p2 = PHASES.find((p) => p.id === 2);
    expect(p2).toBeDefined();
    expect(p2.name).toBe('Website Build');
    expect(p2.steps).toHaveLength(1);
    expect(p2.steps[0].number).toBe(7);
    expect(p2.steps[0].pausesForManualInput).toBe(true);
  });

  it('getPhaseForStep returns the right phase id', () => {
    expect(getPhaseForStep(1)).toBe(1);
    expect(getPhaseForStep(6)).toBe(1);
    expect(getPhaseForStep(7)).toBe(2);
  });

  it('getAllSteps returns all steps in order', () => {
    const all = getAllSteps();
    expect(all.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('getStepName returns the step name', () => {
    expect(getStepName(1)).toBe('Create Sub-Account');
    expect(getStepName(7)).toBe('Website Creation (Manual)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/phases.config.test.js`
Expected: FAIL — cannot find module `phases.config.js`.

- [ ] **Step 3: Implement the config**

`server/services/phases.config.js`:
```js
export const PHASES = [
  {
    id: 1,
    name: 'GHL Sub-Account Setup',
    steps: [
      { number: 1, name: 'Create Sub-Account' },
      { number: 2, name: 'Provision Phone' },
      { number: 3, name: 'Set Custom Values' },
      { number: 4, name: 'Create Pipeline' },
      { number: 5, name: 'Create Admin User' },
      { number: 6, name: 'Send Welcome Comms' },
    ],
  },
  {
    id: 2,
    name: 'Website Build',
    steps: [
      { number: 7, name: 'Website Creation (Manual)', pausesForManualInput: true },
    ],
  },
];

export function getAllSteps() {
  return PHASES.flatMap((p) => p.steps);
}

export function getPhaseForStep(stepNumber) {
  for (const p of PHASES) {
    if (p.steps.some((s) => s.number === stepNumber)) return p.id;
  }
  return null;
}

export function getStepName(stepNumber) {
  const step = getAllSteps().find((s) => s.number === stepNumber);
  return step ? step.name : null;
}

export function getTotalStepCount() {
  return getAllSteps().length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/phases.config.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/services/phases.config.js tests/server/phases.config.test.js
git commit -m "feat(m1): add phase configuration with phase 1 + phase 2 stub"
```

---

## Task 2: Extend database schema

**Files:**
- Modify: `server/db/index.js`
- Modify: `server/db/queries.js`
- Modify: `tests/server/db.test.js` (add new assertions)

- [ ] **Step 1: Write the failing test**

Add to `tests/server/db.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeDb } from '../../server/db/index.js';
import * as queries from '../../server/db/queries.js';

describe('M1 schema extensions', () => {
  it('builds table has paused_at_step and pause_context columns', () => {
    const db = createTestDb();
    initializeDb(db);
    const cols = db.prepare("PRAGMA table_info(builds)").all().map((c) => c.name);
    expect(cols).toContain('paused_at_step');
    expect(cols).toContain('pause_context');
  });

  it('build_steps table has phase column defaulting to 1', () => {
    const db = createTestDb();
    initializeDb(db);
    const cols = db.prepare("PRAGMA table_info(build_steps)").all();
    const phaseCol = cols.find((c) => c.name === 'phase');
    expect(phaseCol).toBeDefined();
    expect(phaseCol.dflt_value).toBe('1');
  });

  it('createBuildSteps inserts all 7 steps with correct phase numbers', () => {
    const db = createTestDb();
    initializeDb(db);
    queries.insertBuild(db, {
      id: 'b1', business_name: 'X', business_email: 'x@y.com', business_phone: '5551234567',
      address: '', city: '', state: '', zip: '', country: 'US',
      industry: 'general', timezone: 'America/New_York',
      owner_first_name: 'A', owner_last_name: 'B', area_code: '305', website_url: null,
    });
    queries.createBuildSteps(db, 'b1');
    const steps = queries.getBuildSteps(db, 'b1');
    expect(steps).toHaveLength(7);
    expect(steps.slice(0, 6).every((s) => s.phase === 1)).toBe(true);
    expect(steps[6].phase).toBe(2);
    expect(steps[6].step_name).toBe('Website Creation (Manual)');
  });

  it('setPauseState / clearPauseState persist on the builds row', () => {
    const db = createTestDb();
    initializeDb(db);
    queries.insertBuild(db, {
      id: 'b2', business_name: 'Y', business_email: 'y@z.com', business_phone: '5551234567',
      address: '', city: '', state: '', zip: '', country: 'US',
      industry: 'general', timezone: 'America/New_York',
      owner_first_name: 'A', owner_last_name: 'B', area_code: '305', website_url: null,
    });
    queries.setPauseState(db, 'b2', 7, { reason: 'stub_pause' });
    let row = queries.getBuildById(db, 'b2');
    expect(row.status).toBe('paused');
    expect(row.paused_at_step).toBe(7);
    expect(JSON.parse(row.pause_context)).toEqual({ reason: 'stub_pause' });

    queries.clearPauseState(db, 'b2');
    row = queries.getBuildById(db, 'b2');
    expect(row.paused_at_step).toBeNull();
    expect(row.pause_context).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/db.test.js`
Expected: FAIL — columns don't exist, `setPauseState` undefined, step count mismatch.

- [ ] **Step 3: Update schema with additive migration**

Replace the body of `initializeDb` in `server/db/index.js`:
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

  // M1 additive migrations (safe to run repeatedly)
  const buildCols = db.prepare("PRAGMA table_info(builds)").all().map((c) => c.name);
  if (!buildCols.includes('paused_at_step')) {
    db.exec('ALTER TABLE builds ADD COLUMN paused_at_step INTEGER');
  }
  if (!buildCols.includes('pause_context')) {
    db.exec('ALTER TABLE builds ADD COLUMN pause_context TEXT');
  }

  const stepCols = db.prepare("PRAGMA table_info(build_steps)").all().map((c) => c.name);
  if (!stepCols.includes('phase')) {
    db.exec('ALTER TABLE build_steps ADD COLUMN phase INTEGER NOT NULL DEFAULT 1');
  }
}
```

- [ ] **Step 4: Update queries.js**

In `server/db/queries.js`:

Replace the `STEP_NAMES` constant and `createBuildSteps` function:
```js
import { getAllSteps } from '../services/phases.config.js';

export function createBuildSteps(db, buildId) {
  const stmt = db.prepare(
    `INSERT INTO build_steps (build_id, step_number, step_name, phase) VALUES (?, ?, ?, ?)`
  );
  const steps = getAllSteps();
  const insertMany = db.transaction(() => {
    for (const s of steps) {
      const phase = s.number <= 6 ? 1 : 2;
      stmt.run(buildId, s.number, s.name, phase);
    }
  });
  insertMany();
}
```

Add new pause/resume query helpers at the bottom of the file:
```js
export function setPauseState(db, buildId, stepNumber, context) {
  db.prepare(
    `UPDATE builds SET status = 'paused', paused_at_step = ?, pause_context = ? WHERE id = ?`
  ).run(stepNumber, JSON.stringify(context), buildId);
}

export function clearPauseState(db, buildId) {
  db.prepare(
    `UPDATE builds SET paused_at_step = NULL, pause_context = NULL WHERE id = ?`
  ).run(buildId);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/server/db.test.js`
Expected: PASS — new assertions green, existing db tests still green.

- [ ] **Step 6: Run full suite**

Run: `npx vitest run`
Expected: Some build-runner tests may fail because `createBuildSteps` now inserts 7 steps. That will be fixed in Task 3.

- [ ] **Step 7: Commit**

```bash
git add server/db/index.js server/db/queries.js tests/server/db.test.js
git commit -m "feat(m1): add pause state columns + phase column + stub step 7"
```

---

## Task 3: PauseSignal + phased runner loop

**Files:**
- Modify: `server/services/build-runner.js`
- Modify: `tests/server/build-runner.test.js`

- [ ] **Step 1: Write the failing test**

Replace the `it('runs all 6 steps successfully', ...)` test and add new ones. Full replacement for the describe block in `tests/server/build-runner.test.js`:

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

function createTestBuild(db) {
  const build = {
    id: 'build-test-1',
    business_name: 'Test Biz',
    business_email: 'test@biz.com',
    business_phone: '5551234567',
    address: '123 Main', city: 'Miami', state: 'FL', zip: '33101', country: 'US',
    industry: 'general', timezone: 'America/New_York',
    owner_first_name: 'John', owner_last_name: 'Doe',
    area_code: '305', website_url: 'https://testbiz.com',
  };
  queries.insertBuild(db, build);
  queries.createBuildSteps(db, build.id);
  return build;
}

describe('BuildRunner phased execution', () => {
  let db, ghl, runner;

  beforeEach(() => {
    db = createTestDb();
    initializeDb(db);
    ghl = createMockGhl();
    runner = new BuildRunner(db, ghl, { backoffMs: [10, 20, 40] });
  });

  it('runs phase 1 then pauses at stub step 7', async () => {
    const build = createTestBuild(db);
    const events = [];
    await runner.run(build.id, (ev) => events.push(ev));

    const updated = queries.getBuildById(db, build.id);
    expect(updated.status).toBe('paused');
    expect(updated.paused_at_step).toBe(7);

    const steps = queries.getBuildSteps(db, build.id);
    expect(steps.slice(0, 6).every((s) => s.status === 'completed')).toBe(true);
    expect(steps[6].status).toBe('running');

    // Phase events emitted
    const phaseEvents = events.filter((e) => e.type === 'phase-start' || e.type === 'phase-complete');
    expect(phaseEvents.find((e) => e.type === 'phase-start' && e.phase === 1)).toBeDefined();
    expect(phaseEvents.find((e) => e.type === 'phase-complete' && e.phase === 1)).toBeDefined();
    expect(phaseEvents.find((e) => e.type === 'phase-start' && e.phase === 2)).toBeDefined();

    // Pause event emitted
    const pauseEvent = events.find((e) => e.type === 'build-paused');
    expect(pauseEvent).toBeDefined();
    expect(pauseEvent.step).toBe(7);
  });

  it('resume completes the build after pause', async () => {
    const build = createTestBuild(db);
    await runner.run(build.id, () => {});
    expect(queries.getBuildById(db, build.id).status).toBe('paused');

    const events = [];
    await runner.resume(build.id, {}, (ev) => events.push(ev));

    const updated = queries.getBuildById(db, build.id);
    expect(updated.status).toBe('completed');
    expect(updated.paused_at_step).toBeNull();

    const steps = queries.getBuildSteps(db, build.id);
    expect(steps[6].status).toBe('completed');
  });

  it('marks build as failed when phase 1 step fails after retries', async () => {
    const build = createTestBuild(db);
    ghl.buyPhoneNumber.mockRejectedValue(new Error('No numbers available'));
    await runner.run(build.id, () => {});

    const updated = queries.getBuildById(db, build.id);
    expect(updated.status).toBe('failed');
    const steps = queries.getBuildSteps(db, build.id);
    expect(steps[0].status).toBe('completed');
    expect(steps[1].status).toBe('failed');
    expect(steps[1].retry_count).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/build-runner.test.js`
Expected: FAIL — runner has no resume, no phase events, no step 7.

- [ ] **Step 3: Refactor build-runner.js**

Replace `server/services/build-runner.js` with:

```js
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as queries from '../db/queries.js';
import { getStagesForIndustry } from './pipelines.js';
import { getNearbyAreaCodes } from './phone-fallback.js';
import { PHASES, getPhaseForStep } from './phases.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const snapshots = JSON.parse(
  (await import('fs')).default.readFileSync(join(__dirname, '../config/snapshots.json'), 'utf8')
);

const DEFAULT_BACKOFF_MS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// Signal thrown by a step when it needs to pause for manual input.
export class PauseSignal {
  constructor(stepNumber, context) {
    this.stepNumber = stepNumber;
    this.context = context;
    this.isPauseSignal = true;
  }
}

export class BuildRunner {
  constructor(db, ghl, options = {}) {
    this.db = db;
    this.ghl = ghl;
    this.backoffMs = options.backoffMs || DEFAULT_BACKOFF_MS;
  }

  async run(buildId, emit) {
    const build = queries.getBuildById(this.db, buildId);
    if (!build) throw new Error(`Build not found: ${buildId}`);
    queries.updateBuildStatus(this.db, buildId, 'running');
    const startTime = Date.now();
    await this._runFromStep(build, 1, startTime, emit, { resumePayload: null });
  }

  async resume(buildId, resumePayload, emit) {
    const build = queries.getBuildById(this.db, buildId);
    if (!build) throw new Error(`Build not found: ${buildId}`);
    if (build.status !== 'paused') throw new Error(`Build is not paused: ${buildId}`);

    const fromStep = build.paused_at_step;
    queries.clearPauseState(this.db, buildId);
    queries.updateBuildStatus(this.db, buildId, 'running');
    const startTime = Date.now();
    await this._runFromStep(build, fromStep, startTime, emit, { resumePayload });
  }

  async retryFromStep(buildId, fromStep, emit) {
    const build = queries.getBuildById(this.db, buildId);
    if (!build) throw new Error(`Build not found: ${buildId}`);
    queries.updateBuildStatus(this.db, buildId, 'running');
    const startTime = Date.now();

    const steps = queries.getBuildSteps(this.db, buildId);
    for (const step of steps) {
      if (step.step_number >= fromStep) {
        this.db.prepare(
          `UPDATE build_steps SET status = 'pending', started_at = NULL, completed_at = NULL,
           duration_ms = NULL, error_message = NULL, api_response = NULL, retry_count = 0
           WHERE build_id = ? AND step_number = ?`
        ).run(buildId, step.step_number);
      }
    }
    await this._runFromStep(build, fromStep, startTime, emit, { resumePayload: null });
  }

  // ─── Core loop ────────────────────────────────────────────────────────────

  async _runFromStep(build, fromStep, startTime, emit, ctx) {
    const state = await this._getStateFromPriorSteps(build.id, fromStep);

    try {
      let lastPhaseEmitted = null;
      for (const phase of PHASES) {
        const phaseSteps = phase.steps.filter((s) => s.number >= fromStep);
        if (phaseSteps.length === 0) continue;

        if (lastPhaseEmitted !== phase.id) {
          emit({ type: 'phase-start', phase: phase.id, name: phase.name });
          lastPhaseEmitted = phase.id;
        }

        for (const step of phase.steps) {
          if (step.number < fromStep) continue;
          await this._executeStep(build, step.number, state, emit, ctx);
        }

        emit({ type: 'phase-complete', phase: phase.id });
      }

      queries.updateBuildStatus(this.db, build.id, 'completed', Date.now() - startTime);
    } catch (err) {
      if (err && err.isPauseSignal) {
        queries.setPauseState(this.db, build.id, err.stepNumber, err.context);
        emit({
          type: 'build-paused',
          step: err.stepNumber,
          phase: getPhaseForStep(err.stepNumber),
          context: err.context,
        });
        return;
      }
      queries.updateBuildStatus(this.db, build.id, 'failed', Date.now() - startTime);
    }
  }

  async _executeStep(build, stepNumber, state, emit, ctx) {
    const buildId = build.id;

    queries.updateStepStatus(this.db, buildId, stepNumber, 'running');
    emit({ type: 'step-update', step: stepNumber, status: 'running' });

    const stepStart = Date.now();
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        queries.incrementStepRetry(this.db, buildId, stepNumber);
        const delay = this.backoffMs[attempt - 1] ?? this.backoffMs[this.backoffMs.length - 1];
        await sleep(delay);
      }
      try {
        const result = await this._runStepLogic(build, stepNumber, state, ctx);
        Object.assign(state, result);
        const durationMs = Date.now() - stepStart;
        queries.updateStepStatus(
          this.db, buildId, stepNumber, 'completed', durationMs, null, JSON.stringify(result)
        );
        emit({ type: 'step-update', step: stepNumber, status: 'completed', duration_ms: durationMs });
        return;
      } catch (err) {
        if (err && err.isPauseSignal) throw err; // Don't retry pauses
        lastError = err;
        if (err.skipRetry) break;
      }
    }

    const durationMs = Date.now() - stepStart;
    queries.updateStepStatus(
      this.db, buildId, stepNumber, 'failed', durationMs,
      lastError?.message ?? 'Unknown error', null
    );
    emit({ type: 'step-update', step: stepNumber, status: 'failed', error: lastError?.message });
    throw lastError;
  }

  async _runStepLogic(build, stepNumber, state, ctx) {
    switch (stepNumber) {
      case 1: return await this._step1CreateLocation(build);
      case 2: return await this._step2ProvisionPhone(build, state, build.id);
      case 3: return await this._step3SetCustomValues(build, state);
      case 4: return await this._step4CreatePipeline(build, state);
      case 5: return await this._step5CreateUser(build, state);
      case 6: return await this._step6SendWelcomeComms(build, state);
      case 7: return await this._step7WebsiteCreationStub(build, state, ctx);
      default: throw new Error(`Unknown step number: ${stepNumber}`);
    }
  }

  async _step7WebsiteCreationStub(build, state, ctx) {
    if (!ctx.resumePayload) {
      throw new PauseSignal(7, {
        reason: 'stub_pause',
        message: 'Click Continue to proceed (M1 stub).',
      });
    }
    return { resumed: true, payload: ctx.resumePayload };
  }

  // ─── Existing step 1-6 implementations (unchanged) ────────────────────────

  async _step1CreateLocation(build) {
    const snapshot = snapshots[build.industry] || snapshots['general'];
    const locationData = {
      name: build.business_name, email: build.business_email, phone: build.business_phone,
      address: build.address, city: build.city, state: build.state,
      postalCode: build.zip, country: build.country, timezone: build.timezone,
      website: build.website_url, snapshotId: snapshot.id,
    };
    const response = await this.ghl.createLocation(locationData);
    const locationId = response.location.id;
    queries.updateBuildLocationId(this.db, build.id, locationId);
    return { locationId };
  }

  async _step2ProvisionPhone(build, state, buildId) {
    const locationId = state.locationId;
    const areaCodesToTry = [build.area_code, ...getNearbyAreaCodes(build.area_code)];
    let lastError = null;
    for (let i = 0; i < areaCodesToTry.length; i++) {
      const code = areaCodesToTry[i];
      try {
        const response = await this.ghl.buyPhoneNumber(locationId, code);
        return { phoneNumberId: response.phoneNumber.id, phoneNumber: response.phoneNumber.number };
      } catch (err) {
        lastError = err;
        if (i > 0) queries.incrementStepRetry(this.db, buildId, 2);
      }
    }
    const err = new Error(`Phone provisioning failed for all area codes: ${lastError?.message}`);
    err.skipRetry = true;
    throw err;
  }

  async _step3SetCustomValues(build, state) {
    const locationId = state.locationId;
    const customValues = [
      { key: 'business_name', value: build.business_name },
      { key: 'business_email', value: build.business_email },
      { key: 'business_phone', value: build.business_phone },
      { key: 'owner_first_name', value: build.owner_first_name },
      { key: 'owner_last_name', value: build.owner_last_name },
      { key: 'website_url', value: build.website_url || '' },
    ];
    await this.ghl.setCustomValues(locationId, customValues);
    return { customValuesSet: true };
  }

  async _step4CreatePipeline(build, state) {
    const locationId = state.locationId;
    const stages = getStagesForIndustry(build.industry);
    const pipelineName = `${build.business_name} Pipeline`;
    const response = await this.ghl.createPipeline(locationId, pipelineName, stages);
    return { pipelineId: response.pipeline.id };
  }

  async _step5CreateUser(build, state) {
    const locationId = state.locationId;
    const response = await this.ghl.createUser(
      locationId, build.owner_first_name, build.owner_last_name, build.business_email
    );
    return { userId: response.user.id };
  }

  async _step6SendWelcomeComms(build, state) {
    const locationId = state.locationId;
    const contactResponse = await this.ghl.createContact(
      locationId, build.owner_first_name, build.owner_last_name,
      build.business_email, build.business_phone
    );
    const contactId = contactResponse.contact.id;
    const emailSubject = `Welcome to ${build.business_name} — Your Account is Ready`;
    const emailBody =
      `Hi ${build.owner_first_name},\n\n` +
      `Your GoHighLevel sub-account for ${build.business_name} has been created and is ready to use.\n\n` +
      `Business: ${build.business_name}\n` +
      `Email: ${build.business_email}\n` +
      `Phone: ${build.business_phone}\n\n` +
      `Please check your email inbox for your GoHighLevel login invitation to get started.\n\n` +
      `— VO360`;
    const emailResponse = await this.ghl.sendMessage(
      'Email', locationId, contactId, emailBody, emailSubject
    );
    const smsBody =
      `Hi ${build.owner_first_name}! Your ${build.business_name} account is ready. ` +
      `Check your email for the login invitation. — VO360`;
    const smsResponse = await this.ghl.sendMessage('SMS', locationId, contactId, smsBody);
    return {
      contactId,
      welcomeEmailMessageId: emailResponse.messageId,
      welcomeSmsMessageId: smsResponse.messageId,
    };
  }

  async _getStateFromPriorSteps(buildId, fromStep) {
    const build = queries.getBuildById(this.db, buildId);
    const state = {};
    if (build.location_id) state.locationId = build.location_id;
    if (fromStep <= 1) return state;
    const steps = queries.getBuildSteps(this.db, buildId);
    for (const step of steps) {
      if (step.step_number < fromStep && step.status === 'completed' && step.api_response) {
        try { Object.assign(state, JSON.parse(step.api_response)); } catch (_) {}
      }
    }
    return state;
  }
}
```

**Note on the emit contract:** the new runner emits objects with a `type` field (`step-update`, `phase-start`, `phase-complete`, `build-paused`). The route layer (Task 5) bridges these to the right SSE event names. Existing tests that previously pushed events without a type are updated above.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/build-runner.test.js`
Expected: PASS, 3 tests green (phase 1 + pause, resume completes, failure path).

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: route tests may still fail because they haven't been updated yet. All runner + db + phases + phone-fallback + pipelines + auth tests should pass.

- [ ] **Step 6: Commit**

```bash
git add server/services/build-runner.js tests/server/build-runner.test.js
git commit -m "feat(m1): phased runner loop with PauseSignal + resume"
```

---

## Task 4: Pause/resume integration test

**Files:**
- Create: `tests/server/pause-resume.test.js`

- [ ] **Step 1: Write the test**

`tests/server/pause-resume.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeDb } from '../../server/db/index.js';
import * as queries from '../../server/db/queries.js';
import { BuildRunner } from '../../server/services/build-runner.js';

function mockGhl() {
  return {
    createLocation: vi.fn().mockResolvedValue({ location: { id: 'loc-1' } }),
    buyPhoneNumber: vi.fn().mockResolvedValue({ phoneNumber: { id: 'p-1', number: '+13051234567' } }),
    setCustomValues: vi.fn().mockResolvedValue({ success: true }),
    createPipeline: vi.fn().mockResolvedValue({ pipeline: { id: 'pipe-1' } }),
    createUser: vi.fn().mockResolvedValue({ user: { id: 'u-1' } }),
    createContact: vi.fn().mockResolvedValue({ contact: { id: 'c-1' } }),
    sendMessage: vi.fn().mockResolvedValue({ messageId: 'm-1' }),
  };
}

function seedBuild(db, id = 'b1') {
  queries.insertBuild(db, {
    id, business_name: 'B', business_email: 'b@b.com', business_phone: '5551234567',
    address: '', city: '', state: '', zip: '', country: 'US',
    industry: 'general', timezone: 'America/New_York',
    owner_first_name: 'A', owner_last_name: 'B', area_code: '305', website_url: null,
  });
  queries.createBuildSteps(db, id);
  return id;
}

describe('Pause/resume durability', () => {
  let db, runner;

  beforeEach(() => {
    db = createTestDb();
    initializeDb(db);
    runner = new BuildRunner(db, mockGhl(), { backoffMs: [1, 1, 1] });
  });

  it('persists pause state across runner instances (simulates server restart)', async () => {
    const id = seedBuild(db);
    await runner.run(id, () => {});

    const paused = queries.getBuildById(db, id);
    expect(paused.status).toBe('paused');
    expect(paused.paused_at_step).toBe(7);

    // Simulate server restart: brand new runner instance, same db
    const freshRunner = new BuildRunner(db, mockGhl(), { backoffMs: [1, 1, 1] });
    await freshRunner.resume(id, { ack: true }, () => {});

    const done = queries.getBuildById(db, id);
    expect(done.status).toBe('completed');
    expect(done.paused_at_step).toBeNull();
    expect(done.pause_context).toBeNull();
  });

  it('rejects resume on a non-paused build', async () => {
    const id = seedBuild(db);
    await expect(runner.resume(id, {}, () => {})).rejects.toThrow(/not paused/);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/server/pause-resume.test.js`
Expected: PASS, 2 tests green.

- [ ] **Step 3: Commit**

```bash
git add tests/server/pause-resume.test.js
git commit -m "test(m1): pause/resume durability + restart simulation"
```

---

## Task 5: Resume endpoint + SSE bridge

**Files:**
- Modify: `server/routes/builds.js`

- [ ] **Step 1: Update the SSE emit bridge**

In `server/routes/builds.js`, replace the `emit` usages inside both `router.post('/')` and `router.post('/:id/retry/:step')` handlers, and the SSE stream replay, with a single bridge that reads the new `type`-tagged runner events.

First, add a helper near the top of the file (below `broadcastToBuild`):
```js
function runnerEmit(buildId) {
  return (event) => {
    // Runner events are tagged with a `type` field; bridge to SSE event names.
    const { type, ...rest } = event;
    if (!type) return;
    broadcastToBuild(buildId, type, rest);
  };
}
```

Replace the `emit` definitions in the POST `/` handler and POST `/:id/retry/:step` handler:
```js
const emit = runnerEmit(id);
```

- [ ] **Step 2: Update the POST `/` completion handler to handle paused status**

In the `.then()` callback after `runner.run(...)`, replace with:
```js
runner.run(id, emit).then(() => {
  const finalBuild = queries.getBuildById(db, id);
  if (finalBuild.status === 'completed') {
    broadcastToBuild(id, 'build-complete', { id });
  } else if (finalBuild.status === 'paused') {
    // Pause event already broadcast by runner; nothing more to do here.
  } else {
    const steps = queries.getBuildSteps(db, id);
    const failedStep = steps.find((s) => s.status === 'failed');
    broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
  }
}).catch(() => {
  const steps = queries.getBuildSteps(db, id);
  const failedStep = steps.find((s) => s.status === 'failed');
  broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
});
```

- [ ] **Step 3: Update the SSE stream replay to handle paused builds and phase events**

Replace the replay block inside `router.get('/:id/stream', ...)` with:
```js
// Replay current state of all steps
const steps = queries.getBuildSteps(db, id);
for (const step of steps) {
  sendSseEvent(res, 'step-update', {
    step: step.step_number,
    status: step.status,
    duration_ms: step.duration_ms,
    error: step.error_message,
  });
}

// If finished, replay terminal event and close
if (build.status === 'completed') {
  sendSseEvent(res, 'build-complete', { id });
  res.end();
  return;
}

if (build.status === 'failed') {
  const failedStep = steps.find((s) => s.status === 'failed');
  sendSseEvent(res, 'build-failed', { id, failedStep: failedStep || null });
  res.end();
  return;
}

if (build.status === 'paused') {
  sendSseEvent(res, 'build-paused', {
    step: build.paused_at_step,
    context: build.pause_context ? JSON.parse(build.pause_context) : null,
  });
  // Keep the connection open so the client still receives updates when resumed.
}
```

- [ ] **Step 4: Add the resume endpoint**

Add this handler inside `createBuildsRouter`, above `return router;`:
```js
router.post('/:id/resume', async (req, res) => {
  const { id } = req.params;
  const build = queries.getBuildById(db, id);
  if (!build) return res.status(404).json({ error: 'Build not found' });
  if (build.status !== 'paused') {
    return res.status(400).json({ error: 'Build is not paused' });
  }

  const ghl = new GhlApi(process.env.GHL_AGENCY_API_KEY);
  const runner = new BuildRunner(db, ghl);
  const emit = runnerEmit(id);

  runner.resume(id, req.body || {}, emit).then(() => {
    const finalBuild = queries.getBuildById(db, id);
    if (finalBuild.status === 'completed') {
      broadcastToBuild(id, 'build-complete', { id });
    } else if (finalBuild.status === 'failed') {
      const steps = queries.getBuildSteps(db, id);
      const failedStep = steps.find((s) => s.status === 'failed');
      broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
    }
  }).catch(() => {
    const steps = queries.getBuildSteps(db, id);
    const failedStep = steps.find((s) => s.status === 'failed');
    broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
  });

  res.status(202).json({ ok: true, id });
});
```

- [ ] **Step 5: Update the retry step range**

The existing retry endpoint validates `stepNumber >= 1 && stepNumber <= 6`. Change to `<= 7`:
```js
if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 7) {
  return res.status(400).json({ error: 'step must be a number between 1 and 7' });
}
```

- [ ] **Step 6: Run full suite**

Run: `npx vitest run`
Expected: All tests PASS (runner, db, phases, pause-resume, phone-fallback, pipelines, auth).

- [ ] **Step 7: Commit**

```bash
git add server/routes/builds.js
git commit -m "feat(m1): resume endpoint + phased SSE bridge + paused replay"
```

---

## Task 6: Frontend useSSE hook updates

**Files:**
- Modify: `src/hooks/useSSE.js`

- [ ] **Step 1: Replace useSSE with a phase-aware version**

Replace the entire contents of `src/hooks/useSSE.js` with:
```js
import { useState, useEffect, useRef } from 'react';

const DEFAULT_PHASES = [
  {
    id: 1,
    name: 'GHL Sub-Account Setup',
    steps: [
      { step: 1, name: 'Create Sub-Account' },
      { step: 2, name: 'Provision Phone' },
      { step: 3, name: 'Set Custom Values' },
      { step: 4, name: 'Create Pipeline' },
      { step: 5, name: 'Create Admin User' },
      { step: 6, name: 'Send Welcome Comms' },
    ],
  },
  {
    id: 2,
    name: 'Website Build',
    steps: [
      { step: 7, name: 'Website Creation (Manual)' },
    ],
  },
];

function initialPhases() {
  return DEFAULT_PHASES.map((p) => ({
    ...p,
    steps: p.steps.map((s) => ({ ...s, status: 'pending', duration_ms: null, error: null })),
  }));
}

export function useSSE(buildId) {
  const [phases, setPhases] = useState(initialPhases);
  const [buildStatus, setBuildStatus] = useState(null); // 'complete' | 'failed' | 'paused' | null
  const [buildResult, setBuildResult] = useState(null);
  const [pauseInfo, setPauseInfo] = useState(null); // { step, context }
  const [connectKey, setConnectKey] = useState(0);
  const eventSourceRef = useRef(null);

  function reconnect() { setConnectKey((k) => k + 1); }

  function updateStep(stepNumber, patch) {
    setPhases((prev) =>
      prev.map((p) => ({
        ...p,
        steps: p.steps.map((s) => (s.step === stepNumber ? { ...s, ...patch } : s)),
      }))
    );
  }

  useEffect(() => {
    if (!buildId) return;

    setPhases(initialPhases());
    setBuildStatus(null);
    setBuildResult(null);
    setPauseInfo(null);

    const es = new EventSource(`/api/builds/${buildId}/stream`);
    eventSourceRef.current = es;

    es.addEventListener('step-update', (e) => {
      const data = JSON.parse(e.data);
      updateStep(data.step, {
        status: data.status,
        duration_ms: data.duration_ms ?? undefined,
        error: data.error ?? undefined,
      });
    });

    es.addEventListener('build-paused', (e) => {
      const data = JSON.parse(e.data);
      setBuildStatus('paused');
      setPauseInfo({ step: data.step, context: data.context });
    });

    es.addEventListener('build-complete', (e) => {
      const data = JSON.parse(e.data);
      setBuildStatus('complete');
      setBuildResult(data);
      setPauseInfo(null);
      es.close();
    });

    es.addEventListener('build-failed', (e) => {
      const data = JSON.parse(e.data);
      setBuildStatus('failed');
      setBuildResult(data);
      es.close();
    });

    es.onerror = () => {};
    return () => es.close();
  }, [buildId, connectKey]);

  // Flat steps list for back-compat
  const steps = phases.flatMap((p) => p.steps);

  return { phases, steps, buildStatus, buildResult, pauseInfo, reconnect };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useSSE.js
git commit -m "feat(m1): phase-aware useSSE hook with paused state"
```

---

## Task 7: ProgressTracker UI — phase grouping + pause banner

**Files:**
- Modify: `src/components/ProgressTracker.jsx`

- [ ] **Step 1: Replace ProgressTracker with phase-grouped version**

Replace the entire contents of `src/components/ProgressTracker.jsx` with:
```jsx
import { useState } from 'react';
import { useSSE } from '../hooks/useSSE';

function StepCircle({ status, stepNumber }) {
  if (status === 'pending') {
    return (
      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 opacity-50">
        <span className="text-xs font-semibold text-gray-500">{stepNumber}</span>
      </div>
    );
  }
  if (status === 'running') {
    return (
      <div className="w-7 h-7 rounded-full bg-magenta flex items-center justify-center flex-shrink-0">
        <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }
  if (status === 'completed') {
    return (
      <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold">✓</span>
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold">✗</span>
      </div>
    );
  }
  return null;
}

function formatDuration(ms) {
  if (ms == null) return '';
  return (ms / 1000).toFixed(1) + 's';
}

function phaseStatusLabel(phase) {
  if (phase.steps.every((s) => s.status === 'completed')) return 'Completed';
  if (phase.steps.some((s) => s.status === 'running' || s.status === 'failed')) return 'In Progress';
  if (phase.steps.every((s) => s.status === 'pending')) return 'Pending';
  return 'In Progress';
}

export default function ProgressTracker({ buildId, onRetry }) {
  const { phases, buildStatus, buildResult, pauseInfo, reconnect } = useSSE(buildId);
  const [resuming, setResuming] = useState(false);

  async function handleRetry(stepNumber) {
    try {
      await fetch(`/api/builds/${buildId}/retry/${stepNumber}`, { method: 'POST' });
      reconnect();
      if (onRetry) onRetry();
    } catch (err) {
      console.error('Retry failed:', err);
    }
  }

  async function handleResume() {
    setResuming(true);
    try {
      await fetch(`/api/builds/${buildId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      reconnect();
    } catch (err) {
      console.error('Resume failed:', err);
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow p-5">
      <h2 className="text-sm font-bold text-navy mb-4">Build Progress</h2>

      {buildStatus === 'paused' && pauseInfo && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm font-bold text-yellow-800">Waiting to continue</p>
          <p className="text-xs text-yellow-700 mt-1">
            {pauseInfo.context?.message || 'This build is paused. Click Continue to proceed.'}
          </p>
          <button
            onClick={handleResume}
            disabled={resuming}
            className="mt-2 text-xs font-semibold text-white bg-magenta hover:opacity-90 disabled:opacity-50 px-4 py-1.5 rounded-md"
          >
            {resuming ? 'Resuming…' : 'Continue'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {phases.map((phase) => (
          <div key={phase.id}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-navy">
                Phase {phase.id}: {phase.name}
              </h3>
              <span className="text-[10px] text-gray-500">{phaseStatusLabel(phase)}</span>
            </div>
            <div className="flex flex-col gap-3 pl-2 border-l-2 border-gray-100">
              {phase.steps.map((step) => (
                <div key={step.step} className={`flex gap-3 items-start ${step.status === 'pending' ? 'opacity-50' : ''}`}>
                  <StepCircle status={step.status} stepNumber={step.step} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-tight ${
                      step.status === 'pending'   ? 'text-gray-500' :
                      step.status === 'running'   ? 'text-magenta' :
                      step.status === 'completed' ? 'text-gray-800' :
                      step.status === 'failed'    ? 'text-gray-800' : 'text-gray-500'
                    }`}>
                      {step.name}
                    </p>
                    {step.status === 'running' && (
                      <p className="text-xs text-magenta mt-0.5">Running...</p>
                    )}
                    {step.status === 'completed' && step.duration_ms != null && (
                      <p className="text-xs text-green-600 mt-0.5">
                        Completed · {formatDuration(step.duration_ms)}
                      </p>
                    )}
                    {step.status === 'failed' && (
                      <div className="mt-1">
                        <p className="text-xs text-red-500 break-words">{step.error || 'Step failed'}</p>
                        <button
                          onClick={() => handleRetry(step.step)}
                          className="mt-1.5 text-xs font-semibold text-white bg-magenta hover:opacity-90 transition-opacity px-3 py-1 rounded-md"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {buildStatus === 'complete' && buildResult && (
        <div className="mt-5 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">🎉</span>
            <div>
              <p className="text-sm font-bold text-green-800">Build Complete!</p>
              {buildResult.location_id && (
                <p className="text-xs text-green-700 mt-0.5">
                  Location ID: <span className="font-mono font-semibold">{buildResult.location_id}</span>
                </p>
              )}
              {buildResult.total_duration_ms != null && (
                <p className="text-xs text-green-600 mt-0.5">
                  Total time: {formatDuration(buildResult.total_duration_ms)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {buildStatus === 'failed' && buildResult && (
        <div className="mt-5 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">⚠️</span>
            <div>
              <p className="text-sm font-bold text-red-800">Build Failed</p>
              {buildResult.error && (
                <p className="text-xs text-red-600 mt-0.5 break-words">{buildResult.error}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ProgressTracker.jsx
git commit -m "feat(m1): phase-grouped progress tracker + pause banner"
```

---

## Task 8: BuildTable paused badge + header rename

**Files:**
- Modify: `src/components/BuildTable.jsx`
- Modify: `src/components/Sidebar.jsx` or wherever the header label lives (grep first)

- [ ] **Step 1: Find the existing header label**

Run: `grep -rn "Sub-Account Builder" src/`
Expected: one or more files containing the string "Sub-Account Builder".

- [ ] **Step 2: Rename to "Client Onboarding Hub"**

Use Edit to replace every occurrence of the string `Sub-Account Builder` with `Client Onboarding Hub` in the files returned by Step 1. Do NOT rename the package name in `package.json` or any file paths — only user-visible header text.

- [ ] **Step 3: Add paused badge to BuildTable**

Read `src/components/BuildTable.jsx` first. Find the status badge rendering (likely a switch or conditional on `build.status`). Add a case for `'paused'` that renders:
```jsx
<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
  Paused
</span>
```
Match the visual pattern of the existing badges (same class shape, different color).

Also: if the file has a status filter dropdown or any place that enumerates status values, add `'paused'` alongside the existing values.

- [ ] **Step 4: Commit**

```bash
git add src/components/BuildTable.jsx src/components/Sidebar.jsx src/App.jsx
git commit -m "feat(m1): paused badge in build list + rename to Client Onboarding Hub"
```

(Only stage files you actually modified — adjust the `git add` list accordingly.)

---

## Task 9: End-to-end manual verification

**Files:** none (operator-driven verification against a real GHL test sub-account)

- [ ] **Step 1: Run the full test suite one more time**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Start the server and frontend**

Run: `npm run dev:all`
Expected: server on `http://localhost:3003`, Vite dev server reports a URL (typically `http://localhost:5173`).

- [ ] **Step 3: Log in and start a real build**

Open the Vite URL. Log in. Fill out the new-build form with **real test data** against a GHL test sub-account (not production). Click Start.

**Expected:**
- Progress tracker shows "Phase 1: GHL Sub-Account Setup" with the 6 steps executing one by one.
- Each step goes pending → running → completed.
- After step 6, "Phase 2: Website Build" appears; step 7 "Website Creation (Manual)" starts running, then the yellow **Waiting to continue** banner appears with a Continue button.
- The build in the list shows a "Paused" badge.

- [ ] **Step 4: Verify real GHL side effects**

Check GHL directly:
- Sub-account exists with the business name.
- Phone number was provisioned.
- Pipeline with the correct stages exists.
- Admin user received an invitation email.
- Contact received welcome email + SMS.

- [ ] **Step 5: Close the tab and reopen the build detail page**

Close the browser tab completely. Reopen the app, navigate to Build History, click the paused build.

**Expected:** The paused banner is still rendered. Progress still shows Phase 1 completed, step 7 awaiting continue.

- [ ] **Step 6: Restart the server while build is paused**

In the terminal running `npm run dev:all`, kill it (Ctrl+C). Restart: `npm run dev:all`. Refresh the build detail page.

**Expected:** Paused banner is still rendered. Continue button still works.

- [ ] **Step 7: Click Continue**

Click the Continue button.

**Expected:** Step 7 transitions to completed, Phase 2 shows complete, "Build Complete!" panel appears with the GHL Location ID.

- [ ] **Step 8: Record verification results**

Append a `## Verification Run — <date>` section to the spec file documenting:
- Which test sub-account was used.
- That all 6 GHL side effects were verified in GHL.
- That the close-tab-and-return case worked.
- That the server-restart case worked.
- That Continue finished the build.

Commit:
```bash
git add docs/superpowers/specs/2026-04-08-onboarding-automator-m1-design.md
git commit -m "docs(m1): record end-to-end verification run"
```

---

## Self-Review

**Spec coverage:**
- Phased execution → Tasks 1, 3 ✓
- Stub Phase 2 step → Task 1 (config), Task 3 (`_step7WebsiteCreationStub`) ✓
- Lean schema (only `paused_at_step`, `pause_context`, `phase`) → Task 2 ✓
- Durable pause/resume → Tasks 3, 4, 5 ✓
- `POST /api/builds/:id/resume` → Task 5 ✓
- New SSE events (`phase-start`, `phase-complete`, `build-paused`) → Tasks 3, 5 ✓
- Phase-grouped progress tracker + paused banner + Continue → Tasks 6, 7 ✓
- Paused badge in build list → Task 8 ✓
- Header rename → Task 8 ✓
- Unit tests + real end-to-end run + restart survival → Tasks 1–4 + Task 9 ✓
- No form changes → correctly omitted ✓

**Placeholder scan:** No TBDs, no "handle edge cases" stubs. Every code block is complete. Task 8 step 3 asks the operator to match the existing badge visual pattern rather than showing a guessed file — this is intentional because the BuildTable file was not read in plan-writing; the pattern is identical to the other badges in that file.

**Type consistency:**
- `PauseSignal` class defined in Task 3, referenced in the same task's `_step7WebsiteCreationStub`. ✓
- Runner emit contract: all emits use `{ type, ... }`. Route bridge in Task 5 destructures `type` and forwards the rest. ✓
- `setPauseState(db, buildId, stepNumber, context)` signature used consistently in Task 2 (definition) and Task 3 (caller). ✓
- `getAllSteps()` / `getPhaseForStep()` / `getStepName()` defined in Task 1, imported in Task 2 (queries) and Task 3 (runner). ✓
- `useSSE` return shape: `{ phases, steps, buildStatus, buildResult, pauseInfo, reconnect }`. ProgressTracker in Task 7 destructures the same keys. ✓

Plan is internally consistent.

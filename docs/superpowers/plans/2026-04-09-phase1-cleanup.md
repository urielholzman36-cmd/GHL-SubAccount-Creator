# Phase 1 Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse Phase 1 from 6 steps to 2 (Create Sub-Account with real snapshot + best-effort Welcome Comms), remove the `DRY_RUN_GHL` workaround, and remove the Industry dropdown.

**Architecture:** Delete removed step code, introduce a `warning` step status for best-effort steps, renumber the stub Phase 2 step from 7 to 3, and hard-code the single master snapshot ID in the runner. GHL research (already performed) confirms that agency PIT tokens cannot create contacts or send messages, so the Welcome Comms step will always take the "not available" code path — it logs a friendly explanation and marks the step `warning`. The build still completes.

**Tech Stack:** Node.js + Express + better-sqlite3 + Vitest, React 19 + Vite + Tailwind, SSE.

**Spec:** `docs/superpowers/specs/2026-04-09-phase1-cleanup-design.md`

**GHL research result (performed 2026-04-09 before plan was written):**
- `POST /contacts/` with agency PIT → `401 "The token is not authorized for this scope."`
- `POST /oauth/locationToken` (agency → location token exchange) → `401` (same scope error)
- `POST /locations/` with agency PIT → works (already proven).
- `DELETE /locations/:id` with agency PIT → works.

Therefore Task 3 implements the "not available" path for Welcome Comms. No contact or messaging API calls are made at runtime. The step logs a fixed explanation and returns warning status.

---

## File Structure

### Modified files
- `server/services/phases.config.js` — 2 steps in phase 1, 1 step in phase 2. Step numbers: 1, 2, 3.
- `server/services/build-runner.js` — delete removed step implementations, add `warning` status handling, hard-code snapshot ID, update the step-number switch.
- `server/db/queries.js` — no changes needed (driven by `phases.config.js`).
- `server/routes/builds.js` — retry step range changes from 1–7 to 1–3.
- `src/hooks/useSSE.js` — update `DEFAULT_PHASES` to the new 2-step Phase 1 + 1-step Phase 2 shape.
- `src/components/ProgressTracker.jsx` — render `warning` status (yellow ⚠ icon + "Completed with warning" label).
- `src/components/BuildForm.jsx` — remove Industry dropdown JSX and validation; hard-code `industry: 'general'` on submit.
- `tests/server/phases.config.test.js` — update expectations for 2-step Phase 1.
- `tests/server/db.test.js` — update step count assertion from 7 to 3.
- `tests/server/build-runner.test.js` — rewrite for new step numbering, new welcome-comms behavior, snapshot ID assertion.
- `tests/server/pause-resume.test.js` — update `paused_at_step` assertion from 7 to 3.
- `.env` — remove `DRY_RUN_GHL=1`.

### Deleted files
- `server/config/snapshots.json` — replaced by a single constant.

### No schema changes
The `industry` column stays (harmless). Existing `build_steps` rows with old step numbers remain in the DB — they will render incorrectly for historic rows but the operator treats existing rows as test data. No migration.

---

## Task 1: Update phase configuration

**Files:**
- Modify: `server/services/phases.config.js`
- Modify: `tests/server/phases.config.test.js`

- [ ] **Step 1: Update the failing test**

Replace the entire contents of `tests/server/phases.config.test.js` with:

```js
import { describe, it, expect } from 'vitest';
import { PHASES, getPhaseForStep, getAllSteps, getStepName } from '../../server/services/phases.config.js';

describe('phases config', () => {
  it('defines phase 1 with steps 1 and 2', () => {
    const p1 = PHASES.find((p) => p.id === 1);
    expect(p1).toBeDefined();
    expect(p1.name).toBe('GHL Sub-Account Setup');
    expect(p1.steps.map((s) => s.number)).toEqual([1, 2]);
  });

  it('phase 1 step 1 is Create Sub-Account (fatal)', () => {
    const p1 = PHASES.find((p) => p.id === 1);
    const step1 = p1.steps.find((s) => s.number === 1);
    expect(step1.name).toBe('Create Sub-Account');
    expect(step1.optional).not.toBe(true);
  });

  it('phase 1 step 2 is Send Welcome Comms (best-effort)', () => {
    const p1 = PHASES.find((p) => p.id === 1);
    const step2 = p1.steps.find((s) => s.number === 2);
    expect(step2.name).toBe('Send Welcome Comms');
    expect(step2.optional).toBe(true);
  });

  it('defines phase 2 with stub step 3', () => {
    const p2 = PHASES.find((p) => p.id === 2);
    expect(p2).toBeDefined();
    expect(p2.name).toBe('Website Build');
    expect(p2.steps).toHaveLength(1);
    expect(p2.steps[0].number).toBe(3);
    expect(p2.steps[0].pausesForManualInput).toBe(true);
  });

  it('getPhaseForStep returns the right phase id', () => {
    expect(getPhaseForStep(1)).toBe(1);
    expect(getPhaseForStep(2)).toBe(1);
    expect(getPhaseForStep(3)).toBe(2);
  });

  it('getAllSteps returns all steps in order', () => {
    const all = getAllSteps();
    expect(all.map((s) => s.number)).toEqual([1, 2, 3]);
  });

  it('getStepName returns the step name', () => {
    expect(getStepName(1)).toBe('Create Sub-Account');
    expect(getStepName(2)).toBe('Send Welcome Comms');
    expect(getStepName(3)).toBe('Website Creation (Manual)');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/server/phases.config.test.js`
Expected: FAIL — step names and numbers don't match yet.

- [ ] **Step 3: Rewrite the config**

Replace the entire contents of `server/services/phases.config.js` with:

```js
export const PHASES = [
  {
    id: 1,
    name: 'GHL Sub-Account Setup',
    steps: [
      { number: 1, name: 'Create Sub-Account' },
      { number: 2, name: 'Send Welcome Comms', optional: true },
    ],
  },
  {
    id: 2,
    name: 'Website Build',
    steps: [
      { number: 3, name: 'Website Creation (Manual)', pausesForManualInput: true },
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

export function isStepOptional(stepNumber) {
  const step = getAllSteps().find((s) => s.number === stepNumber);
  return step ? step.optional === true : false;
}

export function getTotalStepCount() {
  return getAllSteps().length;
}
```

- [ ] **Step 4: Run test to verify PASS**

Run: `npx vitest run tests/server/phases.config.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add server/services/phases.config.js tests/server/phases.config.test.js
git commit -m "refactor(phase1): collapse phase 1 to 2 steps, renumber stub to 3"
```

---

## Task 2: Update DB test for 3-step insertion

**Files:**
- Modify: `tests/server/db.test.js`

- [ ] **Step 1: Update the assertions**

Find and replace two blocks in `tests/server/db.test.js`.

First block — the existing `inserts and retrieves build steps` test:

```js
    queries.createBuildSteps(db, 'test-uuid-456');
    const steps = queries.getBuildSteps(db, 'test-uuid-456');
    expect(steps).toHaveLength(7);
    expect(steps[0].step_name).toBe('Create Sub-Account');
    expect(steps[5].step_name).toBe('Send Welcome Comms');
    expect(steps[6].step_name).toBe('Website Creation (Manual)');
  });
```

Replace with:

```js
    queries.createBuildSteps(db, 'test-uuid-456');
    const steps = queries.getBuildSteps(db, 'test-uuid-456');
    expect(steps).toHaveLength(3);
    expect(steps[0].step_name).toBe('Create Sub-Account');
    expect(steps[1].step_name).toBe('Send Welcome Comms');
    expect(steps[2].step_name).toBe('Website Creation (Manual)');
  });
```

Second block — the M1 extension `createBuildSteps inserts all 7 steps with correct phase numbers` test:

```js
    it('createBuildSteps inserts all 7 steps with correct phase numbers', () => {
      queries.insertBuild(db, {
        id: 'b-phases', business_name: 'X', business_email: 'x@y.com', business_phone: '5551234567',
        address: '', city: '', state: '', zip: '', country: 'US',
        industry: 'general', timezone: 'America/New_York',
        owner_first_name: 'A', owner_last_name: 'B', area_code: '305', website_url: null,
      });
      queries.createBuildSteps(db, 'b-phases');
      const steps = queries.getBuildSteps(db, 'b-phases');
      expect(steps).toHaveLength(7);
      expect(steps.slice(0, 6).every((s) => s.phase === 1)).toBe(true);
      expect(steps[6].phase).toBe(2);
      expect(steps[6].step_name).toBe('Website Creation (Manual)');
    });
```

Replace with:

```js
    it('createBuildSteps inserts all 3 steps with correct phase numbers', () => {
      queries.insertBuild(db, {
        id: 'b-phases', business_name: 'X', business_email: 'x@y.com', business_phone: '5551234567',
        address: '', city: '', state: '', zip: '', country: 'US',
        industry: 'general', timezone: 'America/New_York',
        owner_first_name: 'A', owner_last_name: 'B', area_code: '305', website_url: null,
      });
      queries.createBuildSteps(db, 'b-phases');
      const steps = queries.getBuildSteps(db, 'b-phases');
      expect(steps).toHaveLength(3);
      expect(steps[0].phase).toBe(1);
      expect(steps[1].phase).toBe(1);
      expect(steps[2].phase).toBe(2);
      expect(steps[2].step_name).toBe('Website Creation (Manual)');
    });
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/server/db.test.js`
Expected: PASS — `queries.createBuildSteps` reads from `phases.config.js` which now emits 3 steps.

- [ ] **Step 3: Commit**

```bash
git add tests/server/db.test.js
git commit -m "test(phase1): update db step-count assertions to 3"
```

---

## Task 3: Rewrite build-runner for 2-step Phase 1

**Files:**
- Modify: `server/services/build-runner.js`
- Delete: `server/config/snapshots.json`
- Modify: `tests/server/build-runner.test.js`

- [ ] **Step 1: Update the runner tests**

Replace the entire contents of `tests/server/build-runner.test.js` with:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeDb } from '../../server/db/index.js';
import * as queries from '../../server/db/queries.js';
import { BuildRunner, SNAPSHOT_ID } from '../../server/services/build-runner.js';

function createMockGhl() {
  return {
    createLocation: vi.fn().mockResolvedValue({ location: { id: 'loc-123' } }),
  };
}

function createTestBuild(db, id = 'build-test-1') {
  const build = {
    id,
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

describe('BuildRunner — Phase 1 cleanup', () => {
  let db, ghl, runner;

  beforeEach(() => {
    db = createTestDb();
    initializeDb(db);
    ghl = createMockGhl();
    runner = new BuildRunner(db, ghl, { backoffMs: [10, 20, 40] });
  });

  it('exports a non-empty SNAPSHOT_ID constant', () => {
    expect(typeof SNAPSHOT_ID).toBe('string');
    expect(SNAPSHOT_ID.length).toBeGreaterThan(0);
  });

  it('step 1 creates location with the hard-coded snapshot id', async () => {
    const build = createTestBuild(db);
    await runner.run(build.id, () => {});

    expect(ghl.createLocation).toHaveBeenCalledTimes(1);
    const arg = ghl.createLocation.mock.calls[0][0];
    expect(arg.snapshotId).toBe(SNAPSHOT_ID);
    expect(arg.name).toBe('Test Biz');
  });

  it('runs phase 1 (2 steps) then pauses at stub step 3', async () => {
    const build = createTestBuild(db);
    const events = [];
    await runner.run(build.id, (ev) => events.push(ev));

    const updated = queries.getBuildById(db, build.id);
    expect(updated.status).toBe('paused');
    expect(updated.paused_at_step).toBe(3);

    const steps = queries.getBuildSteps(db, build.id);
    expect(steps[0].status).toBe('completed'); // create sub-account
    expect(steps[1].status).toBe('warning');   // welcome comms
    expect(steps[2].status).toBe('running');   // stub step 3

    const phaseStart1 = events.find((e) => e.type === 'phase-start' && e.phase === 1);
    const phaseComplete1 = events.find((e) => e.type === 'phase-complete' && e.phase === 1);
    const phaseStart2 = events.find((e) => e.type === 'phase-start' && e.phase === 2);
    expect(phaseStart1).toBeDefined();
    expect(phaseComplete1).toBeDefined();
    expect(phaseStart2).toBeDefined();

    const pauseEvent = events.find((e) => e.type === 'build-paused');
    expect(pauseEvent).toBeDefined();
    expect(pauseEvent.step).toBe(3);
  });

  it('welcome comms step emits a step-update with status warning', async () => {
    const build = createTestBuild(db);
    const events = [];
    await runner.run(build.id, (ev) => events.push(ev));

    const step2Warning = events.find(
      (e) => e.type === 'step-update' && e.step === 2 && e.status === 'warning'
    );
    expect(step2Warning).toBeDefined();
    expect(step2Warning.error).toMatch(/agency|scope|not available/i);
  });

  it('resume completes the build after pause', async () => {
    const build = createTestBuild(db);
    await runner.run(build.id, () => {});
    expect(queries.getBuildById(db, build.id).status).toBe('paused');

    await runner.resume(build.id, { ack: true }, () => {});

    const updated = queries.getBuildById(db, build.id);
    expect(updated.status).toBe('completed');
    expect(updated.paused_at_step).toBeNull();

    const steps = queries.getBuildSteps(db, build.id);
    expect(steps[2].status).toBe('completed');
  });

  it('marks build as failed when step 1 fails after retries', async () => {
    const build = createTestBuild(db);
    ghl.createLocation.mockRejectedValue(new Error('GHL boom'));
    await runner.run(build.id, () => {});

    const updated = queries.getBuildById(db, build.id);
    expect(updated.status).toBe('failed');
    const steps = queries.getBuildSteps(db, build.id);
    expect(steps[0].status).toBe('failed');
  });

  it('retry step range validation still works for step 1', async () => {
    const build = createTestBuild(db);
    ghl.createLocation.mockRejectedValueOnce(new Error('boom'));
    ghl.createLocation.mockRejectedValueOnce(new Error('boom'));
    ghl.createLocation.mockRejectedValueOnce(new Error('boom'));
    ghl.createLocation.mockRejectedValueOnce(new Error('boom'));
    await runner.run(build.id, () => {});
    expect(queries.getBuildById(db, build.id).status).toBe('failed');

    ghl.createLocation.mockResolvedValue({ location: { id: 'loc-123' } });
    await runner.retryFromStep(build.id, 1, () => {});

    const updated = queries.getBuildById(db, build.id);
    expect(updated.status).toBe('paused');
    expect(updated.paused_at_step).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/server/build-runner.test.js`
Expected: FAIL — `SNAPSHOT_ID` not exported, step 2 not implemented, etc.

- [ ] **Step 3: Rewrite the runner**

Replace the entire contents of `server/services/build-runner.js` with:

```js
import * as queries from '../db/queries.js';
import { PHASES, getPhaseForStep, isStepOptional } from './phases.config.js';

const DEFAULT_BACKOFF_MS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

export const SNAPSHOT_ID = '4XHJuEPYsk1xeUKcmrL9';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Signal thrown by a step when it needs to pause for manual input.
 * The runner catches it, persists pause state, and exits cleanly.
 */
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
      for (const phase of PHASES) {
        const phaseSteps = phase.steps.filter((s) => s.number >= fromStep);
        if (phaseSteps.length === 0) continue;

        emit({ type: 'phase-start', phase: phase.id, name: phase.name });

        for (const step of phaseSteps) {
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
    const optional = isStepOptional(stepNumber);

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

    // All retries exhausted
    const durationMs = Date.now() - stepStart;
    const errMsg = lastError?.message ?? 'Unknown error';

    if (optional) {
      queries.updateStepStatus(
        this.db, buildId, stepNumber, 'warning', durationMs, errMsg, null
      );
      emit({
        type: 'step-update',
        step: stepNumber,
        status: 'warning',
        duration_ms: durationMs,
        error: errMsg,
      });
      return;
    }

    queries.updateStepStatus(
      this.db, buildId, stepNumber, 'failed', durationMs, errMsg, null
    );
    emit({ type: 'step-update', step: stepNumber, status: 'failed', error: errMsg });
    throw lastError;
  }

  async _runStepLogic(build, stepNumber, state, ctx) {
    switch (stepNumber) {
      case 1: return await this._step1CreateLocation(build);
      case 2: return await this._step2SendWelcomeComms(build, state);
      case 3: return await this._step3WebsiteCreationStub(build, state, ctx);
      default: throw new Error(`Unknown step number: ${stepNumber}`);
    }
  }

  async _step1CreateLocation(build) {
    const locationData = {
      name: build.business_name,
      email: build.business_email,
      phone: build.business_phone,
      address: build.address,
      city: build.city,
      state: build.state,
      postalCode: build.zip,
      country: build.country,
      timezone: build.timezone,
      website: build.website_url,
      snapshotId: SNAPSHOT_ID,
    };

    const response = await this.ghl.createLocation(locationData);
    const locationId = response.location.id;
    queries.updateBuildLocationId(this.db, build.id, locationId);
    return { locationId };
  }

  async _step2SendWelcomeComms(build, state) {
    // Agency Private Integration Tokens (PIT) do not have scope to create
    // contacts or send messages on behalf of sub-accounts. Verified against
    // the live GHL v2 API on 2026-04-09: POST /contacts/ returns 401
    // "The token is not authorized for this scope." and /oauth/locationToken
    // also returns 401.
    //
    // This step is marked optional in phases.config, so throwing here will
    // cause the runner to record status=warning and continue. Welcome comms
    // must be sent manually from inside the sub-account until GHL exposes
    // agency-level messaging scopes or we adopt the Marketplace OAuth flow.
    const err = new Error(
      'Welcome comms not available: agency private integration tokens cannot ' +
      'send messages on behalf of sub-accounts. Send the welcome email and SMS ' +
      'manually from inside the new sub-account.'
    );
    err.skipRetry = true;
    throw err;
  }

  async _step3WebsiteCreationStub(build, state, ctx) {
    if (!ctx.resumePayload) {
      throw new PauseSignal(3, {
        reason: 'stub_pause',
        message: 'Click Continue to proceed (M1 stub).',
      });
    }
    return { resumed: true, payload: ctx.resumePayload };
  }

  // ─── State reconstruction ─────────────────────────────────────────────────

  async _getStateFromPriorSteps(buildId, fromStep) {
    const build = queries.getBuildById(this.db, buildId);
    const state = {};

    if (build.location_id) {
      state.locationId = build.location_id;
    }

    if (fromStep <= 1) return state;

    const steps = queries.getBuildSteps(this.db, buildId);
    for (const step of steps) {
      if (step.step_number < fromStep && step.status === 'completed' && step.api_response) {
        try {
          const data = JSON.parse(step.api_response);
          Object.assign(state, data);
        } catch (_) {
          // ignore malformed JSON
        }
      }
    }

    return state;
  }
}
```

- [ ] **Step 4: Delete the old snapshots config**

Run: `rm server/config/snapshots.json`

- [ ] **Step 5: Run tests to verify PASS**

Run: `npx vitest run tests/server/build-runner.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: Some failures remain in `pause-resume.test.js` (step number 7 → 3). That's fixed in Task 4.

- [ ] **Step 7: Commit**

```bash
git add server/services/build-runner.js tests/server/build-runner.test.js
git rm server/config/snapshots.json
git commit -m "refactor(phase1): 2-step phase 1 with hard-coded snapshot + warning status"
```

---

## Task 4: Fix pause-resume durability test

**Files:**
- Modify: `tests/server/pause-resume.test.js`

- [ ] **Step 1: Update the assertion**

Find this block in `tests/server/pause-resume.test.js`:

```js
  it('persists pause state across runner instances (simulates server restart)', async () => {
    const id = seedBuild(db);
    await runner.run(id, () => {});

    const paused = queries.getBuildById(db, id);
    expect(paused.status).toBe('paused');
    expect(paused.paused_at_step).toBe(7);
```

Replace with:

```js
  it('persists pause state across runner instances (simulates server restart)', async () => {
    const id = seedBuild(db);
    await runner.run(id, () => {});

    const paused = queries.getBuildById(db, id);
    expect(paused.status).toBe('paused');
    expect(paused.paused_at_step).toBe(3);
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/server/pause-resume.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 3: Run the full suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/server/pause-resume.test.js
git commit -m "test(phase1): update pause-resume to expect paused_at_step=3"
```

---

## Task 5: Remove DRY_RUN_GHL and fix retry range

**Files:**
- Modify: `server/routes/builds.js`
- Modify: `.env`

- [ ] **Step 1: Update retry step range**

In `server/routes/builds.js`, find:

```js
    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 7) {
      return res.status(400).json({ error: 'step must be a number between 1 and 7' });
    }
```

Replace with:

```js
    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 3) {
      return res.status(400).json({ error: 'step must be a number between 1 and 3' });
    }
```

- [ ] **Step 2: Remove DRY_RUN_GHL from env**

Read `.env`, then remove the line `DRY_RUN_GHL=1` (and only that line). Keep everything else (`GHL_AGENCY_API_KEY`, `GHL_COMPANY_ID`, `PORT`, `SESSION_SECRET`).

- [ ] **Step 3: Run full suite**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add server/routes/builds.js .env
git commit -m "chore(phase1): remove DRY_RUN_GHL flag and update retry range to 1-3"
```

---

## Task 6: Update useSSE hook to new 3-step shape

**Files:**
- Modify: `src/hooks/useSSE.js`

- [ ] **Step 1: Update DEFAULT_PHASES**

In `src/hooks/useSSE.js`, find the `DEFAULT_PHASES` constant and replace it with:

```js
const DEFAULT_PHASES = [
  {
    id: 1,
    name: 'GHL Sub-Account Setup',
    steps: [
      { step: 1, name: 'Create Sub-Account' },
      { step: 2, name: 'Send Welcome Comms' },
    ],
  },
  {
    id: 2,
    name: 'Website Build',
    steps: [
      { step: 3, name: 'Website Creation (Manual)' },
    ],
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useSSE.js
git commit -m "feat(phase1): update useSSE DEFAULT_PHASES to 2-step phase 1"
```

---

## Task 7: Render warning status in ProgressTracker

**Files:**
- Modify: `src/components/ProgressTracker.jsx`

- [ ] **Step 1: Add warning handling to StepCircle**

In `src/components/ProgressTracker.jsx`, find the `StepCircle` function and replace it with:

```jsx
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
  if (status === 'warning') {
    return (
      <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold">!</span>
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
```

- [ ] **Step 2: Update phaseStatusLabel to treat warning as completed**

In the same file, find `phaseStatusLabel` and replace it with:

```jsx
function phaseStatusLabel(phase) {
  const done = (s) => s.status === 'completed' || s.status === 'warning';
  if (phase.steps.every(done)) return 'Completed';
  if (phase.steps.some((s) => s.status === 'failed')) return 'Failed';
  if (phase.steps.some((s) => s.status === 'running')) return 'In Progress';
  if (phase.steps.every((s) => s.status === 'pending')) return 'Pending';
  return 'In Progress';
}
```

- [ ] **Step 3: Render warning row in the step list**

In the same file, find the step rendering block that starts with `{step.status === 'completed' && step.duration_ms != null && (` and add a new branch below it. Replace:

```jsx
                    {step.status === 'completed' && step.duration_ms != null && (
                      <p className="text-xs text-green-600 mt-0.5">
                        Completed · {formatDuration(step.duration_ms)}
                      </p>
                    )}
                    {step.status === 'failed' && (
```

with:

```jsx
                    {step.status === 'completed' && step.duration_ms != null && (
                      <p className="text-xs text-green-600 mt-0.5">
                        Completed · {formatDuration(step.duration_ms)}
                      </p>
                    )}
                    {step.status === 'warning' && (
                      <div className="mt-1">
                        <p className="text-xs text-yellow-700 font-semibold">
                          Completed with warning
                        </p>
                        {step.error && (
                          <p className="text-xs text-yellow-600 mt-0.5 break-words">{step.error}</p>
                        )}
                      </div>
                    )}
                    {step.status === 'failed' && (
```

Also update the step name color line in the same block. Find:

```jsx
                    <p className={`text-sm font-medium leading-tight ${
                      step.status === 'pending'   ? 'text-gray-500' :
                      step.status === 'running'   ? 'text-magenta' :
                      step.status === 'completed' ? 'text-gray-800' :
                      step.status === 'failed'    ? 'text-gray-800' : 'text-gray-500'
                    }`}>
                      {step.name}
                    </p>
```

Replace with:

```jsx
                    <p className={`text-sm font-medium leading-tight ${
                      step.status === 'pending'   ? 'text-gray-500' :
                      step.status === 'running'   ? 'text-magenta' :
                      step.status === 'completed' ? 'text-gray-800' :
                      step.status === 'warning'   ? 'text-gray-800' :
                      step.status === 'failed'    ? 'text-gray-800' : 'text-gray-500'
                    }`}>
                      {step.name}
                    </p>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ProgressTracker.jsx
git commit -m "feat(phase1): render warning step status in progress tracker"
```

---

## Task 8: Remove Industry dropdown from form

**Files:**
- Modify: `src/components/BuildForm.jsx`

- [ ] **Step 1: Drop industry from validation**

In `src/components/BuildForm.jsx`, find the `validate` function. Remove the line:

```js
  if (!fields.industry) errors.industry = 'Industry is required.';
```

(Delete just that one line. Leave the rest of `validate` alone.)

- [ ] **Step 2: Hard-code industry on initial form**

Find `INITIAL_FORM` and change:

```js
  industry: '',
```

to:

```js
  industry: 'general',
```

- [ ] **Step 3: Remove the Industry dropdown JSX**

Find this block in the rendered form (search for `label="Industry"`):

```jsx
            <Field label="Industry" error={errors.industry}>
              <select
                className={inputClass}
                name="industry"
                value={form.industry}
                onChange={handleChange}
                onBlur={handleBlur}
              >
                <option value="">Select industry…</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind.value} value={ind.value}>{ind.label}</option>
                ))}
              </select>
            </Field>
```

Delete the entire `<Field ...>` block and everything inside it. If its parent grid-wrapper now has an odd number of children that breaks the layout, leave the wrapper alone — the other fields will reflow fine since the grid is responsive.

- [ ] **Step 4: Drop the INDUSTRIES constant**

Find and delete the `INDUSTRIES` constant at the top of the file:

```js
const INDUSTRIES = [
  { value: 'construction', label: 'Construction' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'general', label: 'General' },
];
```

- [ ] **Step 5: Sanity check the build**

Run: `npm run build`
Expected: Vite builds without errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/BuildForm.jsx
git commit -m "feat(phase1): remove industry dropdown, hard-code industry=general"
```

---

## Task 9: Manual end-to-end verification against real GHL

**Files:** none (operator-driven verification against the user's real GHL agency)

- [ ] **Step 1: Confirm test state**

Run: `npx vitest run`
Expected: All tests PASS.

- [ ] **Step 2: Start the app**

Run: `npm run dev:all`
Expected: server on :3003, Vite on :5174.

- [ ] **Step 3: Clean up prior test sub-accounts in GHL**

Operator action: log into the GHL agency dashboard and delete any leftover test sub-accounts named `VO360 Test Co`, `API Test Co`, or `PROBE TEST DELETE ME`. This keeps the agency tidy and makes the next step's verification unambiguous.

- [ ] **Step 4: Create a fresh test build**

In the app: log in (password `vo360`), fill the form with:

- Business Name: `VO360 Snapshot Test`
- Business Phone: `5551234567`
- Business Email: an inbox the operator owns
- Address: `123 Main St`, City: `Miami`, State: `FL`, Zip: `33101`, Country: `US`
- Timezone: `America/New_York`
- Phone Area Code: `305`
- Website URL: leave blank
- Owner: `Test` `Client`

Click **Create Sub-Account**.

Expected in the Build Progress panel:
- Phase 1 → step 1 "Create Sub-Account" goes to ✓ completed.
- Phase 1 → step 2 "Send Welcome Comms" goes to ⚠ warning with the explanatory message.
- Phase 2 → step 3 "Website Creation (Manual)" pauses with the yellow "Waiting to continue" banner.

- [ ] **Step 5: Verify the snapshot was applied in GHL**

Operator action: open the new `VO360 Snapshot Test` sub-account in GHL. Verify that the snapshot content is present:
- Pipelines, opportunities stages, automations, templates, etc. — whatever the master snapshot `4XHJuEPYsk1xeUKcmrL9` is supposed to include — show up inside the sub-account.

If the snapshot content is missing or partial, stop and report back. Otherwise proceed.

- [ ] **Step 6: Resume to complete the build**

Back in the app, click **Continue**. The build should complete and flip to green "Build Complete!".

- [ ] **Step 7: Clean up**

Delete the `VO360 Snapshot Test` sub-account from GHL.

- [ ] **Step 8: Record verification**

Append a `## Verification Run — 2026-04-09` section to the spec documenting:
- Which snapshot ID was applied
- Confirmation that the snapshot content was visible in the GHL dashboard
- Confirmation that step 2 landed in `warning` status as expected
- Confirmation that Continue finished the build

Commit:

```bash
git add docs/superpowers/specs/2026-04-09-phase1-cleanup-design.md
git commit -m "docs(phase1): record real-GHL verification run"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|------------------|------|
| Replace snapshots.json with single constant | Task 3 (runner rewrite + delete file) |
| Delete step implementations 2–5 | Task 3 |
| Renumber stub from 7 to 3 | Task 1, Task 3, Task 4, Task 5, Task 6 |
| Update phases.config.js to 2-step Phase 1 | Task 1 |
| Best-effort step with `warning` status | Task 3 (runner), Task 7 (UI) |
| GHL v2 endpoint research | Done before plan; result drives Task 3's `_step2SendWelcomeComms` implementation |
| Remove Industry dropdown | Task 8 |
| Hard-code `industry: 'general'` on submit | Task 8 |
| Delete `DRY_RUN_GHL` flag and branches | Task 3 (removed from runner), Task 5 (removed from .env) |
| Update tests (phases.config, db, build-runner, pause-resume) | Tasks 1, 2, 3, 4 |
| End-to-end verification including visual snapshot confirmation | Task 9 |

**Placeholder scan:** No "TBD", "handle edge cases", or "similar to Task N" language. Every code block is complete and ready to paste.

**Type consistency:**
- `SNAPSHOT_ID` exported from `build-runner.js` in Task 3, imported by the test in the same task.
- `isStepOptional` added to `phases.config.js` in Task 1, imported by `build-runner.js` in Task 3.
- `warning` status used consistently in Tasks 3 (runner), 7 (ProgressTracker). `phaseStatusLabel` treats warning as completed.
- `DEFAULT_PHASES` shape in Task 6 matches the `PHASES` shape in Task 1 (phase → steps with `step` and `name`).
- Retry range 1–3 in Task 5 matches step numbers from Task 1.

Plan is internally consistent.

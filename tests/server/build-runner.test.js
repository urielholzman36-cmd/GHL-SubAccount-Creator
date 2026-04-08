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

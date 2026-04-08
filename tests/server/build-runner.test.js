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

    const phaseStart1 = events.find((e) => e.type === 'phase-start' && e.phase === 1);
    const phaseComplete1 = events.find((e) => e.type === 'phase-complete' && e.phase === 1);
    const phaseStart2 = events.find((e) => e.type === 'phase-start' && e.phase === 2);
    expect(phaseStart1).toBeDefined();
    expect(phaseComplete1).toBeDefined();
    expect(phaseStart2).toBeDefined();

    const pauseEvent = events.find((e) => e.type === 'build-paused');
    expect(pauseEvent).toBeDefined();
    expect(pauseEvent.step).toBe(7);

    expect(ghl.createLocation).toHaveBeenCalledTimes(1);
    expect(ghl.buyPhoneNumber).toHaveBeenCalledWith('loc-123', '305');
    expect(ghl.createPipeline).toHaveBeenCalledTimes(1);
    expect(ghl.createUser).toHaveBeenCalledTimes(1);
    expect(ghl.createContact).toHaveBeenCalledTimes(1);
    expect(ghl.sendMessage).toHaveBeenCalledTimes(2);
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

  it('emits step-update events for each executed step', async () => {
    const build = createTestBuild(db);
    const events = [];
    await runner.run(build.id, (event) => events.push(event));

    const running = events.filter((e) => e.type === 'step-update' && e.status === 'running');
    const completed = events.filter((e) => e.type === 'step-update' && e.status === 'completed');
    expect(running.length).toBe(7); // 6 phase 1 + 1 stub phase 2
    expect(completed.length).toBe(6); // stub pauses instead of completing
  });

  it('can retry from a failed step and continue to pause at step 7', async () => {
    const build = createTestBuild(db);
    ghl.buyPhoneNumber.mockRejectedValueOnce(new Error('fail'));
    ghl.buyPhoneNumber.mockRejectedValueOnce(new Error('fail'));
    ghl.buyPhoneNumber.mockRejectedValueOnce(new Error('fail'));
    ghl.buyPhoneNumber.mockRejectedValueOnce(new Error('fail'));
    await runner.run(build.id, () => {});
    expect(queries.getBuildById(db, build.id).status).toBe('failed');

    ghl.buyPhoneNumber.mockResolvedValue({ phoneNumber: { id: 'ph-1', number: '+13051234567' } });
    await runner.retryFromStep(build.id, 2, () => {});

    const updated = queries.getBuildById(db, build.id);
    expect(updated.status).toBe('paused');
    expect(updated.paused_at_step).toBe(7);
  });
});

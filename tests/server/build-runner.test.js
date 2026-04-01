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
    runner = new BuildRunner(db, ghl, { backoffMs: [10, 20, 40] });
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
    expect(ghl.sendMessage).toHaveBeenCalledTimes(2);
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
    ghl.buyPhoneNumber.mockRejectedValueOnce(new Error('fail'));
    ghl.buyPhoneNumber.mockRejectedValueOnce(new Error('fail'));
    ghl.buyPhoneNumber.mockRejectedValueOnce(new Error('fail'));
    ghl.buyPhoneNumber.mockRejectedValueOnce(new Error('fail'));
    await runner.run(build.id, () => {});

    ghl.buyPhoneNumber.mockResolvedValue({ phoneNumber: { id: 'ph-1', number: '+13051234567' } });
    const events = [];
    await runner.retryFromStep(build.id, 2, (event) => events.push(event));

    const updatedBuild = queries.getBuildById(db, build.id);
    expect(updatedBuild.status).toBe('completed');
  });
});

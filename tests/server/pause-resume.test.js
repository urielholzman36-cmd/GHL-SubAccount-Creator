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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeDb } from '../../server/db/index.js';
import * as queries from '../../server/db/queries.js';
import { BuildRunner, SNAPSHOT_ID } from '../../server/services/build-runner.js';

const TEST_CRED_KEY = 'a'.repeat(64);

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
    area_code: '305', website_url: null,
  };
  queries.insertBuild(db, build);
  queries.createBuildSteps(db, build.id);
  db.prepare(`UPDATE builds SET industry_text = ?, target_audience = ?, brand_colors = ? WHERE id = ?`).run(
    'Test industry', 'Test audience', JSON.stringify(['#111111', '#222222']), build.id
  );
  return build;
}

describe('BuildRunner — M2a', () => {
  let db, ghl, runner, promptGen;

  beforeEach(() => {
    process.env.CREDENTIALS_KEY = TEST_CRED_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-fake';
    db = createTestDb();
    initializeDb(db);
    ghl = createMockGhl();
    promptGen = vi.fn().mockResolvedValue('FAKE TEN-WEB PROMPT TEXT');
    runner = new BuildRunner(db, ghl, {
      backoffMs: [10, 20, 40],
      generatePromptImpl: (build) => promptGen(build),
    });
  });

  it('step 1 creates location with the hard-coded snapshot id', async () => {
    const build = createTestBuild(db);
    await runner.run(build.id, () => {});

    expect(ghl.createLocation).toHaveBeenCalledTimes(1);
    const arg = ghl.createLocation.mock.calls[0][0];
    expect(arg.snapshotId).toBe(SNAPSHOT_ID);
  });

  it('step 2 welcome comms warns (unchanged from phase 1 cleanup)', async () => {
    const build = createTestBuild(db);
    await runner.run(build.id, () => {});
    const steps = queries.getBuildSteps(db, build.id);
    expect(steps[1].status).toBe('warning');
  });

  it('step 3 generates the prompt and stores it on the build row', async () => {
    const build = createTestBuild(db);
    await runner.run(build.id, () => {});

    expect(promptGen).toHaveBeenCalledTimes(1);
    const row = queries.getBuildById(db, build.id);
    expect(row.tenweb_prompt).toBe('FAKE TEN-WEB PROMPT TEXT');

    const steps = queries.getBuildSteps(db, build.id);
    expect(steps[2].status).toBe('completed');
  });

  it('step 4 pauses with the generated prompt in the context', async () => {
    const build = createTestBuild(db);
    const events = [];
    await runner.run(build.id, (e) => events.push(e));

    const pauseEvent = events.find((e) => e.type === 'build-paused');
    expect(pauseEvent).toBeDefined();
    expect(pauseEvent.step).toBe(4);
    expect(pauseEvent.context.reason).toBe('awaiting_website');
    expect(pauseEvent.context.prompt).toBe('FAKE TEN-WEB PROMPT TEXT');

    const row = queries.getBuildById(db, build.id);
    expect(row.status).toBe('paused');
    expect(row.paused_at_step).toBe(4);
  });

  it('resume with WP credentials encrypts the password and completes', async () => {
    const build = createTestBuild(db);
    await runner.run(build.id, () => {});
    expect(queries.getBuildById(db, build.id).status).toBe('paused');

    await runner.resume(build.id, {
      wp_url: 'https://example.com',
      wp_username: 'admin',
      wp_password: 'secret-app-pass',
    }, () => {});

    const row = queries.getBuildById(db, build.id);
    expect(row.status).toBe('completed');
    expect(row.wp_url).toBe('https://example.com');
    expect(row.wp_username).toBe('admin');
    expect(row.wp_password_encrypted).toBeTruthy();
    expect(row.wp_password_encrypted).not.toBe('secret-app-pass');
    expect(row.wp_password_encrypted).toContain(':');
  });

  it('resume with missing credentials fails the step', async () => {
    const build = createTestBuild(db);
    await runner.run(build.id, () => {});

    await runner.resume(build.id, { wp_url: 'https://example.com' }, () => {});

    const row = queries.getBuildById(db, build.id);
    expect(row.status).toBe('failed');
    const steps = queries.getBuildSteps(db, build.id);
    expect(steps[3].status).toBe('failed');
  });

  it('step 3 failure marks build failed', async () => {
    const build = createTestBuild(db);
    promptGen.mockRejectedValue(new Error('Claude down'));

    await runner.run(build.id, () => {});
    const row = queries.getBuildById(db, build.id);
    expect(row.status).toBe('failed');
    const steps = queries.getBuildSteps(db, build.id);
    expect(steps[2].status).toBe('failed');
  });
});

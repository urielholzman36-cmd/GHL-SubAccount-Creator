import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeDb } from '../../server/db/index.js';
import * as queries from '../../server/db/queries.js';
import { BuildRunner, SNAPSHOT_ID } from '../../server/services/build-runner.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_CRED_KEY = 'a'.repeat(64);

function createMockGhl() {
  return {
    createLocation: vi.fn().mockResolvedValue({ location: { id: 'loc-123' } }),
  };
}

/**
 * Creates a mock fetch that satisfies all WordPress API calls.
 */
function createMockWpFetch() {
  let pageIdCounter = 100;
  return vi.fn().mockImplementation(async (url, opts) => {
    const method = opts?.method || 'GET';

    // validateConnection — GET settings
    if (url.includes('/wp/v2/settings') && method === 'GET') {
      return { ok: true, json: async () => ({ title: 'Test Site' }), text: async () => '{}' };
    }

    // setSiteLogo — POST settings
    if (url.includes('/wp/v2/settings') && method === 'POST') {
      return { ok: true, json: async () => ({}), text: async () => '{}' };
    }

    // installPlugin
    if (url.includes('/wp/v2/plugins') && method === 'POST') {
      return { ok: true, json: async () => ({ slug: 'test', status: 'active' }), text: async () => '{}' };
    }

    // uploadMedia
    if (url.includes('/wp/v2/media') && method === 'POST') {
      return { ok: true, json: async () => ({ id: 42, source_url: 'https://example.com/logo.png' }), text: async () => '{}' };
    }

    // deleteTemplate
    if (url.includes('/wp/v2/templates/') && method === 'DELETE') {
      return { ok: true, json: async () => ({}), text: async () => '{}' };
    }

    // createPage
    if (url.includes('/wp/v2/pages') && method === 'POST') {
      const id = ++pageIdCounter;
      return { ok: true, json: async () => ({ id, link: `https://example.com/page-${id}` }), text: async () => '{}' };
    }

    // getCustomCSS
    if (url.includes('/wp/v2/custom_css') && method === 'GET') {
      return { ok: true, json: async () => ([{ id: 1, content: { raw: '/* existing */' } }]), text: async () => '[]' };
    }

    // setCustomCSS (PUT or POST)
    if (url.includes('/wp/v2/custom_css') && (method === 'PUT' || method === 'POST')) {
      return { ok: true, json: async () => ({}), text: async () => '{}' };
    }

    return { ok: true, json: async () => ({}), text: async () => '{}' };
  });
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

/**
 * Builds a runner with all WP/content mocks injected so the full pipeline can complete.
 */
function createFullRunner(db, ghl, opts = {}) {
  const wpFetch = opts.wpFetchImpl || createMockWpFetch();
  return {
    runner: new BuildRunner(db, ghl, {
      backoffMs: [10, 20, 40],
      generatePromptImpl: opts.generatePromptImpl || vi.fn().mockResolvedValue('FAKE TEN-WEB PROMPT TEXT'),
      wpFetchImpl: wpFetch,
      generateLegalImpl: opts.generateLegalImpl || vi.fn().mockResolvedValue({
        privacyPolicy: '<p>Privacy Policy HTML</p>',
        termsOfService: '<p>Terms of Service HTML</p>',
      }),
      generateFAQImpl: opts.generateFAQImpl || vi.fn().mockResolvedValue('<div class="faq-item">FAQ HTML</div>'),
      generateCSSImpl: opts.generateCSSImpl || vi.fn().mockResolvedValue('body { color: red; }'),
    }),
    wpFetch,
  };
}

/**
 * Helper: run a build through step 3 pause, then resume with WP creds + a logo file.
 * Returns the resumed build row.
 */
async function runThroughResume(db, ghl, opts = {}) {
  const build = createTestBuild(db, opts.buildId || 'build-full-1');
  const { runner, wpFetch } = createFullRunner(db, ghl, opts);

  // Set up logo_path (write a tiny temp file)
  const projectRoot = path.resolve(__dirname, '..', '..');
  const logoDir = path.join(projectRoot, 'data', 'logos');
  fs.mkdirSync(logoDir, { recursive: true });
  const logoPath = `data/logos/${build.id}.png`;
  fs.writeFileSync(path.join(projectRoot, logoPath), Buffer.from('fake-png'));
  db.prepare('UPDATE builds SET logo_path = ? WHERE id = ?').run(logoPath, build.id);

  // Run — will pause at step 3
  await runner.run(build.id, () => {});
  expect(queries.getBuildById(db, build.id).status).toBe('paused');

  // Resume with WP credentials
  const events = [];
  await runner.resume(build.id, {
    wp_url: 'https://example.com',
    wp_username: 'admin',
    wp_password: 'secret-app-pass',
  }, (e) => events.push(e));

  // Clean up temp logo
  try { fs.unlinkSync(path.join(projectRoot, logoPath)); } catch (_) {}

  return { build, runner, wpFetch, events };
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

  it('step 2 generates the prompt and stores it on the build row', async () => {
    const build = createTestBuild(db);
    await runner.run(build.id, () => {});

    expect(promptGen).toHaveBeenCalledTimes(1);
    const row = queries.getBuildById(db, build.id);
    expect(row.tenweb_prompt).toBe('FAKE TEN-WEB PROMPT TEXT');

    const steps = queries.getBuildSteps(db, build.id);
    expect(steps[1].status).toBe('completed');
  });

  it('step 3 pauses with the generated prompt in the context', async () => {
    const build = createTestBuild(db);
    const events = [];
    await runner.run(build.id, (e) => events.push(e));

    const pauseEvent = events.find((e) => e.type === 'build-paused');
    expect(pauseEvent).toBeDefined();
    expect(pauseEvent.step).toBe(3);
    expect(pauseEvent.context.reason).toBe('awaiting_website');
    expect(pauseEvent.context.prompt).toBe('FAKE TEN-WEB PROMPT TEXT');

    const row = queries.getBuildById(db, build.id);
    expect(row.status).toBe('paused');
    expect(row.paused_at_step).toBe(3);
  });

  it('resume with WP credentials encrypts the password and continues through all steps', async () => {
    const { build } = await runThroughResume(db, ghl);

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
    expect(steps[2].status).toBe('failed');
  });

  it('step 2 failure marks build failed', async () => {
    const build = createTestBuild(db);
    promptGen.mockRejectedValue(new Error('Claude down'));

    await runner.run(build.id, () => {});
    const row = queries.getBuildById(db, build.id);
    expect(row.status).toBe('failed');
    const steps = queries.getBuildSteps(db, build.id);
    expect(steps[1].status).toBe('failed');
  });
});

describe('BuildRunner — M2b (Steps 4-10)', () => {
  let db, ghl;

  beforeEach(() => {
    process.env.CREDENTIALS_KEY = TEST_CRED_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-fake';
    db = createTestDb();
    initializeDb(db);
    ghl = createMockGhl();
  });

  it('step 4 validates the WordPress connection', async () => {
    const { events } = await runThroughResume(db, ghl);

    const step4 = events.find((e) => e.type === 'step-update' && e.step === 4 && e.status === 'completed');
    expect(step4).toBeDefined();
  });

  it('step 5 installs 3 plugins', async () => {
    const { events } = await runThroughResume(db, ghl);

    const step5 = events.find((e) => e.type === 'step-update' && e.step === 5 && e.status === 'completed');
    expect(step5).toBeDefined();

    // Check the step result stored in DB
    const steps = queries.getBuildSteps(db, 'build-full-1');
    const step5Row = steps.find((s) => s.step_number === 5);
    const result = JSON.parse(step5Row.api_response);
    expect(result.pluginsInstalled).toHaveLength(3);
    expect(result.pluginsInstalled.map((p) => p.slug)).toEqual(['allaccessible', 'leadconnector', 'wp-call-button']);
  });

  it('step 5 continues even if a plugin install fails', async () => {
    let callCount = 0;
    const wpFetch = createMockWpFetch();
    // Override: fail the second plugin install call
    const origFetch = wpFetch.getMockImplementation();
    wpFetch.mockImplementation(async (url, opts) => {
      if (url.includes('/wp/v2/plugins') && opts?.method === 'POST') {
        callCount++;
        if (callCount === 2) {
          return { ok: false, text: async () => 'Plugin not found', json: async () => ({}) };
        }
      }
      return origFetch(url, opts);
    });

    const { events } = await runThroughResume(db, ghl, { wpFetchImpl: wpFetch, buildId: 'build-plugin-fail' });

    const step5 = events.find((e) => e.type === 'step-update' && e.step === 5 && e.status === 'completed');
    expect(step5).toBeDefined();

    const steps = queries.getBuildSteps(db, 'build-plugin-fail');
    const step5Row = steps.find((s) => s.step_number === 5);
    const result = JSON.parse(step5Row.api_response);
    const failed = result.pluginsInstalled.find((p) => p.status === 'failed');
    expect(failed).toBeDefined();
  });

  it('step 7 (optional) produces warning on failure without stopping the build', async () => {
    const build = createTestBuild(db, 'build-header-fail');
    const wpFetch = createMockWpFetch();
    const { runner } = createFullRunner(db, ghl, { wpFetchImpl: wpFetch, buildId: 'build-header-fail' });

    // Monkey-patch _step7FixHeader to throw
    runner._step7FixHeader = async () => { throw new Error('Template delete boom'); };

    // Set up logo
    const projectRoot = path.resolve(__dirname, '..', '..');
    const logoDir = path.join(projectRoot, 'data', 'logos');
    fs.mkdirSync(logoDir, { recursive: true });
    const logoPath = `data/logos/${build.id}.png`;
    fs.writeFileSync(path.join(projectRoot, logoPath), Buffer.from('fake-png'));
    db.prepare('UPDATE builds SET logo_path = ? WHERE id = ?').run(logoPath, build.id);

    // Run to pause
    await runner.run(build.id, () => {});

    // Resume
    const events = [];
    await runner.resume(build.id, {
      wp_url: 'https://example.com',
      wp_username: 'admin',
      wp_password: 'secret-app-pass',
    }, (e) => events.push(e));

    try { fs.unlinkSync(path.join(projectRoot, logoPath)); } catch (_) {}

    // Step 7 should be a warning
    const step7 = events.find((e) => e.type === 'step-update' && e.step === 7 && e.status === 'warning');
    expect(step7).toBeDefined();
    expect(step7.error).toContain('Template delete boom');

    // Build should still complete
    const row = queries.getBuildById(db, 'build-header-fail');
    expect(row.status).toBe('completed');
  });

  it('step 10 publishes 3 pages and stores URLs in DB', async () => {
    const { build } = await runThroughResume(db, ghl);

    const row = queries.getBuildById(db, build.id);
    expect(row.privacy_policy_url).toBeTruthy();
    expect(row.terms_url).toBeTruthy();
    expect(row.faq_url).toBeTruthy();
    expect(row.privacy_policy_url).toContain('https://example.com/page-');
    expect(row.terms_url).toContain('https://example.com/page-');
    expect(row.faq_url).toContain('https://example.com/page-');
  });

  it('full pipeline from step 1 through 10 completes successfully', async () => {
    const { build, events } = await runThroughResume(db, ghl);

    const row = queries.getBuildById(db, build.id);
    expect(row.status).toBe('completed');

    // Verify all 10 steps completed
    const steps = queries.getBuildSteps(db, build.id);
    for (let i = 0; i < 10; i++) {
      expect(steps[i].step_number).toBe(i + 1);
      expect(steps[i].status).toBe('completed');
    }

    // Verify phase events
    const phaseStarts = events.filter((e) => e.type === 'phase-start');
    // On resume from step 3, we should see phase 2 and phase 3 start events
    expect(phaseStarts.length).toBeGreaterThanOrEqual(2);

    const phaseCompletes = events.filter((e) => e.type === 'phase-complete');
    expect(phaseCompletes.length).toBeGreaterThanOrEqual(2);
  });

  it('step 6 throws skipRetry when no logo_path is set', async () => {
    const build = createTestBuild(db, 'build-no-logo');
    const { runner } = createFullRunner(db, ghl);

    // Run to pause
    await runner.run(build.id, () => {});

    // Resume — no logo_path set, so step 6 should fail
    const events = [];
    await runner.resume(build.id, {
      wp_url: 'https://example.com',
      wp_username: 'admin',
      wp_password: 'secret-app-pass',
    }, (e) => events.push(e));

    const row = queries.getBuildById(db, build.id);
    expect(row.status).toBe('failed');

    const steps = queries.getBuildSteps(db, build.id);
    const step6 = steps.find((s) => s.step_number === 6);
    expect(step6.status).toBe('failed');
    expect(step6.error_message).toContain('logo_path');
  });
});

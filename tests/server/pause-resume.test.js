import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeDb } from '../../server/db/index.js';
import * as queries from '../../server/db/queries.js';
import { BuildRunner } from '../../server/services/build-runner.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function createMockWpFetch() {
  let pageIdCounter = 200;
  return vi.fn().mockImplementation(async (url, opts) => {
    const method = opts?.method || 'GET';
    if (url.includes('/wp/v2/settings')) return { ok: true, json: async () => ({}), text: async () => '{}' };
    if (url.includes('/wp/v2/plugins')) return { ok: true, json: async () => ({ slug: 'test', status: 'active' }), text: async () => '{}' };
    if (url.includes('/wp/v2/media')) return { ok: true, json: async () => ({ id: 42, source_url: 'https://example.com/logo.png' }), text: async () => '{}' };
    if (url.includes('/wp/v2/templates/')) return { ok: true, json: async () => ({}), text: async () => '{}' };
    if (url.includes('/wp/v2/pages')) { const id = ++pageIdCounter; return { ok: true, json: async () => ({ id, link: `https://example.com/page-${id}` }), text: async () => '{}' }; }
    if (url.includes('/wp/v2/custom_css') && method === 'GET') return { ok: true, json: async () => ([{ id: 1, content: { raw: '' } }]), text: async () => '[]' };
    if (url.includes('/wp/v2/custom_css')) return { ok: true, json: async () => ({}), text: async () => '{}' };
    return { ok: true, json: async () => ({}), text: async () => '{}' };
  });
}

function fullRunnerOpts() {
  return {
    backoffMs: [1, 1, 1],
    generatePromptImpl: async () => 'fake prompt',
    wpFetchImpl: createMockWpFetch(),
    generateLegalImpl: vi.fn().mockResolvedValue({ privacyPolicy: '<p>PP</p>', termsOfService: '<p>TOS</p>' }),
    generateFAQImpl: vi.fn().mockResolvedValue('<div>FAQ</div>'),
    generateCSSImpl: vi.fn().mockResolvedValue('body{}'),
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

  // Set up logo file for step 6
  const projectRoot = path.resolve(__dirname, '..', '..');
  const logoDir = path.join(projectRoot, 'data', 'logos');
  fs.mkdirSync(logoDir, { recursive: true });
  const logoPath = `data/logos/${id}.png`;
  fs.writeFileSync(path.join(projectRoot, logoPath), Buffer.from('fake-png'));
  db.prepare('UPDATE builds SET logo_path = ? WHERE id = ?').run(logoPath, id);

  return id;
}

describe('Pause/resume durability', () => {
  let db, runner;

  beforeEach(() => {
    process.env.CREDENTIALS_KEY = 'a'.repeat(64);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-fake';
    db = createTestDb();
    initializeDb(db);
    runner = new BuildRunner(db, mockGhl(), fullRunnerOpts());
  });

  it('persists pause state across runner instances (simulates server restart)', async () => {
    const id = seedBuild(db);
    await runner.run(id, () => {});

    const paused = queries.getBuildById(db, id);
    expect(paused.status).toBe('paused');
    expect(paused.paused_at_step).toBe(3);

    // Simulate server restart: brand new runner instance, same db
    const freshRunner = new BuildRunner(db, mockGhl(), fullRunnerOpts());
    await freshRunner.resume(id, {
      wp_url: 'https://example.com',
      wp_username: 'admin',
      wp_password: 'fake-pass',
    }, () => {});

    // Clean up temp logo
    const projectRoot = path.resolve(__dirname, '..', '..');
    try { fs.unlinkSync(path.join(projectRoot, `data/logos/${id}.png`)); } catch (_) {}

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

import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
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
    expect(steps).toHaveLength(10);
    expect(steps[0].step_name).toBe('Create Sub-Account');
    expect(steps[1].step_name).toBe('Generate 10web Prompt');
    expect(steps[2].step_name).toBe('Website Creation (Manual)');
    expect(steps[3].step_name).toBe('Validate WordPress');
    expect(steps[4].step_name).toBe('Install Plugins');
    expect(steps[5].step_name).toBe('Upload Logo');
    expect(steps[6].step_name).toBe('Fix Header');
    expect(steps[7].step_name).toBe('Generate Legal Pages');
    expect(steps[8].step_name).toBe('Generate FAQ');
    expect(steps[9].step_name).toBe('Publish Pages');
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

  describe('M1 schema extensions', () => {
    it('builds table has paused_at_step and pause_context columns', () => {
      const cols = db.prepare("PRAGMA table_info(builds)").all().map((c) => c.name);
      expect(cols).toContain('paused_at_step');
      expect(cols).toContain('pause_context');
    });

    it('build_steps table has phase column defaulting to 1', () => {
      const cols = db.prepare("PRAGMA table_info(build_steps)").all();
      const phaseCol = cols.find((c) => c.name === 'phase');
      expect(phaseCol).toBeDefined();
      expect(phaseCol.dflt_value).toBe('1');
    });

    it('createBuildSteps inserts all 10 steps with correct phase numbers', () => {
      queries.insertBuild(db, {
        id: 'b-phases', business_name: 'X', business_email: 'x@y.com', business_phone: '5551234567',
        address: '', city: '', state: '', zip: '', country: 'US',
        industry: 'general', timezone: 'America/New_York',
        owner_first_name: 'A', owner_last_name: 'B', area_code: '305', website_url: null,
      });
      queries.createBuildSteps(db, 'b-phases');
      const steps = queries.getBuildSteps(db, 'b-phases');
      expect(steps).toHaveLength(10);
      expect(steps[0].phase).toBe(1);
      expect(steps[1].phase).toBe(2);
      expect(steps[2].phase).toBe(2);
      expect(steps[2].step_name).toBe('Website Creation (Manual)');
      expect(steps[3].phase).toBe(3);
      expect(steps[4].phase).toBe(3);
      expect(steps[5].phase).toBe(3);
      expect(steps[6].phase).toBe(3);
      expect(steps[7].phase).toBe(3);
      expect(steps[8].phase).toBe(3);
      expect(steps[9].phase).toBe(3);
      expect(steps[9].step_name).toBe('Publish Pages');
    });

    it('setPauseState / clearPauseState persist on the builds row', () => {
      queries.insertBuild(db, {
        id: 'b-pause', business_name: 'Y', business_email: 'y@z.com', business_phone: '5551234567',
        address: '', city: '', state: '', zip: '', country: 'US',
        industry: 'general', timezone: 'America/New_York',
        owner_first_name: 'A', owner_last_name: 'B', area_code: '305', website_url: null,
      });
      queries.setPauseState(db, 'b-pause', 7, { reason: 'stub_pause' });
      let row = queries.getBuildById(db, 'b-pause');
      expect(row.status).toBe('paused');
      expect(row.paused_at_step).toBe(7);
      expect(JSON.parse(row.pause_context)).toEqual({ reason: 'stub_pause' });

      queries.clearPauseState(db, 'b-pause');
      row = queries.getBuildById(db, 'b-pause');
      expect(row.paused_at_step).toBeNull();
      expect(row.pause_context).toBeNull();
    });
  });

  describe('M2a schema extensions', () => {
    it('builds table has all new M2a columns', () => {
      const cols = db.prepare("PRAGMA table_info(builds)").all().map((c) => c.name);
      expect(cols).toContain('industry_text');
      expect(cols).toContain('target_audience');
      expect(cols).toContain('logo_path');
      expect(cols).toContain('brand_colors');
      expect(cols).toContain('tenweb_prompt');
      expect(cols).toContain('wp_url');
      expect(cols).toContain('wp_username');
      expect(cols).toContain('wp_password_encrypted');
    });
  });

  describe('M2b schema extensions', () => {
    it('builds table has all new M2b columns', () => {
      const cols = db.prepare("PRAGMA table_info(builds)").all().map((c) => c.name);
      expect(cols).toContain('privacy_policy_url');
      expect(cols).toContain('terms_url');
      expect(cols).toContain('faq_url');
    });
  });
});

describe('page_prompts migration', () => {
  let db;
  beforeAll(async () => {
    const { createClient } = await import('@libsql/client');
    db = createClient({ url: 'file::memory:' });
    await initializeDb(db);
  });

  it('creates page_prompts table with expected columns', async () => {
    const info = await db.execute("PRAGMA table_info(page_prompts)");
    const cols = info.rows.map((r) => r.name);
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'client_id', 'build_id', 'page_type',
      'page_name', 'page_slug', 'user_notes',
      'generated_prompt', 'brand_snapshot_json',
      'created_at', 'updated_at',
    ]));
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeSocialTables } from '../../server/db/social-schema.js';
import {
  createClient,
  createCampaign,
  getCampaign,
  updateCampaignStatus,
} from '../../server/db/social-queries.js';
import { SOCIAL_STEPS, PauseSignal, SocialRunner } from '../../server/services/social-runner.js';

describe('SocialRunner', () => {
  let db;
  let clientId;
  let campaignId;
  let events;
  let emit;

  beforeEach(() => {
    process.env.DRY_RUN = 'true';

    db = createTestDb();
    db.pragma('foreign_keys = ON');
    initializeSocialTables(db);

    clientId = createClient(db, {
      name: 'Test Client',
      industry: 'Real Estate',
      location: 'Miami, FL',
      website: 'https://example.com',
      brand_tone: 'Professional',
      brand_description: 'A test real estate company',
      target_audience: 'Home buyers',
      services: '["Buying","Selling"]',
      content_pillars: '["PAIN","SOLUTION","AUTHORITY","PROOF","CTA"]',
      hashtag_bank: '["#realestate","#miami"]',
      cta_style: 'Call us today',
      platforms: '["facebook","instagram"]',
      posting_time: '09:00:00',
    });

    campaignId = createCampaign(db, {
      client_id: clientId,
      month: '2026-05',
      theme: 'Summer Sales',
      start_date: '2026-05-01',
    });

    events = [];
    emit = (e) => events.push(e);
  });

  describe('SOCIAL_STEPS', () => {
    it('has 7 entries', () => {
      expect(SOCIAL_STEPS).toHaveLength(7);
    });

    it('steps 4 and 7 are manual', () => {
      const manualSteps = SOCIAL_STEPS.filter((s) => s.manual);
      expect(manualSteps).toHaveLength(2);
      expect(manualSteps[0].number).toBe(4);
      expect(manualSteps[1].number).toBe(7);
    });
  });

  describe('PauseSignal', () => {
    it('has isPauseSignal = true', () => {
      const sig = new PauseSignal(4, { reason: 'review' });
      expect(sig.isPauseSignal).toBe(true);
      expect(sig.step).toBe(4);
      expect(sig.context).toEqual({ reason: 'review' });
    });
  });

  describe('constructor', () => {
    it('creates a runner with db and emit callback', () => {
      const runner = new SocialRunner(db, emit);
      expect(runner).toBeDefined();
      expect(runner.db).toBe(db);
      expect(runner.emit).toBe(emit);
    });
  });

  describe('runFromStep', () => {
    it('updates campaign status on step execution', async () => {
      const runner = new SocialRunner(db, emit);
      await runner.runFromStep(campaignId, 1);

      // Should have emitted step-update events
      const stepUpdates = events.filter((e) => e.type === 'step-update');
      expect(stepUpdates.length).toBeGreaterThan(0);
    });

    it('emits step-update events', async () => {
      const runner = new SocialRunner(db, emit);
      await runner.runFromStep(campaignId, 1);

      // Step 1 should have running + completed events
      const step1Running = events.find(
        (e) => e.type === 'step-update' && e.step === 1 && e.status === 'running',
      );
      const step1Completed = events.find(
        (e) => e.type === 'step-update' && e.step === 1 && e.status === 'completed',
      );
      expect(step1Running).toBeDefined();
      expect(step1Completed).toBeDefined();
    });

    it('pauses at step 4 (review strategy)', async () => {
      const runner = new SocialRunner(db, emit);
      await runner.runFromStep(campaignId, 1);

      const campaign = getCampaign(db, campaignId);
      expect(campaign.status).toBe('review_strategy');
      expect(campaign.current_step).toBe(4);

      const pauseEvent = events.find((e) => e.type === 'campaign-paused');
      expect(pauseEvent).toBeDefined();
      expect(pauseEvent.step).toBe(4);
    });
  });

  describe('resume', () => {
    it('resumes from step 4 and pauses at step 7', async () => {
      const runner = new SocialRunner(db, emit);

      // Run from step 1, pauses at step 4
      await runner.runFromStep(campaignId, 1);
      expect(getCampaign(db, campaignId).status).toBe('review_strategy');

      // Clear events
      events.length = 0;

      // Resume from step 4
      await runner.resume(campaignId, {});

      const campaign = getCampaign(db, campaignId);
      expect(campaign.status).toBe('review_final');
      expect(campaign.current_step).toBe(7);

      const pauseEvent = events.find((e) => e.type === 'campaign-paused');
      expect(pauseEvent).toBeDefined();
      expect(pauseEvent.step).toBe(7);
    });

    it('resume at step 7 exports and marks campaign exported', async () => {
      const runner = new SocialRunner(db, emit);

      // Run from step 1 → pause at 4
      await runner.runFromStep(campaignId, 1);

      // Resume → runs 5, 6, pause at 7
      await runner.resume(campaignId, {});
      expect(getCampaign(db, campaignId).status).toBe('review_final');

      // Clear events
      events.length = 0;

      // Resume at step 7 → export
      await runner.resume(campaignId, {});

      const campaign = getCampaign(db, campaignId);
      expect(campaign.status).toBe('exported');
    });
  });

  describe('retryFromStep', () => {
    it('calls runFromStep', async () => {
      const runner = new SocialRunner(db, emit);
      await runner.retryFromStep(campaignId, 1);

      const campaign = getCampaign(db, campaignId);
      // Should pause at step 4
      expect(campaign.status).toBe('review_strategy');
    });
  });
});

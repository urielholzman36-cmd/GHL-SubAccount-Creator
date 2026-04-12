import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSocialTables } from '../../server/db/social-schema.js';
import * as sq from '../../server/db/social-queries.js';
import { SocialRunner } from '../../server/services/social-runner.js';

describe('Social Planner Dry-Run E2E', () => {
  let db, clientId, campaignId;

  beforeEach(() => {
    process.env.DRY_RUN = 'true';
    db = new Database(':memory:');
    initializeSocialTables(db);
    clientId = sq.createClient(db, {
      name: 'Test Electrician',
      industry: 'Electrician',
      location: 'San Diego, CA',
      target_audience: 'Homeowners',
      services: '["EV Charger Install","Panel Upgrades"]',
      cloudinary_folder: 'test-client',
      brand_tone: 'professional, trustworthy',
      content_pillars: '["PAIN","SOLUTION","AUTHORITY","PROOF","CTA"]',
    });
    campaignId = sq.createCampaign(db, {
      client_id: clientId,
      month: '2026-04',
      theme: 'Spring EV charging push',
      start_date: '2026-04-12',
    });
  });

  it('runs steps 1-3 and generates 30 posts', async () => {
    const events = [];
    const runner = new SocialRunner(db, (e) => events.push(e));
    await runner.runFromStep(campaignId, 1);

    const campaign = sq.getCampaign(db, campaignId);
    expect(campaign.status).toBe('review_strategy');
    expect(campaign.research_brief).toBeTruthy();

    const posts = sq.listCampaignPosts(db, campaignId);
    expect(posts.length).toBe(30);
    expect(posts[0].caption).toBeTruthy();
    expect(posts[0].visual_prompt).toBeTruthy();
  });

  it('resumes from step 4 through step 7', async () => {
    const events = [];
    const runner = new SocialRunner(db, (e) => events.push(e));

    // Run to step 4 pause
    await runner.runFromStep(campaignId, 1);

    // Resume through steps 5-6, pause at 7
    await runner.resume(campaignId, { approved: true });

    const campaign = sq.getCampaign(db, campaignId);
    expect(campaign.status).toBe('review_final');
    expect(campaign.current_step).toBe(7);

    // Check images were generated (dry-run URLs)
    const posts = sq.listCampaignPosts(db, campaignId);
    const withImages = posts.filter(p => {
      const urls = JSON.parse(p.image_urls || '[]');
      return urls.length > 0;
    });
    expect(withImages.length).toBeGreaterThan(0);
  });

  it('exports CSV at step 7', async () => {
    const events = [];
    const runner = new SocialRunner(db, (e) => events.push(e));

    await runner.runFromStep(campaignId, 1);
    await runner.resume(campaignId, { approved: true });
    await runner.resume(campaignId, {});

    const campaign = sq.getCampaign(db, campaignId);
    expect(campaign.status).toBe('exported');
    expect(campaign.csv_path).toBeTruthy();
  });
});

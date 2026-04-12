import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeSocialTables } from '../../server/db/social-schema.js';
import {
  createClient,
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaignStatus,
  deleteCampaign,
  createCampaignPost,
  bulkCreateCampaignPosts,
  listCampaignPosts,
  updateCampaignPost,
  updateCampaignField,
} from '../../server/db/social-queries.js';

describe('Campaign CRUD', () => {
  let db;
  let clientId;

  beforeEach(() => {
    db = createTestDb();
    db.pragma('foreign_keys = ON');
    initializeSocialTables(db);
    clientId = createClient(db, { name: 'Test Client' });
  });

  it('creates and retrieves a campaign with defaults', () => {
    const id = createCampaign(db, { client_id: clientId, month: '2026-05', theme: 'Summer' });
    const campaign = getCampaign(db, id);

    expect(campaign.status).toBe('draft');
    expect(campaign.current_step).toBe(1);
    expect(campaign.client_id).toBe(clientId);
    expect(campaign.month).toBe('2026-05');
  });

  it('lists campaigns for a client', () => {
    createCampaign(db, { client_id: clientId, month: '2026-05' });
    createCampaign(db, { client_id: clientId, month: '2026-06' });

    const campaigns = listCampaigns(db, clientId);
    expect(campaigns).toHaveLength(2);
  });

  it('updates campaign status and step', () => {
    const id = createCampaign(db, { client_id: clientId, month: '2026-05' });
    updateCampaignStatus(db, id, 'in_progress', 3);

    const campaign = getCampaign(db, id);
    expect(campaign.status).toBe('in_progress');
    expect(campaign.current_step).toBe(3);
  });

  it('creates and retrieves campaign posts', () => {
    const campId = createCampaign(db, { client_id: clientId, month: '2026-05' });
    const postId = createCampaignPost(db, {
      campaign_id: campId,
      day_number: 1,
      pillar: 'PAIN',
      caption: 'Test caption',
      concept: 'Test concept',
    });

    const posts = listCampaignPosts(db, campId);
    expect(posts).toHaveLength(1);
    expect(posts[0].pillar).toBe('PAIN');
    expect(posts[0].caption).toBe('Test caption');
    expect(posts[0].day_number).toBe(1);
  });

  it('updates a campaign post caption and edited flag', () => {
    const campId = createCampaign(db, { client_id: clientId, month: '2026-05' });
    const postId = createCampaignPost(db, {
      campaign_id: campId,
      day_number: 1,
      caption: 'Original',
    });

    updateCampaignPost(db, postId, { caption: 'Edited caption', edited: 1 });
    const posts = listCampaignPosts(db, campId);
    expect(posts[0].caption).toBe('Edited caption');
    expect(posts[0].edited).toBe(1);
  });

  it('bulk inserts 30 campaign posts', () => {
    const campId = createCampaign(db, { client_id: clientId, month: '2026-05' });
    const posts = Array.from({ length: 30 }, (_, i) => ({
      campaign_id: campId,
      day_number: i + 1,
      pillar: 'CTA',
      caption: `Post ${i + 1}`,
    }));

    bulkCreateCampaignPosts(db, posts);
    const result = listCampaignPosts(db, campId);
    expect(result).toHaveLength(30);
  });

  it('updates image_urls on a post', () => {
    const campId = createCampaign(db, { client_id: clientId, month: '2026-05' });
    const postId = createCampaignPost(db, { campaign_id: campId, day_number: 1 });

    const urls = ['https://img.example.com/a.jpg', 'https://img.example.com/b.jpg'];
    updateCampaignPost(db, postId, { image_urls: JSON.stringify(urls) });

    const posts = listCampaignPosts(db, campId);
    expect(JSON.parse(posts[0].image_urls)).toEqual(urls);
  });

  it('deletes a campaign and cascades posts', () => {
    const campId = createCampaign(db, { client_id: clientId, month: '2026-05' });
    createCampaignPost(db, { campaign_id: campId, day_number: 1 });
    createCampaignPost(db, { campaign_id: campId, day_number: 2 });

    deleteCampaign(db, campId);
    expect(getCampaign(db, campId)).toBeUndefined();
    expect(listCampaignPosts(db, campId)).toHaveLength(0);
  });
});

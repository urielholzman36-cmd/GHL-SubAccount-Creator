import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeSocialTables } from '../../server/db/social-schema.js';

describe('Social Planner Schema', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    db.pragma('foreign_keys = ON');
    initializeSocialTables(db);
  });

  describe('clients table', () => {
    const expectedColumns = [
      'id', 'name', 'industry', 'location', 'website', 'logo_path',
      'cloudinary_folder', 'platforms', 'posting_time', 'brand_tone',
      'brand_description', 'target_audience', 'services', 'content_pillars',
      'hashtag_bank', 'cta_style', 'uses_manus', 'watermark_position',
      'watermark_opacity', 'created_at',
    ];

    it('has all expected columns', () => {
      const cols = db.prepare('PRAGMA table_info(clients)').all().map(c => c.name);
      for (const col of expectedColumns) {
        expect(cols, `missing column: ${col}`).toContain(col);
      }
    });

    it('enforces NOT NULL on name', () => {
      expect(() => {
        db.prepare('INSERT INTO clients (name) VALUES (NULL)').run();
      }).toThrow();
    });

    it('allows insert with only name', () => {
      const result = db.prepare('INSERT INTO clients (name) VALUES (?)').run('Test Client');
      expect(result.changes).toBe(1);
    });

    it('has correct defaults', () => {
      db.prepare('INSERT INTO clients (name) VALUES (?)').run('Test Client');
      const row = db.prepare('SELECT * FROM clients WHERE name = ?').get('Test Client');
      expect(JSON.parse(row.platforms)).toEqual(['facebook', 'instagram']);
      expect(JSON.parse(row.content_pillars)).toEqual(['PAIN', 'SOLUTION', 'AUTHORITY', 'PROOF', 'CTA']);
      expect(row.uses_manus).toBe(0);
      expect(row.watermark_position).toBe('bottom-right');
      expect(row.watermark_opacity).toBe(0.7);
      expect(row.posting_time).toBe('09:00:00');
    });
  });

  describe('campaigns table', () => {
    const expectedColumns = [
      'id', 'client_id', 'month', 'theme', 'start_date', 'status',
      'research_brief', 'manus_research', 'strategy_pack', 'prompts_csv_path',
      'images_folder', 'csv_path', 'current_step', 'created_at',
    ];

    it('has all expected columns', () => {
      const cols = db.prepare('PRAGMA table_info(campaigns)').all().map(c => c.name);
      for (const col of expectedColumns) {
        expect(cols, `missing column: ${col}`).toContain(col);
      }
    });

    it('enforces foreign key on client_id', () => {
      expect(() => {
        db.prepare('INSERT INTO campaigns (client_id, month) VALUES (?, ?)').run(9999, '2026-04');
      }).toThrow();
    });

    it('has correct defaults', () => {
      db.prepare('INSERT INTO clients (name) VALUES (?)').run('FK Client');
      const client = db.prepare('SELECT id FROM clients WHERE name = ?').get('FK Client');
      db.prepare('INSERT INTO campaigns (client_id, month) VALUES (?, ?)').run(client.id, '2026-04');
      const row = db.prepare('SELECT * FROM campaigns WHERE client_id = ?').get(client.id);
      expect(row.status).toBe('draft');
      expect(row.current_step).toBe(1);
    });
  });

  describe('campaign_posts table', () => {
    const expectedColumns = [
      'id', 'campaign_id', 'day_number', 'post_date', 'pillar', 'post_type',
      'concept', 'caption', 'hashtags', 'cta', 'visual_prompt', 'image_urls',
      'slide_count', 'category', 'edited',
    ];

    it('has all expected columns', () => {
      const cols = db.prepare('PRAGMA table_info(campaign_posts)').all().map(c => c.name);
      for (const col of expectedColumns) {
        expect(cols, `missing column: ${col}`).toContain(col);
      }
    });

    it('enforces foreign key on campaign_id', () => {
      expect(() => {
        db.prepare('INSERT INTO campaign_posts (campaign_id, day_number) VALUES (?, ?)').run(9999, 1);
      }).toThrow();
    });

    it('has correct defaults', () => {
      db.prepare('INSERT INTO clients (name) VALUES (?)').run('Post Client');
      const client = db.prepare('SELECT id FROM clients WHERE name = ?').get('Post Client');
      db.prepare('INSERT INTO campaigns (client_id, month) VALUES (?, ?)').run(client.id, '2026-04');
      const campaign = db.prepare('SELECT id FROM campaigns WHERE client_id = ?').get(client.id);
      db.prepare('INSERT INTO campaign_posts (campaign_id, day_number) VALUES (?, ?)').run(campaign.id, 1);
      const row = db.prepare('SELECT * FROM campaign_posts WHERE campaign_id = ?').get(campaign.id);
      expect(row.post_type).toBe('single');
      expect(JSON.parse(row.image_urls)).toEqual([]);
      expect(row.slide_count).toBe(1);
      expect(row.category).toBe('Product Showcase');
      expect(row.edited).toBe(0);
    });
  });
});

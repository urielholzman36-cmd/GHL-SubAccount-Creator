import { describe, it, expect } from 'vitest';
import {
  buildStrategyPrompt,
  parseStrategyResponse,
  validateStrategyPack,
} from '../../server/services/social-strategy.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function sampleClient(overrides = {}) {
  return {
    name: 'Calispark Electric',
    industry: 'Electrical Contracting',
    brand_tone: 'Professional yet approachable',
    brand_description: 'Top-rated residential electrician in San Diego',
    target_audience: 'Homeowners aged 35-60',
    services: JSON.stringify(['EV charger install', 'Panel upgrades', 'Lighting']),
    platforms: JSON.stringify(['Instagram', 'Facebook', 'TikTok']),
    cta_style: 'Book a free estimate today',
    hashtag_bank: JSON.stringify(['#electrician', '#EVcharger', '#SanDiego', '#homesafety']),
    content_pillars: JSON.stringify(['Education', 'Before/After', 'Testimonials', 'Tips', 'Promo']),
    ...overrides,
  };
}

function makeValidPack(count = 30) {
  return Array.from({ length: count }, (_, i) => ({
    day: i + 1,
    pillar: 'Education',
    post_type: 'single',
    concept: `Post concept ${i + 1}`,
    caption: `Caption for day ${i + 1}`,
    hashtags: '#test',
    cta: 'Book now',
    visual_prompt: 'A bright photo',
    slide_count: 1,
  }));
}

// ── buildStrategyPrompt ──────────────────────────────────────────────────────

describe('buildStrategyPrompt', () => {
  it('includes brand tone and description', () => {
    const prompt = buildStrategyPrompt(sampleClient(), 'May 2026', 'Spring Refresh');
    expect(prompt).toContain('Professional yet approachable');
    expect(prompt).toContain('Top-rated residential electrician in San Diego');
  });

  it('includes 5 content pillars', () => {
    const prompt = buildStrategyPrompt(sampleClient(), 'May 2026', 'Spring Refresh');
    expect(prompt).toContain('Education');
    expect(prompt).toContain('Before/After');
    expect(prompt).toContain('Testimonials');
    expect(prompt).toContain('Tips');
    expect(prompt).toContain('Promo');
  });

  it('requests 30 posts and JSON output', () => {
    const prompt = buildStrategyPrompt(sampleClient(), 'May 2026', 'Spring Refresh');
    expect(prompt).toMatch(/30/);
    expect(prompt).toMatch(/JSON/i);
  });

  it('includes CTA style from client profile', () => {
    const prompt = buildStrategyPrompt(sampleClient(), 'May 2026', 'Spring Refresh');
    expect(prompt).toContain('Book a free estimate today');
  });
});

// ── parseStrategyResponse ────────────────────────────────────────────────────

describe('parseStrategyResponse', () => {
  it('parses JSON inside markdown code block', () => {
    const pack = makeValidPack(2);
    const wrapped = '```json\n' + JSON.stringify(pack) + '\n```';
    const result = parseStrategyResponse(wrapped);
    expect(result).toHaveLength(2);
    expect(result[0].day).toBe(1);
  });

  it('handles raw JSON without wrapping', () => {
    const pack = makeValidPack(3);
    const raw = JSON.stringify(pack);
    const result = parseStrategyResponse(raw);
    expect(result).toHaveLength(3);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseStrategyResponse('not json at all')).toThrow();
  });
});

// ── validateStrategyPack ─────────────────────────────────────────────────────

describe('validateStrategyPack', () => {
  it('accepts valid 30-post pack', () => {
    const pack = makeValidPack(30);
    expect(() => validateStrategyPack(pack)).not.toThrow();
  });

  it('rejects pack with fewer than 30 posts', () => {
    const pack = makeValidPack(10);
    expect(() => validateStrategyPack(pack)).toThrow(/30/);
  });

  it('rejects posts missing required fields', () => {
    const pack = makeValidPack(30);
    delete pack[5].caption;
    expect(() => validateStrategyPack(pack)).toThrow(/caption/i);
  });
});

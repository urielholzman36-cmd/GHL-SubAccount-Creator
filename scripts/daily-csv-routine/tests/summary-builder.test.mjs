import { describe, it, expect } from 'vitest';
import { buildSummary } from '../lib/summary-builder.mjs';

const samplePosts = [
  {
    post_id: 'VO360-01',
    day_number: 1,
    post_type: 'carousel',
    concept: 'The 4 invisible systems',
    caption: 'Strong businesses do not look calm by accident. They have systems most people never see.',
    cta: 'Save this post.',
    hashtags: '#VO360',
    image_urls: ['a.png', 'b.png', 'c.png', 'd.png'],
  },
  {
    post_id: 'VO360-02',
    day_number: 2,
    post_type: 'single',
    concept: 'Busy vs Built to Scale',
    caption: 'Short one.',
    cta: 'DM SCALE.',
    hashtags: '#Scale',
    image_urls: ['e.png'],
  },
];

describe('buildSummary', () => {
  it('starts with an H1 header naming the client and month', () => {
    const md = buildSummary(samplePosts, { client: 'VO360', year: 2026, month: 5, startDate: '2026-05-01' });
    expect(md.split('\n')[0]).toBe('# VO360 — May 2026');
  });

  it('lists every post with day, type, and slide count', () => {
    const md = buildSummary(samplePosts, { client: 'VO360', year: 2026, month: 5, startDate: '2026-05-01' });
    expect(md).toContain('Day 1 · VO360-01 · Carousel (4 slides)');
    expect(md).toContain('Day 2 · VO360-02 · Single');
  });

  it('truncates captions to 80 chars with ellipsis', () => {
    const md = buildSummary(samplePosts, { client: 'VO360', year: 2026, month: 5, startDate: '2026-05-01' });
    expect(md).toContain('Strong businesses do not look calm by accident. They have systems most people n…');
  });

  it('shows total post count', () => {
    const md = buildSummary(samplePosts, { client: 'VO360', year: 2026, month: 5, startDate: '2026-05-01' });
    expect(md).toContain('**2 posts total**');
  });

  it('includes warnings section when warnings are passed', () => {
    const md = buildSummary(samplePosts, {
      client: 'VO360', year: 2026, month: 5, startDate: '2026-05-01',
      warnings: ['Image X failed upload', 'Missing post_kits entry for VO360-03'],
    });
    expect(md).toContain('## Warnings');
    expect(md).toContain('- Image X failed upload');
    expect(md).toContain('- Missing post_kits entry for VO360-03');
  });
});

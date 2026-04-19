import { describe, it, expect } from 'vitest';
import { buildGhlCsv } from '../lib/csv-builder.mjs';

const samplePosts = [
  {
    day_number: 1,
    caption: 'First post caption.',
    cta: 'DM us.',
    hashtags: '#Demo #Test',
    image_urls: ['https://cdn/img1.png', 'https://cdn/img2.png'],
  },
  {
    day_number: 2,
    caption: 'Second, with "quotes" and,commas.',
    cta: null,
    hashtags: '#Two',
    image_urls: ['https://cdn/img3.png'],
  },
];

describe('buildGhlCsv', () => {
  it('produces header + one row per post', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    const lines = csv.trim().split('\n').filter(l => l.startsWith('2026-'));
    expect(lines.length).toBe(2);
  });

  it('uses correct GHL basic-format header', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toBe('postAtSpecificTime (YYYY-MM-DD HH:mm:ss),content,link (OGmetaUrl),imageUrls,gifUrl,videoUrls');
  });

  it('schedules Day 1 on startDate, not startDate-1 (no timezone off-by-one)', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    expect(csv).toContain('2026-06-01 09:00:00');
    expect(csv).not.toContain('2026-05-31');
  });

  it('advances one day per day_number', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    expect(csv).toContain('2026-06-02 09:00:00');
  });

  it('joins caption + CTA + hashtags with blank lines', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    expect(csv).toContain('First post caption.\n\nDM us.\n\n#Demo #Test');
  });

  it('escapes quotes and commas in content', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    expect(csv).toContain('"Second, with ""quotes"" and,commas.');
  });

  it('joins multiple image URLs with commas, inside quoted cell', () => {
    const csv = buildGhlCsv(samplePosts, { startDate: '2026-06-01', postingTime: '09:00:00' });
    expect(csv).toContain('"https://cdn/img1.png,https://cdn/img2.png"');
  });
});

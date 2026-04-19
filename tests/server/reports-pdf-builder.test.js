import { describe, it, expect } from 'vitest';
import { buildReportPdf } from '../../server/modules/reports/services/pdf-builder.js';

describe('buildReportPdf', () => {
  const input = {
    clientName: 'Restoration Pro NW',
    month: '2026-09',
    generatedAt: new Date('2026-10-05T12:00:00Z'),
    data: {
      month: '2026-09',
      leads_count: 47,
      leads_mom_pct: 23,
      lead_sources: [
        { source: 'Meta Ads', count: 20, pct: 42 },
        { source: 'Google Ads', count: 15, pct: 32 },
        { source: 'Organic', count: 12, pct: 26 },
      ],
      appointments_booked: 19,
      show_rate_pct: 74,
      converted_rate_pct: 53,
    },
    narrative: {
      exec_summary: 'September was a strong month — leads grew 23% to 47, with Meta Ads driving the biggest share.',
      recommendations: [
        'Double down on Meta Ads — your highest-converting channel.',
        'Test a same-day appointment incentive to lift the show rate.',
        'Review follow-up cadence for un-converted leads.',
      ],
    },
  };

  it('returns a non-empty PDF buffer starting with the PDF magic number', async () => {
    const buf = await buildReportPdf(input);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
    // PDF magic number: %PDF-
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('produces PDFs of similar sizes for the same input (deterministic)', async () => {
    const a = await buildReportPdf(input);
    const b = await buildReportPdf(input);
    expect(Math.abs(a.length - b.length)).toBeLessThan(500);
  });
});

import { describe, it, expect } from 'vitest';
import { buildMonthlyAggregate } from '../../server/shared/ghl-data-puller/monthly-aggregate.js';

describe('buildMonthlyAggregate', () => {
  const rawData = {
    contacts: [
      { id: 'c1', dateAdded: '2026-09-03T12:00:00Z', source: 'Meta Ads', tags: [] },
      { id: 'c2', dateAdded: '2026-09-15T08:00:00Z', source: 'Google Ads', tags: [] },
      { id: 'c3', dateAdded: '2026-09-20T10:00:00Z', source: 'Meta Ads', tags: [] },
      { id: 'c4', dateAdded: '2026-08-15T10:00:00Z', source: 'Organic', tags: [] },
      { id: 'c5', dateAdded: '2026-08-20T10:00:00Z', source: 'Meta Ads', tags: [] },
    ],
    appointments: [
      { id: 'a1', contactId: 'c1', startTime: '2026-09-10T15:00:00Z', status: 'showed' },
      { id: 'a2', contactId: 'c2', startTime: '2026-09-18T16:00:00Z', status: 'showed' },
      { id: 'a3', contactId: 'c3', startTime: '2026-09-25T14:00:00Z', status: 'noshow' },
      { id: 'a4', contactId: 'c4', startTime: '2026-08-20T14:00:00Z', status: 'showed' },
    ],
    opportunities: [
      { id: 'o1', contactId: 'c1', status: 'won', monetaryValue: 2500, updatedAt: '2026-09-12T00:00:00Z' },
      { id: 'o2', contactId: 'c4', status: 'won', monetaryValue: 1800, updatedAt: '2026-08-22T00:00:00Z' },
    ],
  };

  it('aggregates leads, appointments, show rate, and conversion for given month', () => {
    const agg = buildMonthlyAggregate(rawData, '2026-09');
    expect(agg.month).toBe('2026-09');
    expect(agg.leads_count).toBe(3);
    expect(agg.appointments_booked).toBe(3);
    expect(agg.appointments_showed).toBe(2);
    expect(agg.show_rate_pct).toBe(67); // 2/3 rounded
    expect(agg.converted_count).toBe(1);
    expect(agg.converted_rate_pct).toBe(33); // 1/3 rounded
    expect(agg.lead_sources).toEqual([
      { source: 'Meta Ads', count: 2, pct: 67 },
      { source: 'Google Ads', count: 1, pct: 33 },
    ]);
  });

  it('returns zeros for months with no activity', () => {
    const agg = buildMonthlyAggregate({ contacts: [], appointments: [], opportunities: [] }, '2026-09');
    expect(agg.leads_count).toBe(0);
    expect(agg.appointments_booked).toBe(0);
    expect(agg.show_rate_pct).toBe(0);
    expect(agg.converted_rate_pct).toBe(0);
    expect(agg.lead_sources).toEqual([]);
  });

  it('computes prior month for MoM delta', () => {
    const agg = buildMonthlyAggregate(rawData, '2026-09');
    expect(agg.prior_month).toBe('2026-08');
    expect(agg.prior_leads_count).toBe(2);
    expect(agg.leads_mom_pct).toBe(50); // (3-2)/2 * 100
  });
});

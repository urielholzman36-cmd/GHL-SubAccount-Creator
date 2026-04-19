import { describe, it, expect } from 'vitest';
import {
  buildNarrativePrompt,
  validateNarrativeFidelity,
} from '../../server/modules/reports/services/narrative-generator.js';

describe('narrative prompt builder', () => {
  const data = {
    month: '2026-09',
    leads_count: 47,
    leads_mom_pct: 23,
    prior_leads_count: 38,
    lead_sources: [
      { source: 'Meta Ads', count: 20, pct: 42 },
      { source: 'Google Ads', count: 15, pct: 32 },
      { source: 'Organic', count: 12, pct: 26 },
    ],
    appointments_booked: 19,
    show_rate_pct: 74,
    converted_rate_pct: 53,
  };

  it('includes the client name, month, and all key numbers', () => {
    const { user } = buildNarrativePrompt({ clientName: 'Restoration Pro NW', industry: 'Water damage restoration', data });
    expect(user).toContain('Restoration Pro NW');
    expect(user).toContain('September 2026');
    expect(user).toContain('47');
    expect(user).toContain('Meta Ads');
    expect(user).toContain('74%');
  });

  it('contains strict output-format instructions', () => {
    const { system } = buildNarrativePrompt({ clientName: 'X', industry: 'Y', data });
    expect(system).toMatch(/150-200 words/);
    expect(system).toMatch(/3-4/);
    expect(system).toMatch(/JSON/);
  });
});

describe('narrative fidelity validator', () => {
  const data = {
    leads_count: 47,
    leads_mom_pct: 23,
    appointments_booked: 19,
    show_rate_pct: 74,
    converted_rate_pct: 53,
    lead_sources: [{ source: 'Meta Ads', count: 20, pct: 42 }],
  };

  it('accepts narrative that only uses numbers from the data', () => {
    const result = validateNarrativeFidelity({
      exec_summary: 'Leads grew 23% to 47 this month, with Meta Ads driving 42%. Appointments: 19.',
      recommendations: ['Keep investing in Meta Ads', 'Test same-day booking', 'Strengthen follow-up cadence'],
    }, data);
    expect(result.valid).toBe(true);
  });

  it('rejects narrative with invented numbers', () => {
    const result = validateNarrativeFidelity({
      exec_summary: 'Leads soared to 83 this month — an unheard-of 500% increase.',
      recommendations: ['x'],
    }, data);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/83|500/);
  });

  it('rejects recommendations shorter than 3 or longer than 4 items', () => {
    const tooFew = validateNarrativeFidelity({
      exec_summary: 'Leads 47, appts 19, show 74%, conv 53%.',
      recommendations: ['only one'],
    }, data);
    expect(tooFew.valid).toBe(false);

    const tooMany = validateNarrativeFidelity({
      exec_summary: 'Leads 47, appts 19, show 74%, conv 53%.',
      recommendations: ['1', '2', '3', '4', '5'],
    }, data);
    expect(tooMany.valid).toBe(false);
  });
});

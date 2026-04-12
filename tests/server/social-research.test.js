import { describe, it, expect } from 'vitest';
import {
  buildResearchPrompt,
  mergeResearch,
} from '../../server/services/social-research.js';

function sampleClient(overrides = {}) {
  return {
    industry: 'Residential Plumbing',
    location: 'Austin, TX',
    target_audience: 'Homeowners aged 30-55',
    services: JSON.stringify(['Drain Cleaning', 'Water Heater Install', 'Leak Repair']),
    ...overrides,
  };
}

describe('buildResearchPrompt', () => {
  it('includes client industry and location', () => {
    const prompt = buildResearchPrompt(sampleClient(), '2026-06', 'Summer Savings');
    expect(prompt).toContain('Residential Plumbing');
    expect(prompt).toContain('Austin, TX');
  });

  it('includes the monthly theme', () => {
    const prompt = buildResearchPrompt(sampleClient(), '2026-06', 'Summer Savings');
    expect(prompt).toContain('Summer Savings');
  });

  it('includes month name (December 2026 for "2026-12")', () => {
    const prompt = buildResearchPrompt(sampleClient(), '2026-12', 'Holiday Specials');
    expect(prompt).toContain('December 2026');
  });

  it('includes services as comma-separated list', () => {
    const prompt = buildResearchPrompt(sampleClient(), '2026-06', 'Summer Savings');
    expect(prompt).toContain('Drain Cleaning');
    expect(prompt).toContain('Water Heater Install');
    expect(prompt).toContain('Leak Repair');
  });
});

describe('mergeResearch', () => {
  const webText = 'Web research results here.';
  const manusText = 'Manus trend data here.';

  it('returns only web research when manus is null', () => {
    expect(mergeResearch(webText, null)).toBe(webText);
  });

  it('returns only web research when manus is empty string', () => {
    expect(mergeResearch(webText, '')).toBe(webText);
  });

  it('merges both with labeled sections when both present', () => {
    const result = mergeResearch(webText, manusText);
    expect(result).toContain('## Industry Research');
    expect(result).toContain(webText);
    expect(result).toContain('---');
    expect(result).toContain('## Social Trend Research (Manus AI)');
    expect(result).toContain(manusText);
  });
});

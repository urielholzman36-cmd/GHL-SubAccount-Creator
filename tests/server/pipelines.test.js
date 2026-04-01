import { describe, it, expect } from 'vitest';
import { getStagesForIndustry } from '../../server/services/pipelines.js';

describe('Pipeline Stages', () => {
  it('returns construction stages', () => {
    const stages = getStagesForIndustry('construction');
    expect(stages[0].name).toBe('New Lead');
    expect(stages[stages.length - 1].name).toBe('Completed');
    expect(stages).toHaveLength(7);
  });

  it('returns plumbing stages', () => {
    const stages = getStagesForIndustry('plumbing');
    expect(stages[0].name).toBe('Emergency');
    expect(stages).toHaveLength(6);
  });

  it('returns same stages for electrical as plumbing', () => {
    const plumbing = getStagesForIndustry('plumbing');
    const electrical = getStagesForIndustry('electrical');
    expect(plumbing).toEqual(electrical);
  });

  it('returns cleaning stages', () => {
    const stages = getStagesForIndustry('cleaning');
    expect(stages).toHaveLength(5);
    expect(stages[2].name).toBe('Booked');
  });

  it('returns general stages', () => {
    const stages = getStagesForIndustry('general');
    expect(stages).toHaveLength(6);
  });

  it('throws on unknown industry', () => {
    expect(() => getStagesForIndustry('unknown')).toThrow();
  });

  it('stages have sequential positions', () => {
    const stages = getStagesForIndustry('construction');
    stages.forEach((s, i) => { expect(s.position).toBe(i); });
  });
});

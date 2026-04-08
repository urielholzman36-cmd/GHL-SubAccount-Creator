import { describe, it, expect } from 'vitest';
import { PHASES, getPhaseForStep, getAllSteps, getStepName } from '../../server/services/phases.config.js';

describe('phases config', () => {
  it('defines phase 1 with steps 1-6', () => {
    const p1 = PHASES.find((p) => p.id === 1);
    expect(p1).toBeDefined();
    expect(p1.name).toBe('GHL Sub-Account Setup');
    expect(p1.steps.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('defines phase 2 with stub step 7', () => {
    const p2 = PHASES.find((p) => p.id === 2);
    expect(p2).toBeDefined();
    expect(p2.name).toBe('Website Build');
    expect(p2.steps).toHaveLength(1);
    expect(p2.steps[0].number).toBe(7);
    expect(p2.steps[0].pausesForManualInput).toBe(true);
  });

  it('getPhaseForStep returns the right phase id', () => {
    expect(getPhaseForStep(1)).toBe(1);
    expect(getPhaseForStep(6)).toBe(1);
    expect(getPhaseForStep(7)).toBe(2);
  });

  it('getAllSteps returns all steps in order', () => {
    const all = getAllSteps();
    expect(all.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('getStepName returns the step name', () => {
    expect(getStepName(1)).toBe('Create Sub-Account');
    expect(getStepName(7)).toBe('Website Creation (Manual)');
  });
});

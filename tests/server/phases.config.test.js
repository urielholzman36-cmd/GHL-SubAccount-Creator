import { describe, it, expect } from 'vitest';
import { PHASES, getPhaseForStep, getAllSteps, getStepName, isStepOptional } from '../../server/services/phases.config.js';

describe('phases config', () => {
  it('defines phase 1 with steps 1 and 2', () => {
    const p1 = PHASES.find((p) => p.id === 1);
    expect(p1).toBeDefined();
    expect(p1.name).toBe('GHL Sub-Account Setup');
    expect(p1.steps.map((s) => s.number)).toEqual([1, 2]);
  });

  it('phase 1 step 2 is optional (best-effort Welcome Comms)', () => {
    expect(isStepOptional(2)).toBe(true);
  });

  it('defines phase 2 with steps 3 and 4', () => {
    const p2 = PHASES.find((p) => p.id === 2);
    expect(p2).toBeDefined();
    expect(p2.name).toBe('Website Build');
    expect(p2.steps.map((s) => s.number)).toEqual([3, 4]);
  });

  it('step 3 is Generate 10web Prompt (fatal)', () => {
    const step = PHASES[1].steps.find((s) => s.number === 3);
    expect(step.name).toBe('Generate 10web Prompt');
    expect(step.optional).not.toBe(true);
  });

  it('step 4 is Website Creation (Manual) and pauses', () => {
    const step = PHASES[1].steps.find((s) => s.number === 4);
    expect(step.name).toBe('Website Creation (Manual)');
    expect(step.pausesForManualInput).toBe(true);
  });

  it('getPhaseForStep returns the right phase id', () => {
    expect(getPhaseForStep(1)).toBe(1);
    expect(getPhaseForStep(2)).toBe(1);
    expect(getPhaseForStep(3)).toBe(2);
    expect(getPhaseForStep(4)).toBe(2);
  });

  it('getAllSteps returns all steps in order', () => {
    expect(getAllSteps().map((s) => s.number)).toEqual([1, 2, 3, 4]);
  });

  it('getStepName returns each step name', () => {
    expect(getStepName(1)).toBe('Create Sub-Account');
    expect(getStepName(2)).toBe('Send Welcome Comms');
    expect(getStepName(3)).toBe('Generate 10web Prompt');
    expect(getStepName(4)).toBe('Website Creation (Manual)');
  });
});

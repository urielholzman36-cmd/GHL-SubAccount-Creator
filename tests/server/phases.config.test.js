import { describe, it, expect } from 'vitest';
import { PHASES, getPhaseForStep, getAllSteps, getStepName } from '../../server/services/phases.config.js';

describe('phases config', () => {
  it('defines phase 1 with steps 1 and 2', () => {
    const p1 = PHASES.find((p) => p.id === 1);
    expect(p1).toBeDefined();
    expect(p1.name).toBe('GHL Sub-Account Setup');
    expect(p1.steps.map((s) => s.number)).toEqual([1, 2]);
  });

  it('phase 1 step 1 is Create Sub-Account (fatal)', () => {
    const p1 = PHASES.find((p) => p.id === 1);
    const step1 = p1.steps.find((s) => s.number === 1);
    expect(step1.name).toBe('Create Sub-Account');
    expect(step1.optional).not.toBe(true);
  });

  it('phase 1 step 2 is Send Welcome Comms (best-effort)', () => {
    const p1 = PHASES.find((p) => p.id === 1);
    const step2 = p1.steps.find((s) => s.number === 2);
    expect(step2.name).toBe('Send Welcome Comms');
    expect(step2.optional).toBe(true);
  });

  it('defines phase 2 with stub step 3', () => {
    const p2 = PHASES.find((p) => p.id === 2);
    expect(p2).toBeDefined();
    expect(p2.name).toBe('Website Build');
    expect(p2.steps).toHaveLength(1);
    expect(p2.steps[0].number).toBe(3);
    expect(p2.steps[0].pausesForManualInput).toBe(true);
  });

  it('getPhaseForStep returns the right phase id', () => {
    expect(getPhaseForStep(1)).toBe(1);
    expect(getPhaseForStep(2)).toBe(1);
    expect(getPhaseForStep(3)).toBe(2);
  });

  it('getAllSteps returns all steps in order', () => {
    const all = getAllSteps();
    expect(all.map((s) => s.number)).toEqual([1, 2, 3]);
  });

  it('getStepName returns the step name', () => {
    expect(getStepName(1)).toBe('Create Sub-Account');
    expect(getStepName(2)).toBe('Send Welcome Comms');
    expect(getStepName(3)).toBe('Website Creation (Manual)');
  });
});

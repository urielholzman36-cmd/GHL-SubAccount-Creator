import { describe, it, expect } from 'vitest';
import { PHASES, getPhaseForStep, getAllSteps, getStepName, isStepOptional, getTotalStepCount } from '../../server/services/phases.config.js';

describe('phases config', () => {
  it('has 3 phases', () => {
    expect(PHASES).toHaveLength(3);
  });

  it('defines phase 1 with step 1', () => {
    const p1 = PHASES.find((p) => p.id === 1);
    expect(p1).toBeDefined();
    expect(p1.name).toBe('GHL Sub-Account Setup');
    expect(p1.steps.map((s) => s.number)).toEqual([1]);
  });

  it('defines phase 2 with steps 2 and 3', () => {
    const p2 = PHASES.find((p) => p.id === 2);
    expect(p2).toBeDefined();
    expect(p2.name).toBe('Website Build');
    expect(p2.steps.map((s) => s.number)).toEqual([2, 3]);
  });

  it('defines phase 3 with steps 4-10', () => {
    const p3 = PHASES.find((p) => p.id === 3);
    expect(p3).toBeDefined();
    expect(p3.name).toBe('WordPress Setup');
    expect(p3.steps.map((s) => s.number)).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });

  it('step 2 is Generate 10web Prompt (fatal)', () => {
    const step = PHASES[1].steps.find((s) => s.number === 2);
    expect(step.name).toBe('Generate 10web Prompt');
    expect(step.optional).not.toBe(true);
  });

  it('step 3 is Website Creation (Manual) and pauses', () => {
    const step = PHASES[1].steps.find((s) => s.number === 3);
    expect(step.name).toBe('Website Creation (Manual)');
    expect(step.pausesForManualInput).toBe(true);
  });

  it('getPhaseForStep returns the right phase id', () => {
    expect(getPhaseForStep(1)).toBe(1);
    expect(getPhaseForStep(2)).toBe(2);
    expect(getPhaseForStep(3)).toBe(2);
    expect(getPhaseForStep(4)).toBe(3);
    expect(getPhaseForStep(7)).toBe(3);
    expect(getPhaseForStep(10)).toBe(3);
    expect(getPhaseForStep(99)).toBe(null);
  });

  it('getAllSteps returns all 10 steps in order', () => {
    expect(getAllSteps().map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('getStepName returns each step name', () => {
    expect(getStepName(1)).toBe('Create Sub-Account');
    expect(getStepName(2)).toBe('Generate 10web Prompt');
    expect(getStepName(3)).toBe('Website Creation (Manual)');
    expect(getStepName(4)).toBe('Validate WordPress');
    expect(getStepName(5)).toBe('Install Plugins');
    expect(getStepName(6)).toBe('Upload Logo');
    expect(getStepName(7)).toBe('Fix Header');
    expect(getStepName(8)).toBe('Generate Legal Pages');
    expect(getStepName(9)).toBe('Generate FAQ');
    expect(getStepName(10)).toBe('Publish Pages');
  });

  it('getTotalStepCount returns 10', () => {
    expect(getTotalStepCount()).toBe(10);
  });

  it('step 7 is optional', () => {
    expect(isStepOptional(7)).toBe(true);
    expect(isStepOptional(1)).toBe(false);
    expect(isStepOptional(4)).toBe(false);
  });

  it('step 3 has pausesForManualInput', () => {
    const step = getAllSteps().find((s) => s.number === 3);
    expect(step.pausesForManualInput).toBe(true);
  });
});

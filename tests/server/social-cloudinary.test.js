import { describe, it, expect } from 'vitest';
import { buildPublicId } from '../../server/services/social-cloudinary.js';

describe('buildPublicId', () => {
  it('returns correct public ID for a single image (slideNumber=0)', () => {
    expect(buildPublicId('Calispark Electric', 1, 0))
      .toBe('krea-agent/Calispark-Electric/1');
  });

  it('returns correct public ID for carousel slide 1', () => {
    expect(buildPublicId('Calispark Electric', 3, 1))
      .toBe('krea-agent/Calispark-Electric/3-s1');
  });

  it('returns correct public ID for carousel slide 2', () => {
    expect(buildPublicId('Calispark Electric', 3, 2))
      .toBe('krea-agent/Calispark-Electric/3-s2');
  });

  it('sanitizes client name with spaces and special chars to hyphens', () => {
    expect(buildPublicId('Bob\'s HVAC & Plumbing!', 5, 0))
      .toBe('krea-agent/Bob-s-HVAC---Plumbing-/5');
    expect(buildPublicId('test@#$name', 2, 1))
      .toBe('krea-agent/test---name/2-s1');
  });
});

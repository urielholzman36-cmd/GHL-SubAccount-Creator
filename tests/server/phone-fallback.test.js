import { describe, it, expect } from 'vitest';
import { getNearbyAreaCodes } from '../../server/services/phone-fallback.js';

describe('Phone Fallback', () => {
  it('returns nearby area codes in order', () => {
    const codes = getNearbyAreaCodes('305');
    expect(codes).toEqual(['304', '306', '303']);
  });

  it('handles low area codes', () => {
    const codes = getNearbyAreaCodes('201');
    expect(codes).toEqual(['200', '202', '199']);
  });

  it('handles string input', () => {
    const codes = getNearbyAreaCodes('415');
    expect(codes[0]).toBe('414');
    expect(codes[1]).toBe('416');
  });
});

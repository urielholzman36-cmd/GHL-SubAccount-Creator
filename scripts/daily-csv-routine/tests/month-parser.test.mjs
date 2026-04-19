import { describe, it, expect } from 'vitest';
import { parseMonthFromPath } from '../lib/month-parser.mjs';

describe('parseMonthFromPath', () => {
  it('extracts year-month from 2026_05 prefix in filename', () => {
    expect(parseMonthFromPath('2026_05_VO360.zip')).toEqual({ year: 2026, month: 5 });
  });

  it('extracts year-month from 2026_05 prefix in folder name', () => {
    expect(parseMonthFromPath('2026_05_Lyrie_final_may_package')).toEqual({ year: 2026, month: 5 });
  });

  it('handles dashes or underscores between year and month', () => {
    expect(parseMonthFromPath('2026-07_VO360.zip')).toEqual({ year: 2026, month: 7 });
  });

  it('returns null for unparseable names', () => {
    expect(parseMonthFromPath('random_bundle.zip')).toBeNull();
    expect(parseMonthFromPath('may .zip')).toBeNull();
  });

  it('ignores containing path, only looks at basename', () => {
    expect(parseMonthFromPath('/tmp/foo/2026_12_VO360.zip')).toEqual({ year: 2026, month: 12 });
  });
});

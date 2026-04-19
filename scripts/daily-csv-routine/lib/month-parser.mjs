// scripts/daily-csv-routine/lib/month-parser.mjs
import path from 'path';

/**
 * Extract { year, month } from a filename or folder name.
 * Matches patterns like "2026_05_*", "2026-05_*".
 * Returns null if no recognizable year+month prefix.
 */
export function parseMonthFromPath(p) {
  const base = path.basename(String(p));
  const m = base.match(/^(\d{4})[_-](\d{1,2})[_\- ]/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

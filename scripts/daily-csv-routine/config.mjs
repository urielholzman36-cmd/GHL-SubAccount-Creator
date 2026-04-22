// scripts/daily-csv-routine/config.mjs
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

export const WATCH_ROOT = path.join(os.homedir(), 'Desktop', 'Manus-Social Planner ');
export const OUTPUT_ROOT = path.join(os.homedir(), 'Desktop', 'CSV Ready');
export const LOG_DIR = path.join(OUTPUT_ROOT, '_logs');
export const DEFAULT_POSTING_TIME = '09:00:00';

// Project root: we resolve relative to this file so scripts work from any cwd
export const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

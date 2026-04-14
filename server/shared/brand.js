/**
 * VO360 brand constants — shared across PDF generators, email templates, and reports.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const brand = {
  name: 'VO360',
  tagline: 'Unified Business Execution',
  website: 'https://vo360.net',
  email: 'hello@vo360.net',

  colors: {
    navy: '#0f172a',
    navyLight: '#1e293b',
    indigo: '#6366f1',
    violet: '#8b5cf6',
    cyan: '#06b6d4',
    teal: '#2dd4bf',
    white: '#ffffff',
    gray: '#94a3b8',
    gradient: ['#2dd4bf', '#3b82f6', '#a855f7'],
  },

  fonts: {
    heading: 'Plus Jakarta Sans',
    body: 'Plus Jakarta Sans',
  },

  /** Returns the logo as a Buffer. Cache it — don't re-read per request. */
  get logoBuffer() {
    if (!this._logoBuffer) {
      try {
        this._logoBuffer = readFileSync(resolve(__dirname, '../../src/assets/vo360-logo.png'));
      } catch {
        this._logoBuffer = null;
      }
    }
    return this._logoBuffer;
  },
  _logoBuffer: null,
};

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detectPendingBundles, outputCsvName } from '../lib/detector.mjs';

let tmpRoot;
let watchRoot;
let outputRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-routine-test-'));
  watchRoot = path.join(tmpRoot, 'input');
  outputRoot = path.join(tmpRoot, 'output');
  fs.mkdirSync(watchRoot); fs.mkdirSync(outputRoot);
});
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function touch(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, ''); }

describe('outputCsvName', () => {
  it('formats client_Month_Year_GHL_Schedule.csv', () => {
    expect(outputCsvName('VO360', 2026, 5)).toBe('VO360_May_2026_GHL_Schedule.csv');
    expect(outputCsvName('Lyrie.AI', 2026, 12)).toBe('Lyrie.AI_December_2026_GHL_Schedule.csv');
  });
});

describe('detectPendingBundles', () => {
  it('returns empty when no client folders exist', () => {
    expect(detectPendingBundles(watchRoot, outputRoot)).toEqual([]);
  });

  it('detects a zip at client folder root as pending when no CSV exists', () => {
    touch(path.join(watchRoot, 'VO360', '2026_06_VO360.zip'));
    fs.mkdirSync(path.join(outputRoot, 'VO360'), { recursive: true });
    const pending = detectPendingBundles(watchRoot, outputRoot);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ client: 'VO360', year: 2026, month: 6 });
    expect(pending[0].sourcePath).toContain('2026_06_VO360.zip');
  });

  it('skips if the corresponding CSV already exists', () => {
    touch(path.join(watchRoot, 'VO360', '2026_06_VO360.zip'));
    fs.mkdirSync(path.join(outputRoot, 'VO360'), { recursive: true });
    touch(path.join(outputRoot, 'VO360', 'VO360_June_2026_GHL_Schedule.csv'));
    expect(detectPendingBundles(watchRoot, outputRoot)).toEqual([]);
  });

  it('detects a folder (not zip) with parseable name as pending', () => {
    fs.mkdirSync(path.join(watchRoot, 'Lyrie.AI', '2026_06_Lyrie_package'), { recursive: true });
    fs.mkdirSync(path.join(outputRoot, 'Lyrie.AI'), { recursive: true });
    const pending = detectPendingBundles(watchRoot, outputRoot);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ client: 'Lyrie.AI', year: 2026, month: 6 });
  });

  it('skips client folders without a matching output subfolder', () => {
    touch(path.join(watchRoot, 'Unknown', '2026_06_Unknown.zip'));
    // no Unknown/ in output
    expect(detectPendingBundles(watchRoot, outputRoot)).toEqual([]);
  });

  it('ignores unparseable drops (no year_month prefix)', () => {
    touch(path.join(watchRoot, 'VO360', 'random.zip'));
    fs.mkdirSync(path.join(outputRoot, 'VO360'), { recursive: true });
    expect(detectPendingBundles(watchRoot, outputRoot)).toEqual([]);
  });
});

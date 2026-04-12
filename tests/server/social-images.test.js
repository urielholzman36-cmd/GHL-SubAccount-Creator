import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  writePromptsCsv,
  parseKreaProgress,
  getImagePaths,
} from '../../server/services/social-images.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'social-images-test-'));
}

describe('writePromptsCsv', () => {
  let dir;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes CSV with correct header row', () => {
    dir = tmpDir();
    const csvPath = path.join(dir, 'prompts.csv');
    writePromptsCsv(csvPath, []);
    const content = fs.readFileSync(csvPath, 'utf-8');
    expect(content.startsWith('post_id,post_type,prompt')).toBe(true);
  });

  it('writes one row for a single post', () => {
    dir = tmpDir();
    const csvPath = path.join(dir, 'prompts.csv');
    const posts = [
      { day_number: 1, slide_count: 1, visual_prompt: 'A sunny office' },
    ];
    writePromptsCsv(csvPath, posts);
    const lines = fs.readFileSync(csvPath, 'utf-8').trim().split('\n');
    // header + 1 data row
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('Single');
  });

  it('writes multiple rows for a carousel post', () => {
    dir = tmpDir();
    const csvPath = path.join(dir, 'prompts.csv');
    const posts = [
      { day_number: 3, slide_count: 2, visual_prompt: 'Slide 1: A dog. Slide 2: A cat.' },
    ];
    writePromptsCsv(csvPath, posts);
    const lines = fs.readFileSync(csvPath, 'utf-8').trim().split('\n');
    // header + 2 data rows (same post_id)
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain('Carousel');
    expect(lines[2]).toContain('Carousel');
    // Both rows share the same post_id
    const id1 = lines[1].split(',')[0];
    const id2 = lines[2].split(',')[0];
    expect(id1).toBe(id2);
  });

  it('writes Before_After type for before_after posts', () => {
    dir = tmpDir();
    const csvPath = path.join(dir, 'prompts.csv');
    const posts = [
      { day_number: 5, slide_count: 2, post_format: 'before_after', visual_prompt: 'Before and after' },
    ];
    writePromptsCsv(csvPath, posts);
    const lines = fs.readFileSync(csvPath, 'utf-8').trim().split('\n');
    expect(lines[1]).toContain('Before_After');
  });

  it('duplicates prompt when no Slide markers found for multi-slide', () => {
    dir = tmpDir();
    const csvPath = path.join(dir, 'prompts.csv');
    const posts = [
      { day_number: 7, slide_count: 3, visual_prompt: 'A beautiful landscape' },
    ];
    writePromptsCsv(csvPath, posts);
    const lines = fs.readFileSync(csvPath, 'utf-8').trim().split('\n');
    expect(lines.length).toBe(4); // header + 3 rows
  });
});

describe('parseKreaProgress', () => {
  it('extracts current and total from progress line', () => {
    const result = parseKreaProgress('[14/30] Post_14_Single — Single');
    expect(result).toEqual({ current: 14, total: 30 });
  });

  it('returns null for non-progress lines', () => {
    expect(parseKreaProgress('Starting generation...')).toBeNull();
    expect(parseKreaProgress('')).toBeNull();
  });
});

describe('getImagePaths', () => {
  let dir;
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns map of day number to image file paths', () => {
    dir = tmpDir();
    // Create Post_1_Single/image.png
    const single = path.join(dir, 'Post_1_Single');
    fs.mkdirSync(single);
    fs.writeFileSync(path.join(single, 'image.png'), '');

    // Create Post_3_Carousel/Slide_1.png + Slide_2.png
    const carousel = path.join(dir, 'Post_3_Carousel');
    fs.mkdirSync(carousel);
    fs.writeFileSync(path.join(carousel, 'Slide_1.png'), '');
    fs.writeFileSync(path.join(carousel, 'Slide_2.png'), '');

    const result = getImagePaths(dir);
    expect(result[1]).toEqual([path.join(single, 'image.png')]);
    expect(result[3]).toHaveLength(2);
    expect(result[3][0]).toContain('Slide_1.png');
    expect(result[3][1]).toContain('Slide_2.png');
  });
});

/**
 * Krea AI image generation service.
 * Writes prompt CSVs, spawns the Python subprocess, and parses output folders.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Escape a value for CSV (double-quote if it contains comma, quote, or newline).
 */
function csvEscape(val) {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Split a visual_prompt on "Slide N:" markers.
 * Returns an array of per-slide prompts, or null if no markers found.
 */
function splitSlidePrompts(prompt, slideCount) {
  const parts = [];
  for (let i = 1; i <= slideCount; i++) {
    const regex = new RegExp(`Slide\\s+${i}:\\s*`, 'i');
    const nextRegex = i < slideCount
      ? new RegExp(`Slide\\s+${i + 1}:`, 'i')
      : null;

    const match = prompt.match(regex);
    if (!match) return null; // no markers found

    const start = match.index + match[0].length;
    let end = prompt.length;
    if (nextRegex) {
      const nextMatch = prompt.match(nextRegex);
      if (nextMatch) end = nextMatch.index;
    }
    parts.push(prompt.slice(start, end).trim());
  }
  return parts.length === slideCount ? parts : null;
}

/**
 * Write a prompts CSV file for the Krea Python script.
 * Columns: post_id, post_type, prompt
 */
export function writePromptsCsv(csvPath, posts) {
  const rows = ['post_id,post_type,prompt'];

  for (const post of posts) {
    const id = post.day_number;
    const isBeforeAfter = post.post_type === 'before_after';
    const isSingle = (post.slide_count || 1) === 1;

    if (isSingle) {
      rows.push(`${id},Single,${csvEscape(post.visual_prompt)}`);
    } else {
      const type = isBeforeAfter ? 'Before_After' : 'Carousel';
      const slideCount = post.slide_count;
      const slidePrompts = splitSlidePrompts(post.visual_prompt, slideCount);

      for (let s = 0; s < slideCount; s++) {
        const prompt = slidePrompts ? slidePrompts[s] : post.visual_prompt;
        rows.push(`${id},${type},${csvEscape(prompt)}`);
      }
    }
  }

  fs.writeFileSync(csvPath, rows.join('\n') + '\n', 'utf-8');
}

/**
 * Parse a stdout line from the Krea Python script for progress info.
 * Returns { current, total } or null.
 */
export function parseKreaProgress(line) {
  const m = line.match(/^\[(\d+)\/(\d+)\]/);
  if (!m) return null;
  return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) };
}

/**
 * Scan the Krea output directory and return a map of dayNumber -> file paths.
 */
export function getImagePaths(contentDir) {
  const result = {};
  const entries = fs.readdirSync(contentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^Post_(\d+)_(\w+)$/);
    if (!match) continue;

    const dayNum = parseInt(match[1], 10);
    const folderPath = path.join(contentDir, entry.name);
    const files = fs.readdirSync(folderPath)
      .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .sort()
      .map(f => path.join(folderPath, f));

    result[dayNum] = files;
  }

  return result;
}

/**
 * Spawn the Krea Python image generation script.
 */
export function runKreaGeneration(clientName, csvPath, outputDir, { test = false, onProgress, onComplete, onError } = {}) {
  const home = process.env.HOME;
  const scriptPath = path.join(home, '.claude', 'skills', 'krea-image-generation', 'generate_images.py');

  const args = [
    '-u', scriptPath,
    '--client', clientName,
    '--file', csvPath,
    '--output-dir', outputDir,
    '--aspect-ratio', '1:1',
    '--resolution', '2K',
  ];
  if (test) args.push('--test');

  const proc = spawn('python3', args);

  let stderrBuf = '';

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const progress = parseKreaProgress(line);
      if (progress && onProgress) onProgress(progress);
    }
  });

  proc.stderr.on('data', (data) => {
    stderrBuf += data.toString();
  });

  proc.on('close', (code) => {
    if (code === 0) {
      // Find the actual content folder — Krea script sanitizes names differently
      // Look for any folder ending in _Content or _content
      const entries = fs.readdirSync(outputDir, { withFileTypes: true });
      const contentFolder = entries.find(e => e.isDirectory() && /_[Cc]ontent$/.test(e.name));
      const contentDir = contentFolder
        ? path.join(outputDir, contentFolder.name)
        : path.join(outputDir, `${clientName}_Content`);
      if (onComplete) onComplete(contentDir);
    } else {
      if (onError) onError(new Error(`Krea script exited with code ${code}: ${stderrBuf}`));
    }
  });

  return proc;
}

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

  console.log(`[krea] spawning: python3 ${args.join(' ')}`);
  const proc = spawn('python3', args);

  let stderrBuf = '';

  // Per-slide progress: count PNG files in the output tree. Robust against
  // Krea log-format changes. Polls every 2s while the subprocess is alive.
  function countSlidesOnDisk() {
    try {
      const entries = fs.readdirSync(outputDir, { withFileTypes: true });
      const contentDir = entries.find(e => e.isDirectory() && /_[Cc]ontent$/.test(e.name));
      if (!contentDir) return 0;
      const contentPath = path.join(outputDir, contentDir.name);
      let total = 0;
      for (const post of fs.readdirSync(contentPath, { withFileTypes: true })) {
        if (!post.isDirectory()) continue;
        const files = fs.readdirSync(path.join(contentPath, post.name));
        total += files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f)).length;
      }
      return total;
    } catch {
      return 0;
    }
  }

  let lastCount = countSlidesOnDisk();
  let totalSlides = null;
  // Emit an initial progress tick so the UI's progress bar renders immediately
  if (onProgress) onProgress({ current: lastCount, total: null });
  const progressInterval = setInterval(() => {
    const now = countSlidesOnDisk();
    if (now !== lastCount) {
      lastCount = now;
      if (onProgress) onProgress({ current: now, total: totalSlides });
    }
  }, 2000);

  proc.stdout.on('data', (data) => {
    const str = data.toString();
    for (const line of str.split('\n')) {
      if (line.trim()) console.log(`[krea] ${line}`);
      // Accumulate totals as Krea announces each post header.
      // Krea emits either:  [N/10] Post_X_Carousel — Carousel (3 slides)
      //                or:  [N/10] Post_X_Single — Single
      //                or:  [N/10] Post_X_Before_After — Before_After (2 slides)
      const headerMatch = line.match(/^\[(\d+)\/(\d+)\]\s+Post_\d+_\S+\s+—\s+(\S+)(?:\s+\((\d+)\s+slide)?/i);
      if (headerMatch) {
        if (totalSlides == null) totalSlides = 0;
        const declared = headerMatch[4] ? parseInt(headerMatch[4], 10) : 1; // Singles = 1 slide
        totalSlides += declared;
      }
      // Prefer per-slide completion lines if Krea starts emitting them.
      // Our disk-watcher is authoritative either way.
    }
  });

  proc.stderr.on('data', (data) => {
    const str = data.toString();
    stderrBuf += str;
    // Surface Krea errors live
    for (const line of str.split('\n')) {
      if (line.trim()) console.error(`[krea:stderr] ${line}`);
    }
  });

  proc.on('error', (err) => {
    console.error(`[krea] spawn error:`, err.message);
    if (onError) onError(err);
  });

  proc.on('close', (code) => {
    clearInterval(progressInterval);
    console.log(`[krea] process exited with code ${code}`);
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

// scripts/daily-csv-routine/lib/bundle-normalizer.mjs
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const IMAGE_RE = /\.(png|jpe?g|webp|gif|avif)$/i;

/**
 * Flatten a source bundle (zip or folder, possibly with nested zips) into a
 * single directory of loose files. Returns an array of absolute file paths.
 */
export function normalizeBundle(sourcePath, workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  const stat = fs.statSync(sourcePath);

  if (stat.isFile() && sourcePath.toLowerCase().endsWith('.zip')) {
    extractZip(sourcePath, workDir);
  } else if (stat.isDirectory()) {
    copyTree(sourcePath, workDir);
    // expand any nested zips that showed up
    for (const f of fs.readdirSync(workDir)) {
      if (f.toLowerCase().endsWith('.zip')) {
        extractZip(path.join(workDir, f), workDir);
      }
    }
  } else {
    throw new Error(`Unsupported bundle path: ${sourcePath}`);
  }

  return collectFiles(workDir);
}

function extractZip(zipPath, outDir) {
  const zip = new AdmZip(zipPath);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const base = path.basename(entry.entryName);
    if (!base || base.startsWith('.') || entry.entryName.includes('__MACOSX/') || entry.entryName.startsWith('._')) continue;
    zip.extractEntryTo(entry, outDir, false, true);
  }
}

function copyTree(src, dst) {
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const from = path.join(src, ent.name);
    const to = path.join(dst, ent.name);
    if (ent.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyTree(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function collectFiles(dir) {
  const out = [];
  function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else out.push(p);
    }
  }
  walk(dir);
  return out;
}

export function filterImages(files) {
  return files.filter(f => IMAGE_RE.test(f));
}

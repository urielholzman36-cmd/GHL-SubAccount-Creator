// scripts/daily-csv-routine/process-bundle.mjs
//
// Usage: node process-bundle.mjs <client-name> <source-path> [--year=YYYY --month=M --start=YYYY-MM-DD]
//
// Processes a single Manus bundle end-to-end: extract → docx-convert-if-needed →
// parse manifest+post_kits → Cloudinary upload → CSV + summary → Desktop output.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { OUTPUT_ROOT, LOG_DIR, DEFAULT_POSTING_TIME } from './config.mjs';
import { lookupClientByFolder } from './lib/client-registry.mjs';
import { normalizeBundle, filterImages } from './lib/bundle-normalizer.mjs';
import { ensureMdFromDocx } from './lib/docx-converter.mjs';
import { uploadAll } from './lib/cloudinary-uploader.mjs';
import { buildGhlCsv } from './lib/csv-builder.mjs';
import { buildSummary } from './lib/summary-builder.mjs';
import { outputCsvName, outputRunFolder } from './lib/detector.mjs';
import { parseManifestMd, parsePostKitsMd, parseAssetListMd } from '../../server/services/manus-importer.js';

function loadEnvFrom(dotenvPath) {
  if (!fs.existsSync(dotenvPath)) return;
  for (const line of fs.readFileSync(dotenvPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function slideOrder(role) {
  if (!role) return 999;
  const r = role.toLowerCase();
  if (r === 'single') return 1;
  const m = r.match(/^s0*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  return 999;
}

function firstDayOfMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export async function processBundle({ clientName, sourcePath, year, month, startDate, onProgress }) {
  const warnings = [];
  const client = await lookupClientByFolder(clientName);
  if (!client) throw new Error(`Client "${clientName}" not found in hub clients table`);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `csv-routine-${clientName}-`));
  try {
    const files = normalizeBundle(sourcePath, workDir);
    const images = filterImages(files);
    if (images.length === 0) throw new Error('No images found in bundle');

    const generated = ensureMdFromDocx(files, workDir);
    const allFiles = [...files, ...generated];
    const manifestPath = allFiles.find(f => /manifest\.md$/i.test(path.basename(f)));
    const postKitsPath = allFiles.find(f => /post_kits?\.md$/i.test(path.basename(f)));
    if (!manifestPath) throw new Error('No manifest.md or convertible .docx found');

    const manifest = parseManifestMd(manifestPath);
    const kits = postKitsPath ? parsePostKitsMd(postKitsPath) : new Map();

    // Manus format drift: newer bundles split metadata (base manifest) from
    // the final asset filenames (_asset_update or _asset_routing supplement).
    // If the manifest has entries with zero slides, try to populate from a
    // supplement file, then scan for interior carousel slides by filename.
    const missingSlides = [...manifest.values()].some(e => e.slides.length === 0);
    if (missingSlides) {
      const assetSupplement = allFiles.find(f =>
        /_asset_(update|routing)[^/]*\.md$/i.test(path.basename(f))
      );
      if (assetSupplement) {
        const assetMap = parseAssetListMd(assetSupplement);
        for (const [postId, entry] of manifest) {
          if (entry.slides.length === 0 && assetMap.has(postId)) {
            entry.slides.push({ filename: assetMap.get(postId), role: 's01' });
          }
        }

        // Interior carousel slides: scan for CAL-XX_vN_slideM_*.png style
        // filenames and append them to each post. Highest version per slide
        // position wins; slide position drives order.
        const byPostSlide = new Map();
        for (const imagePath of images) {
          const base = path.basename(imagePath);
          const postMatch = base.match(/^([A-Z]{2,}[0-9]*-\d+)_/);
          const slideMatch = base.match(/_slide(\d+)_/i);
          if (!postMatch || !slideMatch) continue;
          const slideNum = parseInt(slideMatch[1], 10);
          if (slideNum < 2) continue;
          const postId = postMatch[1].toUpperCase();
          const versionMatch = base.match(/_v(\d+)_/i);
          const version = versionMatch ? parseInt(versionMatch[1], 10) : 0;
          const key = `${postId}:${slideNum}`;
          const existing = byPostSlide.get(key);
          if (!existing || version > existing.version) {
            byPostSlide.set(key, { filename: base, version });
          }
        }
        const postSlides = {};
        for (const [key, val] of byPostSlide) {
          const [postId, n] = key.split(':');
          (postSlides[postId] ||= []).push({ n: parseInt(n, 10), filename: val.filename });
        }
        for (const postId of Object.keys(postSlides)) {
          const entry = manifest.get(postId);
          if (!entry || entry.slides.length === 0) continue;
          postSlides[postId].sort((a, b) => a.n - b.n);
          for (const s of postSlides[postId]) {
            entry.slides.push({ filename: s.filename, role: `s${String(s.n).padStart(2, '0')}` });
          }
        }
      }
    }

    // Build upload jobs
    const imageByName = new Map(images.map(p => [path.basename(p).toLowerCase(), p]));
    const jobs = [];
    const postsMeta = [];
    for (const [postId, entry] of manifest) {
      const sorted = [...entry.slides].sort((a, b) => slideOrder(a.role) - slideOrder(b.role));
      const slideCount = sorted.length;
      const postJobs = [];
      for (let i = 0; i < sorted.length; i++) {
        const fname = sorted[i].filename;
        const fp = imageByName.get(fname.toLowerCase());
        if (!fp) { warnings.push(`Missing image: ${fname}`); continue; }
        const dayStr = String(entry.day).padStart(2, '0');
        const publicId = slideCount === 1
          ? `${client.cloudinary_folder}/${year}-${String(month).padStart(2, '0')}/day-${dayStr}`
          : `${client.cloudinary_folder}/${year}-${String(month).padStart(2, '0')}/day-${dayStr}-s${String(i + 1).padStart(2, '0')}`;
        postJobs.push({ filepath: fp, publicId });
        jobs.push({ filepath: fp, publicId });
      }
      const kit = kits.get(postId) || {};
      postsMeta.push({ postId, entry, kit, postJobs, slideCount });
    }

    // Upload
    const uploadResults = await uploadAll(jobs, {
      batchSize: 8,
      onProgress: (done, total) => onProgress?.({ phase: 'upload', done, total }),
    });
    const urlByPublicId = new Map();
    for (const r of uploadResults) {
      if (r.error) warnings.push(`Cloudinary upload failed for ${r.publicId}: ${r.error}`);
      else urlByPublicId.set(r.publicId, r.secure_url);
    }

    // Build CSV posts
    const csvPosts = postsMeta.map(({ postId, entry, kit, postJobs }) => ({
      post_id: postId,
      day_number: entry.day,
      post_type: entry.post_type,
      concept: entry.concept,
      caption: kit.caption || null,
      cta: kit.cta || null,
      hashtags: kit.hashtags || null,
      image_urls: postJobs.map(j => urlByPublicId.get(j.publicId)).filter(Boolean),
    })).sort((a, b) => a.day_number - b.day_number);

    const csv = buildGhlCsv(csvPosts, { startDate, postingTime: client.posting_time || DEFAULT_POSTING_TIME });
    const summary = buildSummary(csvPosts, { client: clientName, year, month, startDate, warnings });

    const outDir = path.join(OUTPUT_ROOT, clientName, outputRunFolder(year, month));
    fs.mkdirSync(outDir, { recursive: true });
    const csvFile = path.join(outDir, outputCsvName(clientName, year, month));
    const summaryFile = path.join(outDir, `${clientName}_${MONTHS[month - 1]}_${year}_Summary.md`);
    fs.writeFileSync(csvFile, csv);
    fs.writeFileSync(summaryFile, summary);

    return { csvFile, summaryFile, postCount: csvPosts.length, uploadCount: uploadResults.filter(r => !r.error).length, warnings };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  loadEnvFrom(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '.env'));
  const [,, clientName, sourcePath] = process.argv;
  if (!clientName || !sourcePath) {
    console.error('Usage: node process-bundle.mjs <client> <source-path>');
    process.exit(1);
  }
  const args = Object.fromEntries(process.argv.slice(4).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v];
  }));
  const year = args.year ? parseInt(args.year, 10) : null;
  const month = args.month ? parseInt(args.month, 10) : null;
  if (!year || !month) {
    console.error('Please pass --year=YYYY --month=M');
    process.exit(1);
  }
  const startDate = args.start || firstDayOfMonth(year, month);
  processBundle({ clientName, sourcePath, year, month, startDate, onProgress: e => console.log(`  ${e.phase}: ${e.done}/${e.total}`) })
    .then(r => { console.log('✓', r); })
    .catch(e => { console.error('✗', e); process.exit(1); });
}

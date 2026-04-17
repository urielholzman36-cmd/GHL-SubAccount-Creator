/**
 * Manus importer — takes a bundle of images (+ optional captions file) that
 * Manus produced and turns it into campaign_posts ready for review & export.
 *
 * Intentionally flexible with filenames because Manus doesn't always follow
 * our ideal naming spec. Heuristics:
 *
 *   - Extracts the first integer in the filename as the "day number"
 *   - Multiple files sharing a day → carousel (unless they match before/after)
 *   - Filename containing /before/i + /after/i (or _b_ / _a_) → before_after pair
 *   - Otherwise → single
 *
 * Captions can arrive as CSV, JSON, or markdown. We merge by day number.
 */

import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { parse as parseCsvSync } from 'csv-parse/sync';

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif|heic|heif)$/i;
const CAPTION_EXT_RE = /\.(csv|json|md|txt)$/i;
// Manus-style filenames we always ignore when flattening a bundle: they're
// production artifacts Claude Code doesn't need for import.
const IGNORABLE_MD = /(?:prompt_pack|format_matrix|month_plan|month_plan_template)\.md$/i;

// ── Filename parsing ─────────────────────────────────────────────────────

function inferPostType(filenames) {
  const joined = filenames.join('|').toLowerCase();
  const hasBefore = /(?:^|[^a-z])before(?:[^a-z]|$)/.test(joined);
  const hasAfter  = /(?:^|[^a-z])after(?:[^a-z]|$)/.test(joined);
  if (hasBefore && hasAfter) return 'before_after';
  if (filenames.length >= 2) return 'carousel';
  return 'single';
}

function extractDayNumber(filename) {
  const name = path.basename(filename).toLowerCase().replace(/\.[^.]+$/, '');
  // Tier 1: strongest markers — post_01, day_01, img01, image_3, slide-12
  // Don't use \b (underscore is a word char); use non-letter / start-of-string
  // before the keyword, and negative lookahead (?!\d) after the digits.
  const tier1 = name.match(/(?:^|[^a-z])(?:post|day|img|image|pic|slide)[\s_-]?0*(\d{1,3})(?!\d)/);
  if (tier1) return parseInt(tier1[1], 10);
  // Tier 2: 2–3 digit run surrounded by underscores/dashes/start/end — strong
  // candidate for a day number (e.g. "post_05", "_12_", "05-a").
  const tier2 = name.match(/(?:^|[_-])0*(\d{2,3})(?=[_-]|$)/);
  if (tier2) return parseInt(tier2[1], 10);
  // Tier 3: a 2–3 digit standalone run anywhere (not part of a longer number).
  const tier3 = name.match(/(?<![0-9])(\d{2,3})(?![0-9])/);
  if (tier3) return parseInt(tier3[1], 10);
  // Last resort: any digit run (single digits etc.)
  const any = name.match(/(\d+)/);
  return any ? parseInt(any[1], 10) : null;
}

function slideOrder(filename) {
  const name = path.basename(filename).toLowerCase();
  // before/after — before comes first
  if (/(?:^|[^a-z])before(?:[^a-z]|$)/.test(name)) return 1;
  if (/(?:^|[^a-z])after(?:[^a-z]|$)/.test(name)) return 2;
  // slide_1 / slide1 / slide-1
  const slideExplicit = name.match(/slide[\s_-]?(\d+)/);
  if (slideExplicit) return parseInt(slideExplicit[1], 10);
  // letter suffix _a / _b / _c / _d (immediately before extension)
  const letter = name.match(/_([a-d])(?=\.[a-z]+$)/);
  if (letter) return 'abcd'.indexOf(letter[1]) + 1;
  return 999;
}

/**
 * Group a flat list of image paths into posts keyed by day number.
 */
export function groupImagesByPost(imagePaths) {
  const byDay = new Map();
  const orphans = [];

  for (const p of imagePaths) {
    const day = extractDayNumber(p);
    if (day == null) { orphans.push(p); continue; }
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(p);
  }

  const posts = Array.from(byDay.entries())
    .map(([day, files]) => {
      const sorted = [...files].sort((a, b) => slideOrder(a) - slideOrder(b));
      const post_type = inferPostType(sorted);
      return { day_number: day, post_type, files: sorted };
    })
    .sort((a, b) => a.day_number - b.day_number);

  return { posts, orphans };
}

// ── Captions parsing ─────────────────────────────────────────────────────

function normalizeKey(k) {
  return String(k || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickField(row, candidates) {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const want = normalizeKey(cand);
    const match = keys.find((k) => normalizeKey(k) === want);
    if (match) return row[match];
  }
  return null;
}

function parseCaptionsCsv(text) {
  const rows = parseCsvSync(text, { columns: true, skip_empty_lines: true, bom: true });
  return rows.map((r) => ({
    day: parseInt(pickField(r, ['day', 'day_number', 'post_day', 'post']) ?? '', 10),
    pillar: pickField(r, ['pillar']) || null,
    post_type: (pickField(r, ['post_type', 'type', 'format']) || '').toString().toLowerCase() || null,
    concept: pickField(r, ['concept', 'theme', 'topic']) || null,
    caption: pickField(r, ['caption', 'copy', 'body', 'text']) || null,
    hashtags: pickField(r, ['hashtags', 'tags']) || null,
    cta: pickField(r, ['cta', 'call_to_action']) || null,
  })).filter((r) => !Number.isNaN(r.day));
}

function parseCaptionsJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  const arr = Array.isArray(data) ? data : (Array.isArray(data?.posts) ? data.posts : []);
  return arr.map((r) => ({
    day: parseInt(r.day ?? r.day_number ?? r.post ?? '', 10),
    pillar: r.pillar || null,
    post_type: (r.post_type || r.type || '').toLowerCase() || null,
    concept: r.concept || r.theme || null,
    caption: r.caption || r.copy || r.body || null,
    hashtags: Array.isArray(r.hashtags) ? r.hashtags.join(' ') : (r.hashtags || null),
    cta: r.cta || null,
  })).filter((r) => !Number.isNaN(r.day));
}

function parseCaptionsMarkdown(text) {
  // Best-effort: look for "Day N" or "Post N" section headers.
  const sections = text.split(/^(?:#{1,3}\s*)?(?:day|post)\s*#?\s*(\d+)/im);
  const out = [];
  for (let i = 1; i < sections.length; i += 2) {
    const day = parseInt(sections[i], 10);
    const body = (sections[i + 1] || '').trim();
    if (!day || !body) continue;
    const hashtagLine = body.match(/(#\w+(?:\s+#\w+)*)/);
    out.push({
      day,
      pillar: null,
      post_type: null,
      concept: null,
      caption: body.replace(/(#\w+(?:\s+#\w+)*)/, '').trim(),
      hashtags: hashtagLine ? hashtagLine[1] : null,
      cta: null,
    });
  }
  return out;
}

export function parseCaptionsFile(filepath) {
  const text = fs.readFileSync(filepath, 'utf8');
  const ext = path.extname(filepath).toLowerCase();
  if (ext === '.csv') return parseCaptionsCsv(text);
  if (ext === '.json') return parseCaptionsJson(text);
  // md / txt / unknown → try markdown heuristic
  return parseCaptionsMarkdown(text);
}

// ── Bundle extraction ────────────────────────────────────────────────────

/**
 * Flatten an uploaded directory or ZIP into a list of file paths on disk.
 * All files end up in `outDir`. Returns absolute paths.
 */
export function extractBundle(inputFiles, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const extracted = [];

  for (const file of inputFiles) {
    const lower = file.originalname.toLowerCase();
    if (lower.endsWith('.zip')) {
      const zip = new AdmZip(file.path);
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        const name = path.basename(entry.entryName);
        if (!name || name.startsWith('.') || name.startsWith('__MACOSX')) continue;
        // Skip hidden macOS metadata
        if (entry.entryName.includes('__MACOSX/') || entry.entryName.startsWith('._')) continue;
        const dest = path.join(outDir, name);
        zip.extractEntryTo(entry, outDir, /*maintainEntryPath*/ false, /*overwrite*/ true);
        extracted.push(dest);
      }
      // Clean up the uploaded ZIP
      try { fs.unlinkSync(file.path); } catch {}
    } else {
      const dest = path.join(outDir, file.originalname);
      fs.renameSync(file.path, dest);
      extracted.push(dest);
    }
  }

  return extracted;
}

export function splitByKind(files) {
  const images = [];
  const captions = [];
  const other = [];
  let manifest = null;
  let postKits = null;
  let recapSeed = null;
  for (const f of files) {
    const base = path.basename(f).toLowerCase();
    if (IMAGE_EXT_RE.test(f)) { images.push(f); continue; }
    // Recognize Manus's special markdown files by name
    if (/manifest\.md$/i.test(base)) { manifest = f; continue; }
    if (/post_kits?\.md$/i.test(base)) { postKits = f; continue; }
    if (/recap.*seed.*\.md$/i.test(base)) { recapSeed = f; continue; }
    if (IGNORABLE_MD.test(base)) { other.push(f); continue; }
    if (CAPTION_EXT_RE.test(f)) { captions.push(f); continue; }
    other.push(f);
  }
  return { images, captions, other, manifest, postKits, recapSeed };
}

// ── Manifest parser ──────────────────────────────────────────────────────

/**
 * Parse Manus's manifest.md. The manifest is a markdown table whose rows pair
 * a post_id + day + post_type + concept + filename + slide role.
 *
 * Returns: Map<post_id, { day, post_type, concept, slides: [{ filename, role }] }>
 */
export function parseManifestMd(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /^\s*\|\s*day\s*\|/i.test(l));
  if (headerIdx === -1) return new Map();
  const headerCells = lines[headerIdx]
    .split('|').map((s) => s.trim()).filter(Boolean)
    .map(normalizeKey);
  const colIdx = (...cands) => {
    for (const cand of cands) {
      const want = normalizeKey(cand);
      const i = headerCells.indexOf(want);
      if (i !== -1) return i;
    }
    return -1;
  };
  const idxDay = colIdx('day');
  const idxPostId = colIdx('postid', 'post_id', 'id');
  const idxType = colIdx('posttype', 'post_type', 'type');
  const idxConcept = colIdx('concepttitle', 'concept_title', 'concept', 'title');
  const idxFilename = colIdx('filename', 'asset', 'file');
  const idxRole = colIdx('sliderole', 'slide_role', 'role', 'slide');

  const map = new Map();
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*\|/.test(line)) break; // out of table
    const cells = line.split('|').map((s) => s.trim());
    // Leading empty cell exists before first |; drop first empty element
    const trimmed = cells.filter((_, j) => j !== 0 && j !== cells.length - 1);
    const get = (i) => (i >= 0 && i < trimmed.length ? trimmed[i].replace(/^`|`$/g, '') : '');
    const postId = get(idxPostId).toUpperCase();
    if (!postId) continue;

    const day = parseInt(get(idxDay), 10);
    const post_type = (get(idxType) || '').toLowerCase();
    const concept = get(idxConcept);
    const filename = path.basename(get(idxFilename));
    const role = get(idxRole);

    let entry = map.get(postId);
    if (!entry) {
      entry = { post_id: postId, day, post_type, concept, slides: [] };
      map.set(postId, entry);
    }
    if (filename) entry.slides.push({ filename, role });
  }
  return map;
}

function slideOrderFromRole(role) {
  if (!role) return 999;
  const r = role.toLowerCase();
  if (r === 'single' || r === 's01' || r === 's1') return 1;
  const m = r.match(/^s0*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  if (r === 'before') return 1;
  if (r === 'after') return 2;
  return 999;
}

// ── Post Kits (captions) parser — Manus format ──────────────────────────

/**
 * Parse Manus's post_kits.md. Format is a series of per-post sections:
 *
 *   ## LYR-01 — Title
 *   | Field | Content |
 *   |---|---|
 *   | Post type | single_image |
 *   | Caption | The actual caption text... |
 *   | CTA | ... |
 *   | Hashtags | #A #B |
 *
 * Returns: Map<post_id, { caption, cta, hashtags, description, post_type }>
 */
export function parsePostKitsMd(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  const map = new Map();
  // Split on H2 headers that start with a post_id pattern
  const sections = raw.split(/^##\s+([A-Z]{2,}-\d+)\s*[—-]\s*(.*)$/m);
  // split result: [prefix, id1, title1, body1, id2, title2, body2, ...]
  for (let i = 1; i + 2 < sections.length; i += 3) {
    const postId = sections[i].trim().toUpperCase();
    const title = (sections[i + 1] || '').trim();
    const body = sections[i + 2] || '';
    const fields = {};
    for (const line of body.split(/\r?\n/)) {
      if (!/^\s*\|/.test(line)) continue;
      const cells = line.split('|').map((s) => s.trim()).filter((_, j, arr) => j !== 0 && j !== arr.length - 1);
      if (cells.length < 2) continue;
      const key = normalizeKey(cells[0]);
      // Header row | Field | Content | and separator |---|---| should be skipped
      if (!key || key === 'field' || key.startsWith('-')) continue;
      const value = cells.slice(1).join(' | ').trim();
      fields[key] = value;
    }
    map.set(postId, {
      title,
      post_type: (fields.posttype || '').toLowerCase() || null,
      caption: fields.caption || null,
      description: fields.description || null,
      cta: fields.cta || null,
      hashtags: fields.hashtags || null,
    });
  }
  return map;
}

// ── Top-level importer ───────────────────────────────────────────────────

/**
 * Normalize Manus's post_type strings to our campaign_posts.post_type values.
 * We store only: single / carousel / before_after. Everything else maps to
 * single for rendering purposes, but the original type is preserved on the
 * post row's `category` field so the recap / CSV still reflects the nuance.
 */
function normalizePostType(raw) {
  if (!raw) return { post_type: null, category: null };
  const t = String(raw).toLowerCase().trim();
  if (t === 'carousel') return { post_type: 'carousel', category: 'carousel' };
  if (t === 'before_after' || t === 'before-after' || t === 'beforeafter') {
    return { post_type: 'before_after', category: 'before_after' };
  }
  // Everything else (single_image, comparison, checklist, stats, quote,
  // infographic, cta, etc.) renders as a single, but we keep the nuance.
  return { post_type: 'single', category: t };
}

export function parseManusBundle(inputFiles, outDir) {
  const flat = extractBundle(inputFiles, outDir);
  const { images, captions, other, manifest, postKits, recapSeed } = splitByKind(flat);

  let recapSeedText = null;
  if (recapSeed) {
    try { recapSeedText = fs.readFileSync(recapSeed, 'utf8'); }
    catch {}
  }

  // ── Path A: manifest-driven (authoritative) ───────────────────────
  if (manifest) {
    const manifestMap = parseManifestMd(manifest);
    const kitsMap = postKits ? parsePostKitsMd(postKits) : new Map();
    const imageByName = new Map(images.map((p) => [path.basename(p).toLowerCase(), p]));

    const merged = [];
    const missingFiles = [];
    for (const [postId, entry] of manifestMap) {
      const kit = kitsMap.get(postId) || {};
      // Resolve each slide's absolute path on disk
      const resolvedSlides = entry.slides
        .map((s) => ({
          ...s,
          fullpath: imageByName.get(s.filename.toLowerCase()) || null,
        }))
        .sort((a, b) => slideOrderFromRole(a.role) - slideOrderFromRole(b.role));

      const filesOnDisk = resolvedSlides.map((s) => s.fullpath).filter(Boolean);
      for (const s of resolvedSlides) if (!s.fullpath) missingFiles.push(s.filename);

      const { post_type, category } = normalizePostType(entry.post_type || kit.post_type);

      merged.push({
        post_id: postId,
        day_number: entry.day,
        post_type,
        category,
        pillar: null,
        concept: entry.concept || kit.title || null,
        caption: kit.caption || null,
        hashtags: kit.hashtags || null,
        cta: kit.cta || null,
        description: kit.description || null,
        files: filesOnDisk,
      });
    }
    merged.sort((a, b) => (a.day_number || 0) - (b.day_number || 0));

    // Images in the bundle that the manifest never referenced
    const usedBaseNames = new Set(
      merged.flatMap((p) => p.files.map((f) => path.basename(f).toLowerCase()))
    );
    const unmatchedImages = images.filter((p) => !usedBaseNames.has(path.basename(p).toLowerCase()));

    return {
      source: 'manifest',
      posts: merged,
      unmatched_images: unmatchedImages,
      unmatched_captions: [],
      missing_files: missingFiles,
      other_files: other,
      recap_seed: recapSeedText,
    };
  }

  // ── Path B: filename-heuristic (legacy / non-manifest clients) ────
  const { posts: imagePosts, orphans } = groupImagesByPost(images);
  const captionRows = [];
  for (const cf of captions) {
    try { captionRows.push(...parseCaptionsFile(cf)); } catch (err) {
      console.warn(`[manus-importer] failed to parse captions file ${cf}:`, err.message);
    }
  }
  const captionsByDay = new Map(captionRows.map((r) => [r.day, r]));
  const merged = imagePosts.map((p) => {
    const cap = captionsByDay.get(p.day_number) || {};
    const { post_type, category } = normalizePostType(cap.post_type || p.post_type);
    return {
      day_number: p.day_number,
      post_type,
      category,
      pillar: cap.pillar || null,
      concept: cap.concept || null,
      caption: cap.caption || null,
      hashtags: cap.hashtags || null,
      cta: cap.cta || null,
      files: p.files,
    };
  });
  const usedDays = new Set(merged.map((p) => p.day_number));
  const extraCaptions = captionRows.filter((r) => !usedDays.has(r.day));

  return {
    source: 'filename',
    posts: merged,
    unmatched_images: orphans,
    unmatched_captions: extraCaptions,
    missing_files: [],
    other_files: other,
    recap_seed: recapSeedText,
  };
}

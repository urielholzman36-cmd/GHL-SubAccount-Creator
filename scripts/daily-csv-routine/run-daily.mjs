// scripts/daily-csv-routine/run-daily.mjs
//
// Usage:
//   node run-daily.mjs           # real run
//   node run-daily.mjs --dry-run # list pending, don't process

import fs from 'fs';
import path from 'path';
import { WATCH_ROOT, OUTPUT_ROOT, LOG_DIR } from './config.mjs';
import { detectPendingBundles } from './lib/detector.mjs';
import { processBundle } from './process-bundle.mjs';
import { notify } from './lib/notifier.mjs';

function loadEnvFrom(dotenvPath) {
  if (!fs.existsSync(dotenvPath)) return;
  for (const line of fs.readFileSync(dotenvPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

function ensureLogDir() { fs.mkdirSync(LOG_DIR, { recursive: true }); }

function logLine(msg) {
  ensureLogDir();
  const stamp = new Date().toISOString();
  const file = path.join(LOG_DIR, `${stamp.slice(0, 10)}.log`);
  fs.appendFileSync(file, `[${stamp}] ${msg}\n`);
  console.log(msg);
}

function firstDayOfMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const envPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '.env');
  loadEnvFrom(envPath);

  logLine(`=== Daily CSV routine start (dryRun=${dryRun}) ===`);
  const pending = detectPendingBundles(WATCH_ROOT, OUTPUT_ROOT);
  logLine(`Pending bundles: ${pending.length}`);
  for (const p of pending) logLine(`  - ${p.client} ${p.year}-${p.month}: ${p.sourcePath}`);

  if (dryRun || pending.length === 0) {
    if (pending.length === 0) logLine('Nothing to do.');
    logLine('=== End ===');
    return;
  }

  const results = [];
  const failures = [];
  for (const p of pending) {
    try {
      logLine(`Processing ${p.client} ${p.year}-${p.month}...`);
      const res = await processBundle({
        clientName: p.client,
        sourcePath: p.sourcePath,
        year: p.year,
        month: p.month,
        startDate: firstDayOfMonth(p.year, p.month),
        onProgress: e => logLine(`    ${e.phase}: ${e.done}/${e.total}`),
      });
      logLine(`  ✓ ${res.postCount} posts, ${res.uploadCount} images uploaded${res.warnings.length ? `, ${res.warnings.length} warnings` : ''}`);
      if (res.warnings.length) for (const w of res.warnings) logLine(`    ⚠ ${w}`);
      results.push({ client: p.client, ...res });
    } catch (err) {
      logLine(`  ✗ Failed: ${err.message}`);
      failures.push({ client: p.client, month: p.month, error: err.message });
    }
  }

  // Notify
  if (results.length > 0) {
    const summary = results.map(r => `${r.client} (${r.postCount})`).join(', ');
    notify({ title: 'CSV Routine', subtitle: `${results.length} bundle${results.length > 1 ? 's' : ''} ready`, message: summary });
  }
  if (failures.length > 0) {
    notify({ title: 'CSV Routine — Errors', subtitle: `${failures.length} failed`, message: failures.map(f => `${f.client}: ${f.error}`).join('\n') });
  }

  logLine('=== End ===');
}

main().catch(e => {
  logLine(`FATAL: ${e.message}\n${e.stack}`);
  notify({ title: 'CSV Routine', subtitle: 'Fatal error', message: e.message });
  process.exit(1);
});

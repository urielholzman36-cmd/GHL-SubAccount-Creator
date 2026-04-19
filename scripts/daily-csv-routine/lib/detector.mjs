// scripts/daily-csv-routine/lib/detector.mjs
import fs from 'fs';
import path from 'path';
import { parseMonthFromPath } from './month-parser.mjs';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

export function outputCsvName(client, year, month) {
  return `${client}_${MONTHS[month - 1]}_${year}_GHL_Schedule.csv`;
}

function listDir(p) {
  try { return fs.readdirSync(p, { withFileTypes: true }); }
  catch { return []; }
}

/**
 * Scan the watch root for pending bundles.
 * A bundle is pending when:
 *   - its path has a parseable YYYY_MM prefix
 *   - client has an output subfolder
 *   - target CSV does not exist in that output subfolder
 */
export function detectPendingBundles(watchRoot, outputRoot) {
  const pending = [];
  for (const clientEnt of listDir(watchRoot)) {
    if (!clientEnt.isDirectory()) continue;
    if (clientEnt.name.startsWith('.') || clientEnt.name.startsWith('_')) continue;
    const clientName = clientEnt.name.trim();
    const outputSubdir = path.join(outputRoot, clientName);
    if (!fs.existsSync(outputSubdir)) continue; // not an automated client

    const clientDir = path.join(watchRoot, clientEnt.name);
    for (const ent of listDir(clientDir)) {
      const parsed = parseMonthFromPath(ent.name);
      if (!parsed) continue;
      const csvName = outputCsvName(clientName, parsed.year, parsed.month);
      if (fs.existsSync(path.join(outputSubdir, csvName))) continue;
      pending.push({
        client: clientName,
        year: parsed.year,
        month: parsed.month,
        sourcePath: path.join(clientDir, ent.name),
        kind: ent.isDirectory() ? 'folder' : 'zip',
      });
    }
  }
  return pending;
}

#!/usr/bin/env node
// One-off: generates a sample M4 Report PDF with realistic mock data and saves
// to ~/Desktop/sample-report.pdf so the user can eyeball the output.
// Also prints the narrative JSON so we can see the AI output quality.
//
// Usage: node scripts/generate-sample-report.mjs

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateNarrative } from '../server/modules/reports/services/narrative-generator.js';
import { buildReportPdf } from '../server/modules/reports/services/pdf-builder.js';

const data = {
  month: '2026-09',
  leads_count: 47,
  leads_mom_pct: 24,
  prior_month: '2026-08',
  prior_leads_count: 38,
  lead_sources: [
    { source: 'Meta Ads',   count: 20, pct: 43 },
    { source: 'Google Ads', count: 15, pct: 32 },
    { source: 'Organic',    count: 8,  pct: 17 },
    { source: 'Referral',   count: 4,  pct: 9  },
  ],
  appointments_booked: 19,
  appointments_showed: 14,
  show_rate_pct: 74,
  converted_count: 10,
  converted_rate_pct: 53,
};

console.log('=== Sample report generation ===');
console.log('Client: Restoration Pro NW');
console.log('Month:  September 2026');
console.log('Data:', JSON.stringify(data, null, 2));
console.log('\nGenerating narrative via Claude Sonnet 4.6...');

const narrative = await generateNarrative({
  clientName: 'Restoration Pro NW',
  industry: 'Water damage restoration',
  data,
});

console.log('\n=== Narrative ===');
console.log('Executive Summary:');
console.log(narrative.exec_summary);
console.log('\nRecommendations:');
for (const rec of narrative.recommendations) console.log(`  • ${rec}`);

console.log('\nBuilding PDF...');
const pdf = await buildReportPdf({
  clientName: 'Restoration Pro NW',
  month: '2026-09',
  generatedAt: new Date(),
  data,
  narrative,
});

const outPath = path.join(os.homedir(), 'Desktop', 'sample-report.pdf');
fs.writeFileSync(outPath, pdf);
console.log(`\nPDF (${pdf.length.toLocaleString()} bytes) saved to: ${outPath}`);
console.log('Open it with: open "' + outPath + '"');

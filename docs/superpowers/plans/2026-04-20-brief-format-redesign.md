# Company Master Brief Format Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Company Master Brief generator to produce a new hybrid 4-group / 13-section format with inline tables, add a `.docx` export, and give operators a two-pass edit-and-save flow on the Client Detail page.

**Architecture:** Rewrite the LLM prompt in `brief-generator.js` with the new structure and `[inferred]` tagging rule. New `server/services/brief-docx.js` parses the markdown brief into `docx` package primitives (headings, paragraphs, bullets, tables, divider, blockquote) and streams a rendered Word file. Two new routes — `PUT /:id/brief` saves operator edits and `GET /:id/brief.docx` streams the Word export. The brief UI on `ClientDetail.jsx` gains an editable textarea, Save button, Preview toggle (via existing `react-markdown`), a `.docx` download button, and a Draft/Final status badge.

**Tech Stack:** Node.js + Express, `@libsql/client` (Turso), `@anthropic-ai/sdk` (claude-sonnet-4-6), `docx` npm package, React 19 + Vite + Tailwind, `react-markdown`, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-20-brief-format-redesign.md`

---

## File Structure

**New files:**
- `server/services/brief-docx.js` — markdown → DOCX converter scoped to the brief format
- `tests/server/brief-docx.test.js` — converter unit tests
- `tests/server/brief-generator-format.test.js` — prompt-builder + filename-helper tests

**Modified files:**
- `server/services/brief-generator.js` — new prompt (4 groups / 13 sections / cover block / tables / `[inferred]` rule), model upgrade, split out `buildBriefPrompt()` for testability
- `server/db/index.js` — add `client_brief_status` column migration
- `server/routes/clients.js` — add `PUT /:id/brief` (save edits) + `GET /:id/brief.docx` (stream DOCX); update existing `POST /generate-brief` to set `client_brief_status = 'draft'`
- `src/pages/ClientDetail.jsx` — editable textarea · Save button · Preview toggle · Download .docx · status badge · unsaved-changes guard

---

## Task 1: DB migration — `client_brief_status` column

**Files:**
- Modify: `server/db/index.js`
- Test: append to existing `tests/server/db.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/server/db.test.js`:

```javascript
describe('client_brief_status column migration', () => {
  let db;
  beforeAll(async () => {
    db = createClient({ url: 'file::memory:' });
    await initializeDb(db);
  });

  it('adds client_brief_status to clients with default draft', async () => {
    const info = await db.execute('PRAGMA table_info(clients)');
    const col = info.rows.find((r) => r.name === 'client_brief_status');
    expect(col).toBeTruthy();
    expect(col.dflt_value).toMatch(/draft/);
  });
});
```

(If `createClient`/`initializeDb` imports are already at the top of the file from earlier tasks, do NOT duplicate them.)

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/server/db.test.js -t "client_brief_status"`
Expected: FAIL (column does not exist).

- [ ] **Step 3: Add the migration**

In `server/db/index.js`, locate the existing `ccCols` array (the additive migration block for the `clients` table). Add one new line so the array includes:

```javascript
    ['client_brief_status', "TEXT DEFAULT 'draft'"],
```

Place it alongside the other `client_brief*` columns (`client_brief`, `client_brief_generated_at`). The existing loop that runs `ALTER TABLE clients ADD COLUMN` for any missing column will pick it up automatically.

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run tests/server/db.test.js -t "client_brief_status"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db/index.js tests/server/db.test.js
git commit -m "feat(brief): add client_brief_status column (draft|final)"
```

---

## Task 2: Rewrite `brief-generator.js` with new format + Sonnet 4.6

**Files:**
- Modify: `server/services/brief-generator.js`
- Create: `tests/server/brief-generator-format.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/server/brief-generator-format.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { buildBriefPrompt, briefFilename, clientFilenameSlug } from '../../server/services/brief-generator.js';

describe('briefFilename + clientFilenameSlug', () => {
  it('slugifies names', () => {
    expect(clientFilenameSlug('Lyrie.ai')).toBe('Lyrie_ai');
    expect(clientFilenameSlug('HSP - San Diego')).toBe('HSP_San_Diego');
    expect(briefFilename('Restoration Pro NW')).toBe('Restoration_Pro_NW_company_master_brief.md');
  });
});

describe('buildBriefPrompt', () => {
  const client = {
    name: 'Restoration Pro NW',
    industry: 'Water damage restoration',
    website: 'https://restorationprosnw.com',
    city: 'Mukilteo',
    state: 'WA',
    phone: '425-595-4500',
    email: 'info@restorationprosnw.com',
    brand_personality: 'Trustworthy, calm, emergency-ready',
    brand_mood_description: 'Reassuring emergency-response',
    recommended_surface_style: 'clean geometric cards',
    brand_colors_json: JSON.stringify({ primary: '#0A2540', secondary: '#06B6D4', accent: '#F97316' }),
    industry_cues_json: JSON.stringify(['water droplet', 'shield icon']),
    services: JSON.stringify(['Water Damage Restoration', 'Fire Damage', 'Mold Remediation']),
  };

  it('returns {system, user} strings', () => {
    const { system, user } = buildBriefPrompt(client);
    expect(typeof system).toBe('string');
    expect(typeof user).toBe('string');
  });

  it('system prompt enumerates the 4 ABOUT THE X groups and 13 numbered sections', () => {
    const { system } = buildBriefPrompt(client);
    expect(system).toMatch(/ABOUT THE BUSINESS/);
    expect(system).toMatch(/ABOUT THE AUDIENCE/);
    expect(system).toMatch(/ABOUT THE BRAND/);
    expect(system).toMatch(/ABOUT THE MARKETING/);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      expect(system).toContain(`${n}.`);
    }
  });

  it('system prompt mandates the [inferred] tag for non-sourced fields', () => {
    const { system } = buildBriefPrompt(client);
    expect(system).toMatch(/\[inferred\]/);
  });

  it('system prompt requires markdown tables for Objections and Palette', () => {
    const { system } = buildBriefPrompt(client);
    expect(system).toMatch(/Objection.*Response Strategy/is);
    expect(system).toMatch(/Color Name.*Hex Code.*Usage/is);
  });

  it('system prompt requires cover block with CONFIDENTIAL + Version 1.0', () => {
    const { system } = buildBriefPrompt(client);
    expect(system).toMatch(/CLIENT BRIEF MASTER/);
    expect(system).toMatch(/Version 1\.0/);
    expect(system).toMatch(/CONFIDENTIAL/);
  });

  it('user prompt includes the client name, industry, and palette hex codes', () => {
    const { user } = buildBriefPrompt(client);
    expect(user).toContain('Restoration Pro NW');
    expect(user).toContain('Water damage restoration');
    expect(user).toContain('#0A2540');
    expect(user).toContain('#06B6D4');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (`buildBriefPrompt` not exported)**

Run: `npx vitest run tests/server/brief-generator-format.test.js`
Expected: FAIL.

- [ ] **Step 3: Rewrite `server/services/brief-generator.js`**

Replace the file with:

```javascript
/**
 * Mode A — Company Master Brief generator.
 *
 * Produces exactly ONE document per client in the new hybrid format:
 *   [ClientName]_company_master_brief.md
 *
 * Cover block + 4 "ABOUT THE X" groups + 13 numbered sections + 2 tables
 * (Objections · Palette). Every field not sourced from the client record is
 * suffixed [inferred]. Palette rows must come from the extracted palette —
 * never invented hex codes.
 *
 * See docs/superpowers/specs/2026-04-20-brief-format-redesign.md
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

function parseList(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.filter(Boolean);
  } catch {}
  return String(raw).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

function parsePalette(raw) {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return { array: v };
    if (v && typeof v === 'object') return v;
  } catch {}
  return null;
}

export function clientFilenameSlug(name) {
  return String(name || 'client')
    .trim()
    .replace(/[^\w\s.-]/g, '')
    .replace(/[\s.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function briefFilename(clientName) {
  return `${clientFilenameSlug(clientName)}_company_master_brief.md`;
}

export function briefDocxFilename(clientName) {
  return `${clientFilenameSlug(clientName)}_company_master_brief.docx`;
}

function monthYearLabel(date = new Date()) {
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${names[date.getMonth()]} ${date.getFullYear()}`;
}

export function buildBriefPrompt(client, { now = new Date() } = {}) {
  const services = parseList(client.services);
  const industryCues = parseList(client.industry_cues_json);
  const palette = parsePalette(client.brand_colors_json) || parsePalette(client.brand_palette_json);

  const paletteBlock = palette
    ? (palette.array
        ? palette.array.map((c, i) => `Color ${i + 1}: ${c}`).join('\n')
        : Object.entries(palette).map(([k, v]) => `${k}: ${v}`).join('\n'))
    : '(no palette extracted — mark all palette rows [inferred] and extract from brand/logo description)';

  const rawInput = `
Business Name: ${client.name || ''}
Industry: ${client.industry || ''}
Website: ${client.website || ''}
Location: ${[client.city, client.state].filter(Boolean).join(', ') || client.location || ''}
Address: ${client.address || ''}
Contact: ${client.contact_name || ''}${client.email ? ` · ${client.email}` : ''}${client.phone ? ` · ${client.phone}` : ''}
Brand Tone (raw): ${client.brand_tone || ''}
Brand Description: ${client.brand_description || ''}
Target Audience: ${client.target_audience || ''}
Services (raw): ${services.length ? services.join(', ') : ''}

Auto-analysis of logo + profile (if run):
- Palette (logo-derived, AI-mapped):
${paletteBlock}
- Personality: ${client.brand_personality || ''}
- Mood: ${client.brand_mood_description || ''}
- Surface style: ${client.recommended_surface_style || ''}
- Industry visual cues: ${industryCues.length ? industryCues.join(', ') : ''}
`.trim();

  const system = `You are supporting a lean monthly social content production system shared with Manus.

Your role right now is Mode A — **New Client Onboarding**. You will produce exactly ONE Markdown document:

  ${briefFilename(client.name)}

Do NOT split the company into multiple files. Build ONE decision-ready master brief that Manus can use without reconstructing the business from scattered notes.

## Cover block (first lines, exactly this shape)

# ${client.name}
## CLIENT BRIEF MASTER
> "{tagline if known, else [inferred] short positioning line in quotes}"
Internal Strategic Document · Version 1.0 · ${monthYearLabel(now)} · CONFIDENTIAL

---

## Required structure — 4 "ABOUT THE X" groups with 13 numbered sections

Use Markdown H2 headings for each "ABOUT THE X" group and H3 headings for each numbered section.

## ABOUT THE BUSINESS

### 1. Company Overview
Labeled fields: **Name**, **Industry**, **Business Type**, **Founded**, **Location**, **Website**, **Phone**, **Address**.

### 2. Mission & Value Proposition
2-3 paragraphs: mission + core value prop.

### 3. Services & Offerings
Bullet list. Each item: "Service Name — short description".

### 4. Competitive Positioning
- **Unique Selling Proposition:** one paragraph
- **Key Competitors:** comma-separated, 3-5 names
- **Key Differentiators:** bullet list

## ABOUT THE AUDIENCE

### 5. Target Audience
Labeled fields: **Primary Segment**, **Special Focus**, **Demographics**, **Pain Points**, **Decision Maker**, **Tech Comfort**.

### 6. Common Objections & Concerns
A Markdown table with this exact header row:

| Objection | Response Strategy |
|---|---|

3-5 rows.

## ABOUT THE BRAND

### 7. Brand Identity & Tone of Voice
Labeled fields: **Brand Personality**, **Tone of Voice**, **Communication Style**, **Visual Feel**, **What We Avoid**.

### 8. Visual Palette
A Markdown table with this exact header row:

| Color Name | Hex Code | Usage |
|---|---|---|

Rows must come from the provided palette. Never invent hex codes. If no palette was extracted, mark every row [inferred] and derive from the brand description.

### 9. Typography & Style Rules
- **Headings:** font name
- **Body Text:** font name
- **Brand Messaging DO:** bullet list
- **Brand Messaging DON'T:** bullet list

## ABOUT THE MARKETING

### 10. Digital Presence & Platforms
Labeled fields: **Primary Platforms**, **Secondary Platforms**, **Content Frequency**, **Content Strategy**, **Previous Efforts**.

### 11. Business Goals
Labeled fields: **Primary Goal**, **Content Target**, **Growth Strategy**, **Success Metrics**.

### 12. Content Production Workflow
Short paragraph describing the Claude Cowork (strategy) → Manus AI (execution) pipeline. Same standard language every client:

  Claude Cowork (Strategic Layer): Strategy, messaging, tone, content plans, visual prompts, Monthly Strategy Packs.
  Manus AI (Execution Layer): Task breakdown, file organization, platform adaptation, QA, asset production, Execution Packs.

### 13. Additional Notes
Any client-specific notes, caveats, or inferred assumptions to flag for Manus.

## Summary
3-5 bullet lines at the very end:
- What was created
- What was inferred vs. sourced
- How Manus should use this document next

## CRITICAL rules

- Any field NOT directly sourced from the client record must be suffixed **[inferred]** (e.g., \`Founded: 2018 [inferred]\`).
- Palette rows must match the provided hex codes exactly. NEVER invent new hex codes.
- Never copy another client's visual skin, tone, or tagline. Keep this brief brand-specific.
- Output ONLY clean Markdown. No code fences around the output. No preamble.
- Keep it lean. A solo operator should use it without overhead.
- Write in English.`;

  const user = `Client record provided below. Produce the complete ${briefFilename(client.name)} now.

---
${rawInput}
---`;

  return { system, user };
}

export async function generateClientBrief(client, { apiKey, now } = {}) {
  if (!apiKey) throw new Error('generateClientBrief: ANTHROPIC_API_KEY required');
  const { system, user } = buildBriefPrompt(client, { now });
  const anthropic = new Anthropic({ apiKey });

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: user }],
  });

  let text = res.content?.[0]?.text || '';
  text = text.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/i, '').trim();
  return text;
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run tests/server/brief-generator-format.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/services/brief-generator.js tests/server/brief-generator-format.test.js
git commit -m "feat(brief): rewrite generator with new 4-group/13-section format + Sonnet 4.6"
```

---

## Task 3: Markdown → DOCX converter (`brief-docx.js`) with tests

**Files:**
- Create: `server/services/brief-docx.js`
- Create: `tests/server/brief-docx.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/server/brief-docx.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildBriefDocx } from '../../server/services/brief-docx.js';

const sampleMarkdown = `# Acme Inc.
## CLIENT BRIEF MASTER
> "Making brighter days"
Internal Strategic Document · Version 1.0 · April 2026 · CONFIDENTIAL

---

## ABOUT THE BUSINESS

### 1. Company Overview
- **Name:** Acme Inc.
- **Industry:** Widgets
- **Founded:** 2010 [inferred]

### 6. Common Objections & Concerns

| Objection | Response Strategy |
|---|---|
| "Too expensive" | Highlight ROI |
| "Why switch?" | Show success stories |

### 8. Visual Palette

| Color Name | Hex Code | Usage |
|---|---|---|
| Brand Navy | #0A2540 | Primary |
| Accent Orange | #F97316 | Buttons |
`;

describe('buildBriefDocx', () => {
  it('returns a non-empty Buffer', async () => {
    const buf = await buildBriefDocx(sampleMarkdown);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('produces a valid DOCX (zip with [Content_Types].xml)', async () => {
    const buf = await buildBriefDocx(sampleMarkdown);
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file('[Content_Types].xml')).toBeTruthy();
    expect(zip.file('word/document.xml')).toBeTruthy();
  });

  it('document.xml contains text from all rendered blocks (headings, bullets, table cells)', async () => {
    const buf = await buildBriefDocx(sampleMarkdown);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml').async('string');
    expect(xml).toContain('Acme Inc.');
    expect(xml).toContain('CLIENT BRIEF MASTER');
    expect(xml).toContain('Making brighter days');
    expect(xml).toContain('Widgets');
    expect(xml).toContain('2010 [inferred]');
    expect(xml).toContain('Too expensive');
    expect(xml).toContain('Highlight ROI');
    expect(xml).toContain('Brand Navy');
    expect(xml).toContain('#0A2540');
  });

  it('renders both markdown tables as Word tables', async () => {
    const buf = await buildBriefDocx(sampleMarkdown);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('word/document.xml').async('string');
    const tableCount = (xml.match(/<w:tbl[>\s]/g) || []).length;
    expect(tableCount).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `npx vitest run tests/server/brief-docx.test.js`

- [ ] **Step 3: Create `server/services/brief-docx.js`**

```javascript
/**
 * Markdown → DOCX converter scoped to the Company Master Brief format.
 *
 * Supports only what the brief needs (YAGNI):
 *   - H1/H2/H3 headings
 *   - Blockquote line (tagline)
 *   - Bold inline (**text**)
 *   - Bullet lists (- or *)
 *   - Markdown tables (| col | col |)
 *   - Horizontal rules (---)
 *   - Plain paragraphs
 *
 * No images, links, code blocks, nested lists.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  ShadingType,
} from 'docx';

const NAVY = '1B2B6B';
const ORANGE = 'F47B20';
const NEAR_BLACK = '222222';
const MUTED = '555555';

// --- Inline **bold** runs ------------------------------------------------

function splitInline(text) {
  const out = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  if (!out.length) out.push({ text, bold: false });
  return out;
}

function runsFrom(text, { color = NEAR_BLACK, bold = false, italics = false, size = 22 } = {}) {
  return splitInline(text).map(
    (seg) =>
      new TextRun({
        text: seg.text,
        bold: bold || seg.bold,
        italics,
        color,
        size,
      }),
  );
}

// --- Block builders ------------------------------------------------------

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
    children: [new TextRun({ text, bold: true, color: NAVY, size: 48 })],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    alignment: text === 'CLIENT BRIEF MASTER' ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, color: NAVY, size: 32 })],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, color: NAVY, size: 26 })],
  });
}

function taglineBlockquote(text) {
  const clean = text.replace(/^>\s*/, '').trim();
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text: clean, italics: true, color: MUTED, size: 24 })],
  });
}

function metaLine(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 240 },
    children: [new TextRun({ text, color: MUTED, size: 18 })],
  });
}

function horizontalRule() {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    border: { bottom: { color: ORANGE, space: 1, style: BorderStyle.SINGLE, size: 8 } },
    children: [],
  });
}

function paragraph(text) {
  return new Paragraph({
    spacing: { before: 60, after: 120 },
    children: runsFrom(text),
  });
}

function bulletItem(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 30, after: 30 },
    children: runsFrom(text),
  });
}

function tableCell(text, { header = false } = {}) {
  return new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    shading: header ? { type: ShadingType.CLEAR, fill: NAVY } : undefined,
    children: [
      new Paragraph({
        children: runsFrom(text, {
          bold: header,
          color: header ? 'FFFFFF' : NEAR_BLACK,
        }),
      }),
    ],
  });
}

function markdownTable(rows) {
  // rows[0] is header; rows[1] is separator (discarded); rows[2+] are data
  const header = rows[0];
  const dataRows = rows.slice(2);
  const trs = [
    new TableRow({
      tableHeader: true,
      children: header.map((c) => tableCell(c, { header: true })),
    }),
    ...dataRows.map(
      (row) =>
        new TableRow({
          children: header.map((_, i) => tableCell(row[i] || '', { header: false })),
        }),
    ),
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: trs,
  });
}

// --- Parser --------------------------------------------------------------

function splitTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

export function parseBriefMarkdown(md) {
  const lines = String(md || '').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line — skip
    if (!trimmed) { i++; continue; }

    // Horizontal rule
    if (/^---+$/.test(trimmed)) { blocks.push({ type: 'hr' }); i++; continue; }

    // Headings
    if (trimmed.startsWith('# ')) { blocks.push({ type: 'h1', text: trimmed.slice(2).trim() }); i++; continue; }
    if (trimmed.startsWith('## ')) { blocks.push({ type: 'h2', text: trimmed.slice(3).trim() }); i++; continue; }
    if (trimmed.startsWith('### ')) { blocks.push({ type: 'h3', text: trimmed.slice(4).trim() }); i++; continue; }

    // Blockquote (only single-line; that's all the brief uses)
    if (trimmed.startsWith('>')) { blocks.push({ type: 'blockquote', text: trimmed }); i++; continue; }

    // Markdown table
    if (trimmed.startsWith('|') && lines[i + 1] && /^\|\s*:?-+/.test(lines[i + 1].trim())) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'bullets', items });
      continue;
    }

    // Plain paragraph — greedy until blank line or next block-level marker
    const para = [trimmed];
    i++;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next) break;
      if (/^(#{1,3} |---+$|>|\||[-*]\s+)/.test(next)) break;
      para.push(next);
      i++;
    }
    blocks.push({ type: 'p', text: para.join(' ') });
  }

  return blocks;
}

// --- Renderer ------------------------------------------------------------

function renderBlock(block, ctx) {
  switch (block.type) {
    case 'h1':
      return [heading1(block.text)];
    case 'h2':
      return [heading2(block.text)];
    case 'h3':
      return [heading3(block.text)];
    case 'hr':
      return [horizontalRule()];
    case 'blockquote':
      return [taglineBlockquote(block.text)];
    case 'p': {
      // Cover meta line heuristic: paragraph containing "Version" + "CONFIDENTIAL"
      if (!ctx.sawBody && /Version\s+\d/.test(block.text) && /CONFIDENTIAL/.test(block.text)) {
        return [metaLine(block.text)];
      }
      return [paragraph(block.text)];
    }
    case 'bullets':
      return block.items.map(bulletItem);
    case 'table':
      return [markdownTable(block.rows)];
    default:
      return [];
  }
}

export async function buildBriefDocx(markdown) {
  const blocks = parseBriefMarkdown(markdown);
  const ctx = { sawBody: false };
  const children = [];
  for (const b of blocks) {
    const rendered = renderBlock(b, ctx);
    for (const r of rendered) children.push(r);
    if (b.type === 'hr') ctx.sawBody = true; // past cover block
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: NEAR_BLACK },
        },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/server/brief-docx.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/services/brief-docx.js tests/server/brief-docx.test.js
git commit -m "feat(brief): add markdown → DOCX converter (headings, bullets, tables)"
```

---

## Task 4: Route — `PUT /api/clients/:id/brief` (save operator edits)

**Files:**
- Modify: `server/routes/clients.js`

- [ ] **Step 1: Add the route**

Open `server/routes/clients.js`. Find the `POST /:id/generate-brief` handler. Update it so that after saving the brief, it also sets `client_brief_status = 'draft'`:

Change the `updateClient` call inside `POST /:id/generate-brief` from:

```javascript
      await socialQueries.updateClient(db, req.params.id, {
        client_brief: brief,
        client_brief_generated_at: now,
      });
```

to:

```javascript
      await socialQueries.updateClient(db, req.params.id, {
        client_brief: brief,
        client_brief_generated_at: now,
        client_brief_status: 'draft',
      });
```

Then, immediately BEFORE the existing `GET /:id/brief.md` handler, add a new route:

```javascript
  // PUT /:id/brief — save operator edits to the Company Master Brief.
  // Flips status to 'final'. Body: { client_brief: "<markdown>" }.
  router.put('/:id/brief', async (req, res) => {
    try {
      const client = await socialQueries.getClient(db, req.params.id);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      const { client_brief } = req.body || {};
      if (typeof client_brief !== 'string' || !client_brief.trim()) {
        return res.status(400).json({ error: 'client_brief (string) required' });
      }
      const now = new Date().toISOString();
      await socialQueries.updateClient(db, req.params.id, {
        client_brief,
        client_brief_generated_at: now,
        client_brief_status: 'final',
      });
      res.json({ ok: true, status: 'final', generated_at: now });
    } catch (err) {
      console.error('save-brief failed:', err);
      res.status(500).json({ error: 'Save brief failed', details: err.message });
    }
  });
```

- [ ] **Step 2: Verify server starts cleanly**

Run: `node --check server/routes/clients.js`
Expected: no syntax errors.

Then start the dev server: `npm run dev:server`
Expected: logs `GHL Sub-Account Builder running on http://localhost:3003` with no crash. Stop the server (Ctrl-C) after confirming.

- [ ] **Step 3: Commit**

```bash
git add server/routes/clients.js
git commit -m "feat(brief): add PUT /:id/brief to save operator edits (status=final)"
```

---

## Task 5: Route — `GET /api/clients/:id/brief.docx`

**Files:**
- Modify: `server/routes/clients.js`

- [ ] **Step 1: Add import + route**

In `server/routes/clients.js`:

1. Update the import for `brief-generator.js` at the top of the file:

From:
```javascript
import { generateClientBrief, briefFilename } from '../services/brief-generator.js';
```

To:
```javascript
import { generateClientBrief, briefFilename, briefDocxFilename } from '../services/brief-generator.js';
import { buildBriefDocx } from '../services/brief-docx.js';
```

2. Immediately AFTER the existing `GET /:id/brief.md` handler, add:

```javascript
  // GET /:id/brief.docx — stream a Word-formatted export of the current brief.
  router.get('/:id/brief.docx', async (req, res) => {
    try {
      const client = await socialQueries.getClient(db, req.params.id);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      if (!client.client_brief) return res.status(404).json({ error: 'No brief generated for this client' });
      const buf = await buildBriefDocx(client.client_brief);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${briefDocxFilename(client.name)}"`);
      res.send(buf);
    } catch (err) {
      console.error('brief.docx failed:', err);
      res.status(500).json({ error: 'DOCX export failed', details: err.message });
    }
  });
```

- [ ] **Step 2: Syntax check**

Run: `node --check server/routes/clients.js`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/routes/clients.js
git commit -m "feat(brief): add GET /:id/brief.docx (streaming Word export)"
```

---

## Task 6: UI — editable textarea + Save + status badge

**Files:**
- Modify: `src/pages/ClientDetail.jsx`

- [ ] **Step 1: Read the current brief section for context**

Open `src/pages/ClientDetail.jsx` and locate the JSX region that renders the brief card — it has the "Generate Brief" button, the copy/download buttons, and the read-only `<pre>` preview gated on `briefOpen`. Understand the surrounding JSX and the `client` state shape before editing.

- [ ] **Step 2: Add editor state + save handler**

Near the top of the `ClientDetail` component, after the existing `useState` calls (e.g. `const [copied, setCopied] = useState(false);`), add:

```jsx
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditDraft(client?.client_brief || '');
  }, [client?.client_brief]);

  const isDirty = editDraft !== (client?.client_brief || '');
  const briefStatus = client?.client_brief_status || 'draft';
```

Below the existing `handleCopyBrief` function, add:

```jsx
  async function handleSaveBrief() {
    if (!client || !editDraft.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${id}/brief`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_brief: editDraft }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Save failed: ${data.details || data.error || res.status}`);
        return;
      }
      setClient((c) => ({
        ...c,
        client_brief: editDraft,
        client_brief_generated_at: data.generated_at,
        client_brief_status: 'final',
      }));
    } catch (err) {
      alert(`Save failed: ${err?.message || 'network error'}`);
    } finally {
      setSaving(false);
    }
  }
```

Also update the existing `handleGenerateBrief` function so that the client state update sets status to `'draft'`:

Change:
```jsx
      setClient((c) => ({
        ...c,
        client_brief: data.brief,
        client_brief_generated_at: data.generated_at,
      }));
```

to:
```jsx
      setClient((c) => ({
        ...c,
        client_brief: data.brief,
        client_brief_generated_at: data.generated_at,
        client_brief_status: 'draft',
      }));
```

And add an unsaved-changes guard at the very top of `handleGenerateBrief` (before the existing `alreadyExists` check):

```jsx
    if (isDirty && !window.confirm('You have unsaved edits to the brief. Generate anyway and discard them?')) {
      return;
    }
```

- [ ] **Step 3: Replace the read-only `<pre>` with an editable textarea + Save button + status badge**

Locate the JSX block that shows the read-only brief preview (it wraps `client.client_brief` inside a `<pre>` gated on `briefOpen`). Replace that entire block, and include a status badge near the "Last generated" line.

If the current structure looks like:

```jsx
{client.client_brief_generated_at && (
  <p>Last generated {new Date(client.client_brief_generated_at).toLocaleString()} · filename ...</p>
)}
...
{briefOpen && client.client_brief && (
  <pre>{client.client_brief}</pre>
)}
```

Update it to:

```jsx
{client.client_brief_generated_at && (
  <div className="flex items-center gap-2 text-sm text-white/60">
    <span>Last generated {new Date(client.client_brief_generated_at).toLocaleString()}</span>
    <span className={`px-2 py-0.5 rounded text-xs ${
      briefStatus === 'final'
        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
        : 'bg-white/10 text-white/60 border border-white/10'
    }`}>
      {briefStatus === 'final' ? 'Final' : 'Draft'}
    </span>
  </div>
)}
{client.client_brief && (
  <div className="mt-3 space-y-2">
    <textarea
      value={editDraft}
      onChange={(e) => setEditDraft(e.target.value)}
      spellCheck={false}
      className="w-full min-h-[400px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white/85 text-sm font-mono focus:outline-none focus:border-purple-500/50"
    />
    <div className="flex items-center gap-2 justify-end">
      {isDirty && <span className="text-xs text-amber-400">Unsaved changes</span>}
      <button
        onClick={handleSaveBrief}
        disabled={saving || !isDirty}
        className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-medium disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  </div>
)}
```

If the existing `briefOpen` state is still used only for toggling the old read-only preview, you may leave the `briefOpen` state in place and gate the textarea block on it if you want a collapsible card; otherwise remove the `briefOpen` toggle button from the JSX since the textarea is always visible when a brief exists. Follow whichever matches the surrounding UI better (stay focused — do not restructure the whole page).

- [ ] **Step 4: Build verification**

Run: `npx vite build 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ClientDetail.jsx
git commit -m "feat(brief): inline textarea editor + Save + Draft/Final status badge"
```

---

## Task 7: UI — Preview toggle + `.docx` download button

**Files:**
- Modify: `src/pages/ClientDetail.jsx`

- [ ] **Step 1: Add preview state + import**

At the top of `src/pages/ClientDetail.jsx`, add the import next to the other top-level imports:

```jsx
import ReactMarkdown from 'react-markdown';
```

Near the other `useState` calls (alongside `editDraft`/`saving` from Task 6), add:

```jsx
  const [previewMode, setPreviewMode] = useState(false);
```

Below the existing `handleDownloadBrief` function, add:

```jsx
  function handleDownloadBriefDocx() {
    if (!client?.client_brief) return;
    window.location.href = `/api/clients/${id}/brief.docx`;
  }
```

- [ ] **Step 2: Wire Preview toggle + Download .docx button into JSX**

Above the textarea block from Task 6 (inside the `{client.client_brief && (...)}` wrapper), add the toolbar with Preview + Download .docx:

```jsx
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => setPreviewMode((v) => !v)}
        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs hover:bg-white/10"
      >
        {previewMode ? 'Edit' : 'Preview'}
      </button>
      <button
        onClick={handleCopyBrief}
        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs hover:bg-white/10"
      >
        {copied ? 'Copied!' : 'Copy MD'}
      </button>
      <button
        onClick={handleDownloadBrief}
        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs hover:bg-white/10"
      >
        Download .md
      </button>
      <button
        onClick={handleDownloadBriefDocx}
        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs hover:bg-white/10"
      >
        Download .docx
      </button>
    </div>
```

Then gate the textarea on `!previewMode` and show a rendered preview when `previewMode` is true. Replace the textarea block (the `<textarea value={editDraft} ...>`) with:

```jsx
    {previewMode ? (
      <div className="prose prose-invert max-w-none bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-sm min-h-[400px] overflow-auto">
        <ReactMarkdown>{editDraft}</ReactMarkdown>
      </div>
    ) : (
      <textarea
        value={editDraft}
        onChange={(e) => setEditDraft(e.target.value)}
        spellCheck={false}
        className="w-full min-h-[400px] bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white/85 text-sm font-mono focus:outline-none focus:border-purple-500/50"
      />
    )}
```

If the file already has `handleCopyBrief` / `handleDownloadBrief` buttons elsewhere in the JSX (old toolbar), remove those old buttons so the new toolbar is the only one. Leave the "Generate Brief / Replace" button in its existing location.

- [ ] **Step 3: Build verification**

Run: `npx vite build 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ClientDetail.jsx
git commit -m "feat(brief): preview toggle + .docx download button in brief toolbar"
```

---

## Task 8: E2E verification + deploy

- [ ] **Step 1: Run all brief-related tests**

Run: `npx vitest run tests/server/brief-generator-format.test.js tests/server/brief-docx.test.js tests/server/db.test.js`
Expected: all brief tests PASS (6 + 4 + including the new `client_brief_status` test).

- [ ] **Step 2: Build verification**

Run: `npx vite build 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 3: Local smoke test**

Start the dev servers (terminal 1: `npm run dev:server`; terminal 2: `npm run dev`). Open the Vite URL, log in, navigate to Clients → pick an existing client (e.g. Restoration Pro NW) → click Generate Brief.

Verify in order:
1. Brief appears in the editable textarea, cover block visible at top (`# Client Name`, `## CLIENT BRIEF MASTER`, tagline blockquote, "Version 1.0 · … · CONFIDENTIAL")
2. Brief contains all 13 numbered sections under the 4 "ABOUT THE X" groups
3. Objections table and Palette table render as markdown tables (pipe syntax)
4. Click Preview → sees rendered markdown with bold/bullets/tables formatted
5. Click Edit → returns to textarea
6. Edit the tagline or any field, status badge shows "Draft", "Unsaved changes" indicator appears
7. Click Save → badge flips to "Final", "Unsaved changes" disappears
8. Click Download .md → file downloads with correct filename
9. Click Download .docx → .docx downloads, opens in Pages/Word, tables render as real Word tables, cover block centered

Halt and report to the user if any step fails. If all pass, proceed.

- [ ] **Step 4: Commit any tiny fix-ups (if needed)**

If Step 3 surfaced a trivial cosmetic fix (e.g. a spacing tweak), commit it now with a clear message. If it surfaced anything non-trivial, STOP and ask the user before continuing.

- [ ] **Step 5: Push + deploy**

```bash
git push origin main
npx vercel --prod --yes
```

- [ ] **Step 6: Prod smoke test**

Visit `https://vo360-onboarding-hub.vercel.app/clients/<existing-client-id>`. Click Generate Brief. Verify the draft appears, Save works, and the `.docx` download returns a valid Word file.

- [ ] **Step 7: Update project memory**

Update `~/.claude/projects/-Users-urielholzman/memory/project_onboarding_hub.md`:
- Add a line under Completed features: "Brief Format Redesign (shipped 2026-04-20): new 4-group/13-section structure, two-pass edit flow, .docx export, Sonnet 4.6."

---

## Self-Review

**1. Spec coverage:**
- ✅ New structure — cover + 4 ABOUT THE X groups + 13 numbered sections (Task 2 system prompt)
- ✅ `[inferred]` tag rule (Task 2 system prompt + test)
- ✅ Markdown tables for Objections + Palette (Task 2 test asserts this)
- ✅ Cover block with Version 1.0 + CONFIDENTIAL (Task 2 test asserts this)
- ✅ Palette never invented — instructed in system prompt (Task 2)
- ✅ `client_brief_status` column (Task 1)
- ✅ Claude Sonnet 4.6 (Task 2 — `MODEL = 'claude-sonnet-4-6'`)
- ✅ PUT /:id/brief endpoint saves edits, flips status=final (Task 4)
- ✅ GET /:id/brief.docx endpoint (Task 5)
- ✅ Markdown → DOCX converter (Task 3, with table support)
- ✅ Generate endpoint sets status='draft' (Task 4 step 1)
- ✅ Editable textarea on ClientDetail (Task 6)
- ✅ Save button (Task 6)
- ✅ Status badge Draft/Final (Task 6)
- ✅ Unsaved-changes guard before regenerate (Task 6)
- ✅ Preview toggle via react-markdown (Task 7)
- ✅ Download .docx button (Task 7)

**2. Placeholder scan:** No TBDs, all code and commands shown inline. Each task has complete code blocks.

**3. Type / name consistency:**
- `buildBriefPrompt`, `briefFilename`, `briefDocxFilename`, `clientFilenameSlug`, `generateClientBrief` all exported from `brief-generator.js` (Task 2) and used in Tasks 4, 5.
- `buildBriefDocx` exported from `brief-docx.js` (Task 3) and used in Task 5.
- `client_brief_status` column name consistent across Tasks 1, 4, 6.
- Status enum `'draft' | 'final'` consistent across Tasks 4, 6.
- Route paths consistent: `PUT /api/clients/:id/brief` (Task 4), `GET /api/clients/:id/brief.docx` (Task 5), `POST /api/clients/:id/generate-brief` (existing, updated in Task 4).

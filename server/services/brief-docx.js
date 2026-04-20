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

    if (!trimmed) { i++; continue; }

    if (/^---+$/.test(trimmed)) { blocks.push({ type: 'hr' }); i++; continue; }

    if (trimmed.startsWith('# ')) { blocks.push({ type: 'h1', text: trimmed.slice(2).trim() }); i++; continue; }
    if (trimmed.startsWith('## ')) { blocks.push({ type: 'h2', text: trimmed.slice(3).trim() }); i++; continue; }
    if (trimmed.startsWith('### ')) { blocks.push({ type: 'h3', text: trimmed.slice(4).trim() }); i++; continue; }

    if (trimmed.startsWith('>')) { blocks.push({ type: 'blockquote', text: trimmed }); i++; continue; }

    if (trimmed.startsWith('|') && lines[i + 1] && /^\|\s*:?-+/.test(lines[i + 1].trim())) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }

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
    if (b.type === 'hr') ctx.sawBody = true;
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

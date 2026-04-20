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

  it('document.xml contains text from all rendered blocks', async () => {
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

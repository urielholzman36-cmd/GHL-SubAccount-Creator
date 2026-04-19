// scripts/daily-csv-routine/lib/docx-converter.mjs
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

function docxParagraphs(docxPath) {
  const zip = new AdmZip(docxPath);
  const entry = zip.getEntry('word/document.xml');
  if (!entry) throw new Error(`Not a valid .docx: ${docxPath}`);
  const xml = entry.getData().toString('utf8');
  const paragraphs = [];
  for (const p of xml.split(/<\/w:p>/)) {
    const parts = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]);
    const txt = parts.join('').trim();
    if (txt) paragraphs.push(txt);
  }
  return paragraphs;
}

/**
 * Convert Manus Monthly Manifest .docx into a markdown-table manifest.md.
 * Returns the .md content as a string.
 */
export function manifestDocxToMd(docxPath) {
  const HEADER = ['Day','Post ID','Post Type','Concept Title','Filename','Slide Role','Caption File','Prompt File','Approval Status','Scheduled Status'];
  const lines = docxParagraphs(docxPath);
  let hstart = -1;
  for (let i = 0; i <= lines.length - HEADER.length; i++) {
    if (HEADER.every((h, j) => lines[i + j] === h)) { hstart = i; break; }
  }
  if (hstart < 0) throw new Error('Manifest header not found in docx');
  const body = lines.slice(hstart + HEADER.length);
  const rows = [];
  for (let i = 0; i + 9 < body.length; i += 10) {
    const row = body.slice(i, i + 10);
    if (!/^\d+$/.test(row[0])) break; // stop at non-numeric day = end of table
    // Remap role from descriptive ("Cover", "System Layer 1") to S01/S02 based on filename
    const filename = row[4];
    const m = filename.match(/_S(\d+)\.png$/i);
    if (m) row[5] = `S${String(parseInt(m[1], 10)).padStart(2, '0')}`;
    else if (/\.png$/i.test(filename)) row[5] = 'Single';
    rows.push(row);
  }
  const out = [
    '# Monthly Manifest\n',
    '| ' + HEADER.join(' | ') + ' |',
    '|' + HEADER.map(() => '---').join('|') + '|',
    ...rows.map(r => '| ' + r.join(' | ') + ' |'),
  ];
  return out.join('\n') + '\n';
}

/**
 * Convert Manus Post Kits .docx into markdown H2-sectioned format parseable
 * by manus-importer's parsePostKitsMd.
 */
export function postKitsDocxToMd(docxPath) {
  const FIELDS = ['Post type','Platform','Assets','Caption','Description','CTA','Hashtags','Prompt source','Routing note'];
  const lines = docxParagraphs(docxPath);
  const headerRe = /^([A-Z]{2,}[0-9]*-\d+)\s+[—–-]\s+(.+)$/;
  const headers = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headerRe);
    if (m) headers.push({ idx: i, postId: m[1], title: m[2] });
  }
  if (headers.length === 0) throw new Error('No post-kit headers found in docx');

  const posts = headers.map((h, j) => {
    const end = j + 1 < headers.length ? headers[j + 1].idx : lines.length;
    let body = lines.slice(h.idx + 1, end);
    if (body[0] === 'Field' && body[1] === 'Content') body = body.slice(2);
    const fields = {};
    const fieldSet = new Set(FIELDS);
    let cur = null; let vals = [];
    for (const l of body) {
      if (fieldSet.has(l)) {
        if (cur) fields[cur] = vals.join(' ').trim();
        cur = l; vals = [];
      } else vals.push(l);
    }
    if (cur) fields[cur] = vals.join(' ').trim();
    return { postId: h.postId, title: h.title, fields };
  });

  const out = ['# Post Kits\n'];
  for (const p of posts) {
    out.push(`## ${p.postId} — ${p.title}`);
    out.push('');
    out.push('| Field | Content |');
    out.push('|---|---|');
    for (const f of FIELDS) {
      const v = (p.fields[f] || '').replace(/\|/g, '\\|');
      out.push(`| ${f} | ${v} |`);
    }
    out.push('');
  }
  return out.join('\n') + '\n';
}

/**
 * If a bundle has docx manifest/post_kits but no .md versions, generate and
 * write the .md files alongside. Idempotent.
 */
export function ensureMdFromDocx(files, targetDir) {
  const byBase = new Map(files.map(f => [path.basename(f).toLowerCase(), f]));
  const hasManifestMd = files.some(f => /manifest\.md$/i.test(f));
  const hasPostKitsMd = files.some(f => /post_kits?\.md$/i.test(f));
  const writes = [];
  if (!hasManifestMd) {
    const d = files.find(f => /manifest.*\.docx$/i.test(path.basename(f)));
    if (d) {
      const md = manifestDocxToMd(d);
      const out = path.join(targetDir, 'generated_manifest.md');
      fs.writeFileSync(out, md); writes.push(out);
    }
  }
  if (!hasPostKitsMd) {
    const d = files.find(f => /post[_ ]*kits?.*\.docx$/i.test(path.basename(f)));
    if (d) {
      const md = postKitsDocxToMd(d);
      const out = path.join(targetDir, 'generated_post_kits.md');
      fs.writeFileSync(out, md); writes.push(out);
    }
  }
  return writes;
}

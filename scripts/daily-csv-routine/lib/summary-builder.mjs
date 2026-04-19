// scripts/daily-csv-routine/lib/summary-builder.mjs

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function titleCase(s) {
  return String(s || '').replace(/\b\w/g, c => c.toUpperCase());
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/**
 * Build a human-readable Markdown summary.
 *
 * @param {Array} posts
 * @param {{client, year, month, startDate, warnings?}} meta
 */
export function buildSummary(posts, { client, year, month, startDate, warnings }) {
  const lines = [];
  lines.push(`# ${client} — ${MONTHS[month - 1]} ${year}`);
  lines.push('');
  lines.push(`**${posts.length} posts total** · starts ${startDate}`);
  lines.push('');
  lines.push('## Posts');
  lines.push('');
  for (const p of posts) {
    const typeLabel = titleCase(p.post_type || 'single');
    const slideCount = Array.isArray(p.image_urls) ? p.image_urls.length : 1;
    const typeDisplay = slideCount > 1 ? `${typeLabel} (${slideCount} slides)` : typeLabel;
    const id = p.post_id ? `${p.post_id} · ` : '';
    lines.push(`### Day ${p.day_number} · ${id}${typeDisplay}`);
    if (p.concept) lines.push(`**Concept:** ${p.concept}`);
    if (p.caption) lines.push(`**Caption:** ${truncate(p.caption, 80)}`);
    if (p.cta) lines.push(`**CTA:** ${p.cta}`);
    lines.push('');
  }
  if (Array.isArray(warnings) && warnings.length) {
    lines.push('## Warnings');
    lines.push('');
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push('');
  }
  return lines.join('\n');
}

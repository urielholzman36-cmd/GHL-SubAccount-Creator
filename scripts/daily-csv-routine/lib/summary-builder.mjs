// scripts/daily-csv-routine/lib/summary-builder.mjs

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function titleCase(s) {
  return String(s || '').replace(/\b\w/g, c => c.toUpperCase());
}

function displayPostType(postType, slideCount) {
  const t = String(postType || '').toLowerCase();
  if (t.includes('carousel')) return 'Carousel';
  if (t.includes('before') && t.includes('after')) return 'Before/After';
  if (t.includes('comparison')) return 'Comparison';
  if (t.includes('checklist')) return 'Checklist';
  if (t.includes('stats')) return 'Stats Card';
  if (t.includes('quote')) return 'Quote';
  if (t.includes('cta')) return 'CTA';
  if (t.includes('infographic')) return slideCount > 1 ? 'Infographic Carousel' : 'Infographic';
  if (t.includes('single') || !t) return slideCount > 1 ? 'Carousel' : 'Single';
  return titleCase(t);
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
    const slideCount = Array.isArray(p.image_urls) ? p.image_urls.length : 1;
    const typeLabel = displayPostType(p.post_type, slideCount);
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

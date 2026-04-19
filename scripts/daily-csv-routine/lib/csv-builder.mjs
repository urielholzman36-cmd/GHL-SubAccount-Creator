// scripts/daily-csv-routine/lib/csv-builder.mjs

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

/**
 * Build a GHL Social Planner Basic-format CSV.
 *
 * @param {Array<{day_number, caption, cta, hashtags, image_urls}>} posts
 * @param {{startDate: string, postingTime: string}} config
 *   startDate: ISO date "YYYY-MM-DD" — Day 1 goes here
 *   postingTime: "HH:mm:ss"
 * @returns {string} CSV text
 */
export function buildGhlCsv(posts, { startDate, postingTime }) {
  const header = ['postAtSpecificTime (YYYY-MM-DD HH:mm:ss)', 'content', 'link (OGmetaUrl)', 'imageUrls', 'gifUrl', 'videoUrls'];
  const rows = [header.join(',')];

  for (const post of posts) {
    const caption = post.caption || '';
    const cta = post.cta ? `\n\n${post.cta}` : '';
    const tags = post.hashtags ? `\n\n${post.hashtags}` : '';
    const content = `${caption}${cta}${tags}`;
    const postDate = addDays(startDate, (post.day_number || 1) - 1);
    const postTime = `${postDate} ${postingTime}`;
    const urls = Array.isArray(post.image_urls) ? post.image_urls.join(',') : '';
    const cells = [postTime, content, '', urls, '', ''];
    rows.push(cells.map(csvEscape).join(','));
  }

  return rows.join('\n') + '\n';
}

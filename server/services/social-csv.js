/**
 * GHL Social Planner CSV generator.
 * Produces a CSV compatible with GoHighLevel's Social Planner Bulk Upload.
 *
 * Basic format columns (single header row):
 *   postAtSpecificTime, content, link (OGmetaUrl), imageUrls, gifUrl, videoUrls
 *
 * We use the Basic format because it's simpler and covers our use case:
 * scheduled posts with images, captions, and hashtags.
 */

/**
 * Escape a CSV cell value.
 */
function escapeCsv(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Build a GHL Social Planner CSV string (Basic format).
 *
 * @param {Array} posts - Array of post objects with post_date, caption, hashtags, image_urls, category
 * @param {string} postingTime - Time string like "09:00:00"
 * @param {string[]} platforms - Array of platform names (unused in basic format, kept for API compat)
 * @returns {string} Complete CSV string
 */
export function buildGhlCsv(posts, postingTime, platforms) {
  const rows = [];

  // Single header row — GHL Basic Format
  rows.push(['postAtSpecificTime', 'content', 'link (OGmetaUrl)', 'imageUrls', 'gifUrl', 'videoUrls'].map(escapeCsv).join(','));

  for (const post of posts) {
    // Build content: caption + hashtags
    let content = post.caption || '';
    if (post.hashtags) {
      content += '\n\n' + post.hashtags;
    }

    // Parse image URLs — comma-separated
    let imageUrls = '';
    if (post.image_urls) {
      try {
        const urls = JSON.parse(post.image_urls);
        imageUrls = Array.isArray(urls) ? urls.join(',') : String(urls);
      } catch {
        imageUrls = post.image_urls;
      }
    }

    // Format: YYYY-MM-DD HH:mm:ss
    const postTime = `${post.post_date} ${postingTime}`;

    const cells = [
      postTime,     // postAtSpecificTime
      content,      // content
      '',           // link (OGmetaUrl) — empty
      imageUrls,    // imageUrls
      '',           // gifUrl — empty
      '',           // videoUrls — empty
    ];

    rows.push(cells.map(escapeCsv).join(','));
  }

  return rows.join('\n') + '\n';
}

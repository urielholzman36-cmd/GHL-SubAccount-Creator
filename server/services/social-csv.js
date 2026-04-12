/**
 * GHL Social Planner CSV generator.
 * Produces a 39-column CSV compatible with GoHighLevel's Social Planner import.
 */

// Row 1: section groupings (39 columns)
export const HEADER_ROW1 = [
  // All Social (11)
  'All Social', 'All Social', 'All Social', 'All Social', 'All Social',
  'All Social', 'All Social', 'All Social', 'All Social', 'All Social',
  'All Social',
  // Facebook (1)
  'Facebook',
  // Instagram (1)
  'Instagram',
  // LinkedIn (2)
  'LinkedIn', 'LinkedIn',
  // Google (GBP) (10)
  'Google (GBP)', 'Google (GBP)', 'Google (GBP)', 'Google (GBP)', 'Google (GBP)',
  'Google (GBP)', 'Google (GBP)', 'Google (GBP)', 'Google (GBP)', 'Google (GBP)',
  // YouTube (3)
  'YouTube', 'YouTube', 'YouTube',
  // TikTok (7)
  'TikTok', 'TikTok', 'TikTok', 'TikTok', 'TikTok', 'TikTok', 'TikTok',
  // Community (2)
  'Community', 'Community',
  // Pinterest (2)
  'Pinterest', 'Pinterest',
];

// Row 2: column names (39 columns)
export const HEADER_ROW2 = [
  // All Social (11)
  'postAtSpecificTime (YYYY-MM-DD HH:mm:ss)',
  'content',
  'OGmetaUrl (url)',
  'imageUrls (comma-separated)',
  'gifUrl',
  'videoUrls (comma-separated)',
  'mediaOptimization (true/false)',
  'applyWatermark (true/false)',
  'tags (comma-separated)',
  'category',
  'followUpComment',
  // Facebook (1)
  'type (post/story/reel)',
  // Instagram (1)
  'type (post/story/reel)',
  // LinkedIn (2)
  'pdfTitle',
  'postAsPdf (true/false)',
  // Google (GBP) (10)
  'eventType (...)',
  'actionType (...)',
  'title',
  'offerTitle',
  'startDate (...)',
  'endDate (...)',
  'termsConditions',
  'couponCode',
  'redeemOnlineUrl',
  'actionUrl',
  // YouTube (3)
  'title',
  'privacyLevel (...)',
  'type (video/short)',
  // TikTok (7)
  'privacyLevel (...)',
  'promoteOtherBrand (true/false)',
  'enableComment (true/false)',
  'enableDuet (true/false)',
  'enableStitch (true/false)',
  'videoDisclosure (true/false)',
  'promoteYourBrand (true/false)',
  // Community (2)
  'title',
  'notifyAllGroupMembers (true/false)',
  // Pinterest (2)
  'title',
  'link',
];

/**
 * Escape a CSV cell value.
 * If value contains comma, double-quote, or newline, wrap in quotes
 * and double any internal quotes.
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
 * Build a GHL Social Planner CSV string from an array of post objects.
 *
 * @param {Array} posts - Array of post objects with post_date, caption, hashtags, image_urls, category
 * @param {string} postingTime - Time string like "09:00:00"
 * @param {string[]} platforms - Array of platform names, e.g. ["facebook", "instagram"]
 * @returns {string} Complete CSV string
 */
export function buildGhlCsv(posts, postingTime, platforms) {
  const rows = [];

  // Header row 1
  rows.push(HEADER_ROW1.map(escapeCsv).join(','));
  // Header row 2
  rows.push(HEADER_ROW2.map(escapeCsv).join(','));

  const hasFacebook = platforms.includes('facebook');
  const hasInstagram = platforms.includes('instagram');

  for (const post of posts) {
    // Build content: caption + hashtags
    let content = post.caption || '';
    if (post.hashtags) {
      content += '\n\n' + post.hashtags;
    }

    // Parse image URLs
    let imageUrls = '';
    if (post.image_urls) {
      try {
        const urls = JSON.parse(post.image_urls);
        imageUrls = Array.isArray(urls) ? urls.join(',') : String(urls);
      } catch {
        imageUrls = post.image_urls;
      }
    }

    // Tags: strip # and convert space-separated to comma-separated
    let tags = '';
    if (post.hashtags) {
      tags = post.hashtags
        .split(/\s+/)
        .map(t => t.replace(/^#/, ''))
        .filter(Boolean)
        .join(',');
    }

    const category = post.category || 'Product Showcase';

    // Build 39-column row
    const cells = new Array(39).fill('');

    // All Social (indices 0-10)
    cells[0] = `${post.post_date} ${postingTime}`;   // postAtSpecificTime
    cells[1] = content;                                // content
    // 2: OGmetaUrl — empty
    cells[3] = imageUrls;                              // imageUrls
    // 4: gifUrl — empty
    // 5: videoUrls — empty
    cells[6] = 'TRUE';                                 // mediaOptimization
    cells[7] = 'FALSE';                                // applyWatermark
    cells[8] = tags;                                   // tags
    cells[9] = category;                               // category
    // 10: followUpComment — empty

    // Facebook (index 11)
    cells[11] = hasFacebook ? 'post' : '';

    // Instagram (index 12)
    cells[12] = hasInstagram ? 'post' : '';

    // LinkedIn (13-14) — empty
    // Google GBP (15-24) — empty
    // YouTube (25-27) — empty

    // TikTok (28-34)
    // 28: privacyLevel — empty
    cells[29] = 'FALSE';  // promoteOtherBrand
    cells[30] = 'TRUE';   // enableComment
    cells[31] = 'TRUE';   // enableDuet
    cells[32] = 'TRUE';   // enableStitch
    cells[33] = 'FALSE';  // videoDisclosure
    cells[34] = 'TRUE';   // promoteYourBrand

    // Community (35-36) — empty
    // Pinterest (37-38) — empty

    rows.push(cells.map(escapeCsv).join(','));
  }

  return rows.join('\n') + '\n';
}

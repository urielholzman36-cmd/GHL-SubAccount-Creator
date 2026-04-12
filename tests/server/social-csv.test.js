import { describe, it, expect } from 'vitest';
import {
  HEADER_ROW1,
  HEADER_ROW2,
  buildGhlCsv,
} from '../../server/services/social-csv.js';

function makePost(overrides = {}) {
  return {
    post_date: '2026-04-12',
    caption: 'Check out our latest project!',
    hashtags: '#electrical #evcharger #sandiego',
    image_urls: JSON.stringify(['https://cdn.example.com/img1.jpg']),
    category: 'Product Showcase',
    ...overrides,
  };
}

/**
 * Parse a full CSV string into an array of row arrays.
 * Handles quoted fields with embedded commas, newlines, and escaped quotes.
 */
function parseCsv(csv) {
  const rows = [];
  let row = [];
  let i = 0;
  while (i < csv.length) {
    if (csv[i] === '"') {
      // Quoted field
      let val = '';
      i++; // skip opening quote
      while (i < csv.length) {
        if (csv[i] === '"') {
          if (i + 1 < csv.length && csv[i + 1] === '"') {
            val += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          val += csv[i];
          i++;
        }
      }
      row.push(val);
      if (i < csv.length && csv[i] === ',') {
        i++;
      } else if (i < csv.length && csv[i] === '\n') {
        rows.push(row);
        row = [];
        i++;
      } else if (i >= csv.length) {
        rows.push(row);
        row = [];
      }
    } else if (csv[i] === '\n') {
      // End of row (empty trailing field already handled by comma logic)
      rows.push(row);
      row = [];
      i++;
    } else {
      // Unquoted field — read until comma or newline
      let end = i;
      while (end < csv.length && csv[end] !== ',' && csv[end] !== '\n') end++;
      row.push(csv.substring(i, end));
      i = end;
      if (i < csv.length && csv[i] === ',') {
        i++;
      } else if (i < csv.length && csv[i] === '\n') {
        rows.push(row);
        row = [];
        i++;
      } else {
        rows.push(row);
        row = [];
      }
    }
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

describe('social-csv', () => {
  describe('HEADER_ROW1', () => {
    it('has 39 elements', () => {
      expect(HEADER_ROW1).toHaveLength(39);
    });
  });

  describe('HEADER_ROW2', () => {
    it('has 39 elements', () => {
      expect(HEADER_ROW2).toHaveLength(39);
    });
  });

  describe('buildGhlCsv', () => {
    it('produces correct header rows (2 headers + N data rows)', () => {
      const posts = [makePost()];
      const csv = buildGhlCsv(posts, '09:00:00', ['facebook', 'instagram']);
      const rows = parseCsv(csv);
      // 2 header rows + 1 data row
      expect(rows).toHaveLength(3);
    });

    it('formats datetime correctly (2026-04-12 09:00:00)', () => {
      const posts = [makePost({ post_date: '2026-04-12' })];
      const csv = buildGhlCsv(posts, '09:00:00', ['facebook']);
      const rows = parseCsv(csv);
      const dataRow = rows[2];
      expect(dataRow[0]).toBe('2026-04-12 09:00:00');
    });

    it('inlines caption + hashtags into content column', () => {
      const posts = [makePost({
        caption: 'Great work today',
        hashtags: '#work #electrical',
      })];
      const csv = buildGhlCsv(posts, '09:00:00', ['facebook']);
      const rows = parseCsv(csv);
      const content = rows[2][1];
      expect(content).toContain('Great work today');
      expect(content).toContain('#work #electrical');
      // Should have double newline between caption and hashtags
      expect(content).toBe('Great work today\n\n#work #electrical');
    });

    it('formats tags without # signs (comma-separated)', () => {
      const posts = [makePost({ hashtags: '#test #tag #hello' })];
      const csv = buildGhlCsv(posts, '09:00:00', ['facebook']);
      const rows = parseCsv(csv);
      const tags = rows[2][8]; // tags column index 8
      expect(tags).toBe('test,tag,hello');
    });

    it('sets FB and IG type columns to "post" when both platforms specified', () => {
      const posts = [makePost()];
      const csv = buildGhlCsv(posts, '09:00:00', ['facebook', 'instagram']);
      const rows = parseCsv(csv);
      const dataRow = rows[2];
      expect(dataRow[11]).toBe('post'); // FB type
      expect(dataRow[12]).toBe('post'); // IG type
    });

    it('handles carousel with comma-separated image URLs', () => {
      const posts = [makePost({
        image_urls: JSON.stringify([
          'https://cdn.example.com/img1.jpg',
          'https://cdn.example.com/img2.jpg',
          'https://cdn.example.com/img3.jpg',
        ]),
      })];
      const csv = buildGhlCsv(posts, '09:00:00', ['facebook']);
      const rows = parseCsv(csv);
      const imageUrls = rows[2][3]; // imageUrls column index 3
      expect(imageUrls).toBe(
        'https://cdn.example.com/img1.jpg,https://cdn.example.com/img2.jpg,https://cdn.example.com/img3.jpg'
      );
    });

    it('generates 30 rows for 30 posts with correct date in each', () => {
      const posts = [];
      for (let i = 1; i <= 30; i++) {
        const day = String(i).padStart(2, '0');
        posts.push(makePost({ post_date: `2026-04-${day}` }));
      }
      const csv = buildGhlCsv(posts, '10:00:00', ['facebook']);
      const rows = parseCsv(csv);
      // 2 headers + 30 data rows
      expect(rows).toHaveLength(32);
      // Spot-check first and last data rows
      expect(rows[2][0]).toBe('2026-04-01 10:00:00');
      expect(rows[31][0]).toBe('2026-04-30 10:00:00');
    });

    it('sets mediaOptimization to TRUE', () => {
      const posts = [makePost()];
      const csv = buildGhlCsv(posts, '09:00:00', ['facebook']);
      const rows = parseCsv(csv);
      const dataRow = rows[2];
      expect(dataRow[6]).toBe('TRUE'); // mediaOptimization column
    });
  });
});

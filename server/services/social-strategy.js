/**
 * social-strategy.js
 * Generates a 30-day social media strategy pack via the Claude API.
 */

import { readFileSync } from 'fs';
import { withRetry } from './retry.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonToComma(raw) {
  try { return JSON.parse(raw).join(', '); } catch { return String(raw); }
}

function jsonToSpace(raw) {
  try { return JSON.parse(raw).join(' '); } catch { return String(raw); }
}

function jsonToList(raw) {
  try { return JSON.parse(raw).map((p, i) => `${i + 1}. ${p}`).join('\n'); } catch { return String(raw); }
}

// ── Public functions ─────────────────────────────────────────────────────────

/**
 * Build the Claude prompt for a 30-day strategy pack.
 */
export function buildStrategyPrompt(client, month, theme, researchBrief, postCount = 30) {
  const services = jsonToComma(client.services);
  const platforms = jsonToComma(client.platforms);
  const hashtags = jsonToSpace(client.hashtag_bank);
  const pillars = jsonToList(client.content_pillars);

  const postsPerPillar = Math.max(1, Math.floor(postCount / 5));
  const singleCount = Math.max(1, Math.round(postCount * 0.67));
  const carouselCount = Math.max(0, Math.round(postCount * 0.23));
  const baCount = Math.max(0, postCount - singleCount - carouselCount);

  let prompt = `You are a social media strategist. Create a ${postCount}-post content strategy pack for the following client.

## Client Profile
- **Name:** ${client.name}
- **Industry:** ${client.industry}
- **Location:** ${client.location || 'USA'}
- **Brand Tone:** ${client.brand_tone}
- **Brand Description:** ${client.brand_description}
- **Target Audience:** ${client.target_audience}
- **Services:** ${services}
- **Platforms:** ${platforms}
- **CTA Style:** ${client.cta_style}
- **Hashtag Bank:** ${hashtags}

## Content Pillars
${pillars}

## Month & Theme
- **Month:** ${month}
- **Theme:** ${theme}
`;

  if (researchBrief) {
    prompt += `\n## Research Brief\n${researchBrief}\n`;
  }

  prompt += `
## Rules
- Generate exactly ${postCount} posts as a JSON array.
- Distribute posts evenly across all 5 pillars (~${postsPerPillar} per pillar).
- Mix of approximately ${singleCount} single-image posts, ${carouselCount} carousel posts, and ${baCount} before/after posts.
- Each post object must include: day, pillar, post_type, concept, caption, hashtags, cta, visual_prompt, slide_count.
- Make all content specific to the client's location and industry. Reference local landmarks, events, and market conditions.

Return ONLY a valid JSON array of ${postCount} post objects. No additional text.`;

  return prompt;
}

/**
 * Extract JSON array from a Claude response that may be wrapped in markdown code blocks.
 */
export function parseStrategyResponse(responseText) {
  // Strip markdown code fences if present
  let text = responseText.trim();

  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');

  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
    throw new Error('No JSON array found in response');
  }

  const jsonStr = text.slice(firstBracket, lastBracket + 1);

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error('Parsed value is not an array');
    return parsed;
  } catch (err) {
    throw new Error(`Failed to parse strategy JSON: ${err.message}`);
  }
}

/**
 * Validate a parsed strategy pack.
 */
export function validateStrategyPack(pack, expectedCount = 30) {
  if (!Array.isArray(pack) || pack.length === 0) {
    throw new Error(`Strategy pack must contain posts, got ${Array.isArray(pack) ? pack.length : 0}`);
  }

  const requiredFields = ['pillar', 'concept', 'caption'];

  for (let i = 0; i < pack.length; i++) {
    const post = pack[i];
    for (const field of requiredFields) {
      if (post[field] === undefined || post[field] === null || post[field] === '') {
        throw new Error(`Post ${i + 1} is missing required field: ${field}`);
      }
    }
  }
}

/**
 * Generate a full 30-day strategy pack via Claude (or dry-run fixture).
 */
export async function generateStrategyPack(client, month, theme, researchBrief, opts = {}) {
  const { apiKey, fetchImpl, postCount = 30 } = opts;

  // Dry-run mode: return fixture data
  if (process.env.DRY_RUN === 'true') {
    try {
      const fixturePath = resolve(__dirname, '../../test/fixtures/sample-strategy.json');
      const raw = readFileSync(fixturePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      // Generate minimal fixture
      const pillars = (() => {
        try { return JSON.parse(client.content_pillars); } catch { return ['General']; }
      })();

      return Array.from({ length: postCount }, (_, i) => ({
        day: i + 1,
        pillar: pillars[i % pillars.length],
        post_type: i < 20 ? 'single' : i < 27 ? 'carousel' : 'before_after',
        concept: `Sample concept for day ${i + 1}`,
        caption: `Sample caption for day ${i + 1}`,
        hashtags: '#sample',
        cta: client.cta_style || 'Learn more',
        visual_prompt: 'A professional photo',
        slide_count: i < 20 ? 1 : i < 27 ? 5 : 2,
      }));
    }
  }

  // Live mode: call Claude
  const fetchFn = fetchImpl || fetch;
  if (!apiKey) throw new Error('generateStrategyPack: apiKey is required');

  const prompt = buildStrategyPrompt(client, month, theme, researchBrief, postCount);

  const data = await withRetry(async () => {
    const res = await fetchFn('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16384,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      let detail = '';
      try {
        const errBody = await res.json();
        detail = errBody?.error?.message || JSON.stringify(errBody);
      } catch (_) {}
      const err = new Error(`Claude API error: ${res.status} ${detail}`);
      err.status = res.status;
      throw err;
    }

    return res.json();
  }, { label: 'Strategy Pack (Claude)' });
  const textBlock = (data.content || []).find((c) => c.type === 'text');
  if (!textBlock || !textBlock.text) {
    throw new Error('Claude API returned empty content');
  }

  const pack = parseStrategyResponse(textBlock.text);
  validateStrategyPack(pack, postCount);
  return pack;
}

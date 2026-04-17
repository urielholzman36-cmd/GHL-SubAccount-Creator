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
 * Pick the first non-null/non-empty value. Campaign-level strategy overrides
 * the client's default; client-level values act as a fallback.
 */
function pick(...vals) {
  for (const v of vals) {
    if (v != null && v !== '' && !(Array.isArray(v) && v.length === 0)) return v;
  }
  return null;
}

/**
 * Build the Claude prompt for a 30-day strategy pack.
 * @param {object} client   — client record (defaults)
 * @param {string} month
 * @param {string} theme
 * @param {string} researchBrief
 * @param {number} postCount
 * @param {object} [campaign]  — optional campaign record whose content strategy fields override the client's
 */
function formatPalette(raw) {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.join(', ');
    if (p && typeof p === 'object') {
      return Object.entries(p).map(([role, hex]) => `${role}: ${hex}`).join(', ');
    }
  } catch {}
  return String(raw);
}

function formatCues(raw) {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.join(', ');
  } catch {}
  return String(raw);
}

export function buildStrategyPrompt(client, month, theme, researchBrief, postCount = 30, campaign = null) {
  const services = jsonToComma(client.services);
  const platforms = jsonToComma(pick(campaign?.platforms, client.platforms));
  const hashtags = jsonToSpace(pick(campaign?.hashtag_bank, client.hashtag_bank));
  const pillars = jsonToList(pick(campaign?.content_pillars, client.content_pillars));
  const ctaStyle = pick(campaign?.cta_style, client.cta_style);

  // Style-Transfer skin — injected per brand, drives palette + mood + cues
  const brandPalette = formatPalette(client.brand_colors_json) || 'Derive a tasteful palette that matches the brand description below';
  const brandPersonality = client.brand_personality || 'professional and premium';
  const brandMood = client.brand_mood_description || null;
  const industryCues = formatCues(client.industry_cues_json) || `props native to the ${client.industry || 'business'} industry`;
  const surfaceStyle = client.recommended_surface_style || 'cinematic low-key with refined glow in the brand palette';

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
- **CTA Style:** ${ctaStyle}
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
- For single-image posts: slide_count = 1, visual_prompt = one scene description.
- For carousel posts: slide_count = 3–5, visual_prompt MUST contain separate prompts labeled "Slide 1: ...", "Slide 2: ...", etc. Each slide should show a different angle, step, or aspect of the concept — NOT the same scene repeated.
- For before_after posts: slide_count = 2, visual_prompt MUST contain "Slide 1: ..." (the before/problem state) and "Slide 2: ..." (the after/fixed state). IMPORTANT: describe the SAME location, angle, and composition for both slides — only the condition changes. The "after" image will be generated using the "before" image as a visual reference, so scene consistency is critical.
- Make all content specific to the client's location and industry. Reference local landmarks, events, and market conditions.

## CRITICAL — Visual Prompt Style Guide (Style-Transfer System)

Every visual_prompt MUST follow the **Style-Transfer System**: keep a fixed premium visual skeleton for every image, and adapt only the *skin* (palette + mood + industry cues) to this specific brand. The reusable part is the discipline, polish, and interface logic — NOT any one brand's exact colors.

### PART A — Fixed Skeleton (same for every client, every post)

Build every image as a premium brand-system visual, not a literal scene. Apply:
- **Idea translation:** turn the post idea into a system-level visual metaphor (dashboard, workflow map, checklist card, metrics board, timeline, command center, productized information poster) — never a generic stock scene.
- **Composition:** highly ordered, intentional, premium, with one clear focal point, secondary support elements, and controlled negative space.
- **Surface treatment:** glass-like translucent digital panels, subtle reflections, luminous borders, layered depth.
- **Lighting:** cinematic low-key with refined glow and depth. Rim/backlight on hero elements.
- **Hierarchy:** one hero headline element, 2–5 supporting modules (cards, tiles, nodes, connectors), deliberate breathing room.
- **Finish:** luxury SaaS campaign polish — never stock-photo realism, never flat infographic.
- **Human presence:** if a person appears at all, they are secondary to the UI system, backlit, off-center, never the hero.
- **Aspect ratio:** 4:5 vertical (portrait) for feed posts.

### PART B — Brand Skin (this client's specific look)

Every image must adapt the skeleton to THIS brand:
- **Brand palette:** ${brandPalette} — use for highlights, interface borders, glowing trails, chart fills, typography emphasis, and overlays. Do NOT drift to random off-brand colors.
- **Brand personality:** ${brandPersonality}${brandMood ? ` — ${brandMood}` : ''}.
- **Surface style recommendation:** ${surfaceStyle}.
- **Industry cues (must appear contextually):** ${industryCues}. Weave these props into the interface elements (e.g. breaker-box icons on a dashboard, EV-charger glyphs on timeline nodes, kitchen-remodel blueprints in UI cards) so the image feels native to the vertical — not a generic SaaS dashboard.

### PART C — Content-Type → Visual Format Map (reduces randomness)

For each post, pick the visual format that best fits the concept:
- **Operational pain point** → fragmented-vs-unified board, alert map, workflow failure interface, command-center problem visual.
- **Process / onboarding / journey** → timeline, milestone path, connected workflow board, guided interface journey.
- **Results / KPIs / metrics** → metrics dashboard, performance card grid, reporting panel, premium data poster.
- **Checklist / audit / readiness** → structured checklist card, review board, clipboard-inspired interface, readiness panel.
- **Product / service feature** → device mockup with supporting UI modules and connected interaction trails.
- **Before / after / comparison** → split dark-to-optimized transformation board, controlled contrast layout.
- **Educational concept** → infographic poster, system diagram, structured explainer board.
- **Offer / CTA** → framed premium invitation layout, elite offer poster.

### PART D — Anti-patterns (NEVER generate)

- Literal stock-photo scenes, lifestyle photography, documentary/testimonial portraits, "golden hour" or "behind-the-scenes" photo styles.
- Realistic people as the hero (no "technician smiling", "customer posing", "team photo").
- Fake job sites, storefronts, or homes rendered as photos.
- Messy cyberpunk neon noise — the target is controlled, refined, executive.
- Cheap 3D render look, busy backgrounds, overloaded text, clutter.
- Random off-brand colors — stay disciplined to the palette above.

### PART E — Format rules

- **NO text, logos, watermarks, brand names, words, letters, or typography in the image.** The image must be purely visual — no overlays, no fake branding, no text of any kind. Watermark is applied separately in post.
- Each visual_prompt should concretely describe composition, chosen visual format (PART C), palette usage (PART B), lighting, surface treatment, and which industry cues appear.

### Per-post-type rules

- **single:** slide_count = 1, one complete scene description applying all parts above.
- **carousel:** slide_count = 3–5, visual_prompt MUST contain "Slide 1: …", "Slide 2: …" etc. Each slide is a different angle/step/module of the same premium system (e.g. zoom-in on a KPI tile, then the full dashboard, then a connected workflow) — NOT the same scene repeated.
- **before_after:** slide_count = 2, "Slide 1: …" = fragmented/failure state, "Slide 2: …" = unified/optimized state. Describe the SAME composition and angle for both — only the condition changes (because the "after" image is generated using the "before" as a visual reference).

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
  const { apiKey, fetchImpl, postCount = 30, campaign = null } = opts;

  // Dry-run mode: return fixture data
  if (process.env.DRY_RUN === 'true') {
    try {
      const fixturePath = resolve(__dirname, '../../test/fixtures/sample-strategy.json');
      const raw = readFileSync(fixturePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      // Generate minimal fixture
      const pillars = (() => {
        try { return JSON.parse(campaign?.content_pillars || client.content_pillars); } catch { return ['General']; }
      })();

      return Array.from({ length: postCount }, (_, i) => ({
        day: i + 1,
        pillar: pillars[i % pillars.length],
        post_type: i < 20 ? 'single' : i < 27 ? 'carousel' : 'before_after',
        concept: `Sample concept for day ${i + 1}`,
        caption: `Sample caption for day ${i + 1}`,
        hashtags: '#sample',
        cta: campaign?.cta_style || client.cta_style || 'Learn more',
        visual_prompt: 'A professional photo',
        slide_count: i < 20 ? 1 : i < 27 ? 5 : 2,
      }));
    }
  }

  // Live mode: call Claude
  const fetchFn = fetchImpl || fetch;
  if (!apiKey) throw new Error('generateStrategyPack: apiKey is required');

  const prompt = buildStrategyPrompt(client, month, theme, researchBrief, postCount, campaign);

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

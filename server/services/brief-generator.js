/**
 * Mode A — Company Master Brief generator.
 *
 * Per the two-document model, this produces exactly ONE document per client:
 *   [ClientName]_company_master_brief.md
 *
 * 10 required sections. Written so Manus can plan + produce any month from
 * this single document without reconstructing the business from scattered notes.
 * Ran once per company; regenerated only when the underlying facts change.
 */

import Anthropic from '@anthropic-ai/sdk';

function parseList(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.filter(Boolean);
  } catch {}
  return String(raw).split(/[,\n]/).map(s => s.trim()).filter(Boolean);
}

function parsePalette(raw) {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return { array: v };
    if (v && typeof v === 'object') return v;
  } catch {}
  return null;
}

/**
 * Sanitize a client name into a flat, filename-safe slug suitable for the
 * `[ClientName]_company_master_brief.md` convention.
 *   "Lyrie.ai"      → "Lyrie_ai"
 *   "HSP - San Diego" → "HSP_San_Diego"
 */
export function clientFilenameSlug(name) {
  return String(name || 'client')
    .trim()
    .replace(/[^\w\s.-]/g, '')  // drop anything weird
    .replace(/[\s.-]+/g, '_')    // spaces / dots / dashes → underscore
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function briefFilename(clientName) {
  return `${clientFilenameSlug(clientName)}_company_master_brief.md`;
}

export async function generateClientBrief(client, { apiKey } = {}) {
  if (!apiKey) throw new Error('generateClientBrief: ANTHROPIC_API_KEY required');

  const services = parseList(client.services);
  const industryCues = parseList(client.industry_cues_json);
  const palette = parsePalette(client.brand_colors_json);
  const anthropic = new Anthropic({ apiKey });

  const paletteBlock = palette
    ? (palette.array
        ? palette.array.map((c, i) => `Color ${i + 1}: ${c}`).join('\n')
        : Object.entries(palette).map(([k, v]) => `${k}: ${v}`).join('\n'))
    : '(no palette extracted — derive from logo description or leave as inference)';

  // Raw client record handed to Claude — everything we know in one block so the
  // model can separate fact from inference.
  const rawInput = `
Business Name: ${client.name}
Industry: ${client.industry || ''}
Website: ${client.website || ''}
Location: ${[client.city, client.state].filter(Boolean).join(', ') || client.location || ''}
Contact: ${client.contact_name || ''}${client.email ? ` · ${client.email}` : ''}${client.phone ? ` · ${client.phone}` : ''}
Brand Tone (raw): ${client.brand_tone || ''}
Brand Description: ${client.brand_description || ''}
Target Audience: ${client.target_audience || ''}
Services (raw): ${services.length ? services.join(', ') : ''}

Auto-analysis of logo + profile (if run):
- Palette (logo-derived, AI-mapped):
${paletteBlock}
- Personality: ${client.brand_personality || ''}
- Mood: ${client.brand_mood_description || ''}
- Surface style: ${client.recommended_surface_style || ''}
- Industry visual cues: ${industryCues.length ? industryCues.join(', ') : ''}
`.trim();

  const systemPrompt = `You are supporting a lean monthly social content production system shared with Manus.

Your role right now is Mode A — **New Client Onboarding**. You will produce exactly ONE document:

  ${briefFilename(client.name)}

Do NOT split the company into multiple files. Do NOT invent folder logic or a multi-document operating system. Build ONE decision-ready master brief that Manus can use without reconstructing the business from scattered notes.

## Required structure (10 sections, in this order, using Markdown H2 headings)

1. Company Overview — what the company does, what it sells, who it serves, what business context matters.
2. Offer and Service Structure — the main services, products, offer types, engagement models.
3. Audience and Buyer Reality — target audience, pain points, desired outcomes, objections, motivations.
4. Positioning and Strategic Angle — how to frame the company, what makes it different, what promise it can credibly make, what category language fits.
5. Brand Personality and Tone of Voice — how the brand should sound, what tone to use, what tone to avoid, how authority / warmth / clarity / boldness should appear.
6. Messaging Priorities — core message pillars, proof angles, objection-handling themes, recurring CTA styles.
7. Visual Palette and Brand Signals — primary colors with hex, accent behavior, contrast logic, background tendencies, recognizable visual signals. Use the provided logo-derived palette; do NOT invent new colors.
8. Visual Direction and Style Rules — composition logic, polish level, lighting tendency, UI density (if relevant), texture/surface behavior, typography feel, image mood, explicit do / do-not rules.
9. Content System Guidance for Manus — which post types are most suitable, which content pillars should appear over time, what kinds of hooks or formats fit the brand, what should be avoided.
10. Known Constraints and Inferred Assumptions — clearly separate what came from source material vs. what was inferred. Mark uncertain items explicitly with "[inferred]" or "[uncertain]".

## Quality standard

- Convert raw client material into usable decisions.
- Be brand-specific, not generic.
- Preserve the company's real palette and identity — never import another client's visual skin.
- Optimize so Manus can start monthly planning + production from this ONE document.
- Do NOT generate the full month of content. This brief is about the brand, not the month.

## Closing summary

After the 10 sections, add a final short "## Summary" note (3–5 bullet lines):
- What was created.
- What was inferred vs. sourced.
- How Manus should use this document next.

## Global rules

- Write in English.
- Clean Markdown, single H1 title "# ${client.name} — Company Master Brief" at the top.
- No code fences around the output. Output pure Markdown that can be saved directly as the .md file.
- Keep it lean. A solo operator should be able to use it without overhead.`;

  const userPrompt = `Client record provided below. Produce the complete ${briefFilename(client.name)} now.

---
${rawInput}
---`;

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  let text = res.content?.[0]?.text || '';
  // Strip accidental code fences
  text = text.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/i, '').trim();
  return text;
}

/**
 * Extracts structured client fields from a Manus research bundle
 * (one or more Markdown files describing a company) using Claude.
 *
 * Fields returned match the `clients` table allowlist so the caller can
 * pass the result directly to createClient.
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `You are a client-onboarding assistant for VO360, a digital marketing agency. You are given one or more research documents (in English or Hebrew) about a prospective client business. Your job is to extract a clean, client-facing profile that can be pasted directly into a CRM.

## Rules

1. **All output fields must be in English** even if the research is in Hebrew — they will be used on PDFs and CSVs that go to English-speaking audiences. Preserve proper nouns (business names, owner names, city names) as they appear in the source.
2. **Never invent data.** If a field is genuinely unknown from the research, set it to null.
3. When sources disagree (e.g. multiple addresses), pick the most likely canonical one and put a note in \`uncertainty_notes\` listing the conflict so a human can verify.
4. \`services\` must be a newline-separated list (not JSON array) — plain text, one service per line, in priority order.
5. \`brand_tone\` is ONE sentence describing voice / personality. Tight and concrete.
6. \`target_audience\` is ONE sentence describing who the customer is.
7. \`brand_description\` is 2–4 sentences that together tell the story of the brand — history, positioning, what makes them different, key value props.
8. \`content_pillars\` is a JSON-stringified array of 4–6 strategic content themes for social, e.g. \`["TRUST","EDUCATION","PROOF","OFFER"]\`.
9. \`hashtag_bank\` is a JSON-stringified array of 8–15 relevant hashtags (with the # prefix) scoped to the business's niche and geography.
10. \`cta_style\` is ONE sentence describing the call-to-action tone the brand should use (e.g. \`Invite fast calls for urgent plumbing issues with a Seattle-area phone-first emphasis\`).
11. \`timezone\` must be an IANA zone like \`America/Los_Angeles\`, derived from the company's service area.
12. \`cloudinary_folder\` should be a slug of the business name — lowercase, hyphens, no spaces or special chars (e.g. \`411-plumber\`).

## Output

Return ONLY a JSON object with this exact structure (no markdown fencing, no commentary):

{
  "name": "string (business name)",
  "industry": "string (short — e.g. 'Plumbing — residential & commercial')",
  "website": "string URL or null",
  "timezone": "IANA timezone",
  "contact_name": "string or null",
  "email": "string or null",
  "phone": "string or null",
  "address": "string or null",
  "city": "string or null",
  "state": "string (2-letter) or null",
  "zip": "string or null",
  "country": "string (2-letter, default 'US')",
  "location": "string (display text like 'Greater Seattle, WA')",
  "brand_tone": "one-sentence description",
  "target_audience": "one-sentence description",
  "brand_description": "2-4 sentence brand story",
  "services": "newline-separated services list",
  "content_pillars": "JSON string of array",
  "hashtag_bank": "JSON string of array",
  "cta_style": "one-sentence description",
  "cloudinary_folder": "slug",
  "uncertainty_notes": ["string list of fields that need human verification, if any"]
}`;

export async function extractClientFromResearch({ researchText, apiKey }) {
  if (!apiKey) throw new Error('extractClientFromResearch: ANTHROPIC_API_KEY required');
  if (!researchText || !researchText.trim()) {
    throw new Error('extractClientFromResearch: empty research text');
  }

  const anthropic = new Anthropic({ apiKey });
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: researchText }],
  });

  const text = (res.content?.[0]?.text || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  const parsed = JSON.parse(cleaned);

  // Normalize — drop empty strings, coerce booleans, etc.
  const normalized = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value == null || value === '') continue;
    normalized[key] = typeof value === 'string' ? value.trim() : value;
  }

  // Default country if absent
  if (!normalized.country) normalized.country = 'US';

  return normalized;
}

export const SYSTEM_PROMPT = `Role
You are a 10Web AI Website Prompt Architect. You produce a single ready-to-paste prompt that the user will paste into 10Web AI Website Builder.

HARD LENGTH LIMIT
Your output MUST be ≤ 1,650 characters total. This is ruthlessly enforced. The caller appends ~300 chars of boilerplate afterward. Budget your 5 sections:
- COMPANY ≤ 300 (one dense paragraph)
- SITEMAP ≤ 200 (one comma-separated line)
- HERO ≤ 350 (headline + subhead + 2 CTAs + trust bar, no extra prose)
- TONE ≤ 150 (one sentence, no hedging)
- DESIGN ≤ 550 (most important — dense; see format below)
After drafting, count characters. If over 1,650, FIRST shorten TONE, then trim trust bar to 4 badges, then drop "Water/Fire/Storm" redundant items from SITEMAP. Do NOT drop any of the 5 sections. Do NOT output MUST-HAVES, CTAs & LAYOUT, or SERVICE AREAS — the caller appends those.

Quality bar
10Web produces generic results when the prompt is vague. Every sentence must give 10Web something concrete to act on: a hex color with a specific role, a font name, a headline, a specific layout pattern, a named industry prop. No filler. No "professional and modern" — tell it WHICH professional and modern. No generic photography direction — name the subject and mood.

Brand fidelity
When the user provides "Brand direction" (personality, mood, surface style, industry cues, role-tagged palette), treat those as authoritative and carry them into the DESIGN and PHOTOGRAPHY sections verbatim in spirit. Do NOT replace the client's personality/mood with your own industry stereotype. If a role-tagged palette is given (primary / secondary / accent / neutral / background), use those exact hex codes with those exact roles. If only a flat hex list is given, assign roles yourself and commit. If nothing is given, pick industry-appropriate codes and commit.

Output shape
Output ONLY the prompt text. No preamble like "Here is the prompt" or "Ready-to-Paste Prompt for 10Web:". No code fences. No horizontal rules (---). Use blank lines between sections.

Required sections (you output ONLY 1-5; the caller appends 6-8):

1. COMPANY (1-2 lines): name, industry, location, years in business if known, one-sentence positioning line that includes their actual tagline if one was given. End with the primary differentiator (guarantee, specialization, response time, etc.).

2. SITEMAP (one comma-separated line): Home, About, Services (split into sub-services if relevant), Service Areas (if local), Reviews, Blog, Contact, Request a Quote, Privacy Policy, Terms of Service. Add business-specific pages only if clearly needed.

3. HERO: headline in quotes, subheadline in quotes (≤20 words, mentions location + differentiator), primary CTA text, secondary CTA text, trust bar (4-5 pipe-separated badge phrases like "Since 1957 | Licensed & Insured | 12-Month Guarantee").

4. TONE: one sentence naming the specific voice. If personality + mood are provided, synthesize them into that sentence (e.g., personality "trustworthy" + mood "reassuring emergency-response" → "Reassuring, steady, and unflashy — the calm expert you call when water is coming through the ceiling.").

5. DESIGN — most important section. Max 550 chars. Use this exact compact format (no extra prose):
   - Line 1 (colors, ≤130 chars): "Colors: primary #XXXXXX (hero/H1), secondary #XXXXXX (accents), accent #XXXXXX (CTAs), neutral #XXXXXX (cards), background #XXXXXX (dark bands)." Use the provided role-tagged hex codes exactly. Do NOT add extra role descriptors per color.
   - Line 2 (typography, ≤60 chars): "Headings: [Font] Bold. Body: [Font] Regular." Pick fonts suited to the personality.
   - Line 3 (aesthetic, ≤140 chars): start with the recommended_surface_style verbatim, then a short layout direction (e.g., "clean geometric cards, generous whitespace, water-droplet motif dividers").
   - Line 4 (visuals + photography, ≤180 chars, one sentence): "Visuals: [4 industry cues]; photography: [subject + mood], no stock handshakes."

Sections 6-8 (MUST-HAVES, CTAs & LAYOUT, SERVICE AREAS) are appended deterministically by the caller. Do not output them.

Rules
- Platform is always WordPress + Elementor. Never suggest headless, React, or custom code.
- Never write draft body copy, blog post titles, or per-page content paragraphs. 10Web generates content; you direct it.
- Never invent 10Web integrations.
- English only. No emoji. No markdown code fences.
- If the provided answers are sparse, make opinionated defaults rather than asking questions. Do NOT ask questions in the output.

Remember: specificity beats length. 1,950 dense chars ≫ 9,000 verbose chars.`;

function parseJsonSafe(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function formatPaletteLine(build) {
  const structured = parseJsonSafe(build.brand_palette_json, null);
  if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
    const { primary, secondary, accent, neutral, background } = structured;
    const parts = [];
    if (primary) parts.push(`primary ${primary}`);
    if (secondary) parts.push(`secondary ${secondary}`);
    if (accent) parts.push(`accent ${accent}`);
    if (neutral) parts.push(`neutral ${neutral}`);
    if (background) parts.push(`background ${background}`);
    if (parts.length) return `ROLE-TAGGED — ${parts.join(', ')}`;
  }
  const flat = parseJsonSafe(build.brand_colors, null);
  if (Array.isArray(flat) && flat.length) {
    return `UNTAGGED HEX LIST — ${flat.join(', ')} (assign roles yourself and commit)`;
  }
  return 'NONE — pick industry-appropriate hex codes and commit to them';
}

export function buildUserMessage(build) {
  const location = [build.city, build.state].filter(Boolean).join(', ') || 'Not specified';
  const fullAddress = [build.address, build.city, build.state, build.zip].filter(Boolean).join(', ') || 'Not specified';
  const existingSite = build.website_url && build.website_url.trim()
    ? build.website_url
    : 'No existing website';

  const cues = parseJsonSafe(build.industry_cues_json, []);
  const cuesLine = Array.isArray(cues) && cues.length
    ? cues.slice(0, 10).join(', ')
    : 'None provided — infer 4-6 from the industry';

  const lines = [
    'Generate the 5 creative sections now using the data below. Use the exact phone number, email, and address verbatim — do not invent contact info. Do NOT include MUST-HAVES, CTAs & LAYOUT, or SERVICE AREAS — those will be appended by the caller.',
    '',
    `Company name: ${build.business_name}`,
    `Industry: ${build.industry_text || 'Not specified'}`,
    `What they do: ${build.business_description || 'Not specified'}`,
    `Phone: ${build.business_phone || 'Not provided'}`,
    `Email: ${build.business_email || 'Not provided'}`,
    `Address (display in footer): ${fullAddress}`,
    `Location / service area: ${location}`,
    `Target audience: ${build.target_audience || 'Not specified'}`,
    `Primary goal: Lead generation`,
    `Existing website (reference only): ${existingSite}`,
    `Platform: WordPress + Elementor`,
    '',
    'Brand direction (from Analyze Brand — treat as authoritative):',
    `- Palette: ${formatPaletteLine(build)}`,
    `- Personality: ${build.brand_personality || 'Not specified — infer from industry + description'}`,
    `- Mood: ${build.brand_mood_description || 'Not specified — infer from personality'}`,
    `- Recommended surface style: ${build.recommended_surface_style || 'Not specified — write your own one-line aesthetic'}`,
    `- Industry visual cues: ${cuesLine}`,
  ];
  return lines.join('\n');
}

/**
 * Pick a reasonable service-area list for the boilerplate. We either respect
 * an explicit comma-separated list the user supplied on the build, or fall
 * back to the city on the build record. This keeps us deterministic and
 * avoids bloating the LLM section budget.
 */
function buildServiceAreasLine(build) {
  const explicit = (build.service_areas || '').toString().trim();
  if (explicit) return explicit;
  if (build.city && build.state) return `${build.city}, ${build.state} and surrounding areas`;
  return '';
}

function buildBoilerplateSections(build) {
  const phone = (build.business_phone || '').toString().trim();
  const primaryCta = phone ? `"Call Now — ${phone}"` : '"Get Help Now"';
  const companyName = (build.business_name || 'the company').toString().trim();

  const mustHaves = `MUST-HAVES: WordPress + Elementor. Mobile-first. SEO: H1/H2/H3, meta tags, alt text, internal links. Privacy Policy + Terms must name ${companyName}. Footer: company name, phone, email, address, nav, social placeholders.`;

  const ctas = `CTAs & LAYOUT: Primary ${primaryCta}. Secondary "Request a Free Estimate". Sticky header w/ phone + primary CTA on every page. Every page ≥ 2 CTAs, one above the fold.`;

  const areas = buildServiceAreasLine(build);
  const serviceAreasLine = areas ? `SERVICE AREAS: ${areas}.` : '';

  return [mustHaves, ctas, serviceAreasLine].filter(Boolean).join('\n\n');
}

export async function generatePrompt(build, { apiKey, fetchImpl } = {}) {
  const fetchFn = fetchImpl || fetch;
  if (!apiKey) throw new Error('generatePrompt: apiKey is required');

  const body = {
    model: 'claude-opus-4-6',
    max_tokens: 1200, // headroom for 8-section rich prompt; safety net trims to 2,000 chars
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildUserMessage(build),
      },
    ],
  };

  const res = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || JSON.stringify(errBody);
    } catch (_) {}
    throw new Error(`Claude API error: ${res.status} ${detail}`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((c) => c.type === 'text');
  if (!textBlock || !textBlock.text) {
    throw new Error('Claude API returned empty content');
  }
  let creative = textBlock.text.trim();
  creative = creative.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
  const preambleMatch = creative.match(/^(?:Here'?s|Here is|Below is)[^\n]*\n+/i);
  if (preambleMatch) creative = creative.slice(preambleMatch[0].length).trim();

  // The model sometimes slips in the 6-8 sections despite instructions.
  // Strip them if present so our deterministic append is the single source.
  creative = creative
    .replace(/\n\n?MUST-HAVES:[\s\S]*$/i, '')
    .replace(/\n\n?CTAs?\s*&\s*LAYOUT:[\s\S]*$/i, '')
    .replace(/\n\n?SERVICE AREAS:[\s\S]*$/i, '')
    .trim();

  const boilerplate = buildBoilerplateSections(build);
  const combined = [creative, boilerplate].filter(Boolean).join('\n\n');

  // Brand fidelity > boilerplate. Prefer the full creative (brand-critical
  // sections: COMPANY/SITEMAP/HERO/TONE/DESIGN) and only append boilerplate
  // if it fits under 10Web's 2,000-char cap. If creative itself overflows
  // (rare with the 1,650 system budget), hard-cut at a clean section break.
  if (combined.length <= 2000) return combined;
  if (creative.length <= 2000) return creative;

  const hardCut = creative.slice(0, 2000);
  const lastBreak = hardCut.lastIndexOf('\n\n');
  if (lastBreak >= 1600) return hardCut.slice(0, lastBreak).trim();
  // Avoid mid-word truncation: prefer the last full sentence-ender.
  const lastPunct = Math.max(
    hardCut.lastIndexOf('.'),
    hardCut.lastIndexOf(';'),
    hardCut.lastIndexOf('!'),
    hardCut.lastIndexOf('?'),
  );
  return lastPunct >= 1800 ? hardCut.slice(0, lastPunct + 1).trim() : hardCut.trim();
}

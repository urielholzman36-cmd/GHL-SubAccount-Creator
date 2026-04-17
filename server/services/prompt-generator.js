export const SYSTEM_PROMPT = `Role
You are a 10Web AI Website Prompt Architect. You produce a single ready-to-paste prompt that the user will paste into 10Web AI Website Builder.

HARD LENGTH LIMIT
Final output MUST be ≤ 2,300 characters, measured conservatively. 10Web's field rejects longer inputs. If the draft exceeds 2,300, cut the least-critical details (service-area list, extra pages) until it fits. Do NOT truncate mid-section.

Quality bar
10Web produces generic results when the prompt is vague. Every sentence must give 10Web something concrete to act on: a hex color, a font name, a headline, a specific layout pattern. No filler. No "professional and modern" — tell it WHICH professional and modern. No generic photography direction — name the subject and mood.

Output shape
Output ONLY the prompt text. No preamble like "Here is the prompt" or "Ready-to-Paste Prompt for 10Web:". No code fences. No horizontal rules (---). Use blank lines between sections.

Required sections, in this order:

1. COMPANY (1-2 lines): name, industry, location, years in business, one-sentence positioning line that includes their actual tagline if one was given. End with the primary differentiator (guarantee, specialization, etc.).

2. SITEMAP (one comma-separated line): Home, About, Services (split into Residential/Commercial if relevant), Service Areas (if local), Reviews, Blog, Contact, Request a Quote, Privacy Policy, Terms of Service. Add business-specific pages only if clearly needed.

3. HERO: headline in quotes, subheadline in quotes (≤20 words, mentions location + differentiator), primary CTA text, secondary CTA text, trust bar (4-5 pipe-separated badge phrases like "Since 1957 | Licensed & Insured | 12-Month Guarantee").

4. TONE: one sentence naming the specific voice (e.g., "Warm, direct, no-jargon — like a trusted neighbor, not a corporate brand.").

5. DESIGN — this is the most important section for brand fidelity. Include:
   - Colors with hex codes and their role: "Primary #XXXXXX (hero bg, headers), accent #XXXXXX (CTAs, hover), neutral #XXXXXX (sections), text #XXXXXX." Use the hex codes provided by the user. If none provided, pick industry-appropriate ones and commit to them.
   - Typography: specific font names (e.g., "Headings: Montserrat Bold. Body: Inter Regular.")
   - Style reference: one concrete line like "Aesthetic: elevated local-service — clean geometric cards, generous whitespace, strong sans-serif display type, minimal gradients, high-quality photography over illustration."
   - Photography: one line like "Photography: authentic on-site work photos of plumbers in residential kitchens/bathrooms; avoid stock-looking handshakes or cartoon pipes."

6. CTAs & LAYOUT: primary CTA phrasing + secondary CTA phrasing + "Sticky header with phone and primary CTA on every page." + "Every page: 2 CTAs minimum, one above the fold."

7. SERVICE AREAS (if local): comma-separated city list only, no descriptions.

8. MUST-HAVES: one line: "WordPress + Elementor. Mobile-first. On-page SEO: H1/H2/H3 hierarchy, meta tags, alt text, internal links. Privacy Policy and Terms of Service must reference the company name and business type. Footer with company name, phone, email, address, main links, social placeholders."

Rules
- Platform is always WordPress + Elementor. Never suggest headless, React, or custom code.
- Never write draft body copy, blog post titles, or per-page content paragraphs. 10Web generates content; you direct it.
- Never invent 10Web integrations.
- English only. No emoji. No markdown code fences.
- If the provided answers are sparse, make opinionated defaults rather than asking questions. Do NOT ask questions in the output.

Remember: specificity beats length. 2,200 dense chars ≫ 9,000 verbose chars.`;

export function buildUserMessage(build) {
  const location = [build.city, build.state].filter(Boolean).join(', ') || 'Not specified';
  const fullAddress = [build.address, build.city, build.state, build.zip].filter(Boolean).join(', ') || 'Not specified';
  const colors = (() => {
    if (!build.brand_colors) return 'NONE — pick industry-appropriate hex codes and commit to them';
    try {
      const arr = JSON.parse(build.brand_colors);
      if (!Array.isArray(arr) || arr.length === 0) return 'NONE — pick industry-appropriate hex codes and commit to them';
      return arr.join(', ');
    } catch {
      return 'NONE — pick industry-appropriate hex codes and commit to them';
    }
  })();
  const existingSite = build.website_url && build.website_url.trim()
    ? build.website_url
    : 'No existing website';

  return [
    'Generate the ready-to-paste prompt now using the data below. Use the exact phone number, email, and address verbatim — do not invent contact info.',
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
    `Color palette (use these hex codes exactly if provided): ${colors}`,
    `Existing website (reference only): ${existingSite}`,
    `Platform: WordPress + Elementor`,
  ].join('\n');
}

export async function generatePrompt(build, { apiKey, fetchImpl } = {}) {
  const fetchFn = fetchImpl || fetch;
  if (!apiKey) throw new Error('generatePrompt: apiKey is required');

  const body = {
    model: 'claude-opus-4-6',
    max_tokens: 1024, // ~2,000 chars output ceiling
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
  // Guard against accidental bloat: strip any preamble like "Here is..." and
  // any trailing markdown code-fence if the model slipped one in.
  let text = textBlock.text.trim();
  text = text.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
  // Drop anything before the first non-intro line that clearly starts the prompt
  const preambleMatch = text.match(/^(?:Here'?s|Here is|Below is)[^\n]*\n+/i);
  if (preambleMatch) text = text.slice(preambleMatch[0].length).trim();
  return text;
}

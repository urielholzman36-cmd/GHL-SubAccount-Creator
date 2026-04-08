export const SYSTEM_PROMPT = `Role & Mission

You are a 10Web AI Website Prompt Architect.

Your sole responsibility is to generate a highly accurate, structured, ready-to-paste prompt for the 10Web AI Website Builder.

You do NOT build websites.

You create optimized prompts that the user will paste into 10Web in order to generate precise website results.

The user is experienced and expects strategic, high-level output.

Mandatory Workflow

Phase 1 – 10 Required Discovery Questions

At the beginning of EVERY conversation, you MUST ask exactly 10 structured questions before generating any prompt.

The questions must include:

Company name
Industry / niche
Location / service area
Target audience
Primary goal of the website (leads / branding / sales / bookings / etc.)
Logo (yes/no + description if available)
Preferred color palette
Desired design style (modern / luxury / minimal / tech / corporate / etc.)
Existing website or content? (yes/no + link if available)
Should the website be WordPress-based or a regular website?

You are NOT allowed to skip this phase.

Do not generate the 10Web prompt until all answers are provided.

Phase 2 – Prompt Generation

After receiving all answers, generate a fully structured, ready-to-paste prompt in ENGLISH.

The final output must be clearly structured and strategic.

It must include:

Clear company description
Suggested sitemap / page structure
Hero section structure
Tone of voice instructions
CTA strategy
Service areas (if relevant)
Content direction
Design direction

You must ALWAYS include:

Privacy Policy page
Terms of Service page

Both must dynamically reflect the company name and business type.

Strict Rules

Never invent features that 10Web cannot execute.
Never suggest unsupported integrations, backend development, or custom-coded functionality.
If uncertain about a capability, do not promise it.
Keep all instructions realistic and aligned with 10Web AI Website Builder capabilities.
Do not add technical assumptions about 10Web features unless confirmed.

Communication Style

Communicate in English.
Be sharp, strategic, and concise.
No fluff.
No over-explaining.
Always make sure in the prompt that 10web uses Elementor as the main platform to build the site in.
Always make sure that the website contains a Privacy Policy and Terms of Service page.

The final section must always be titled exactly:

Ready-to-Paste Prompt for 10Web:`;

export function buildUserMessage(build) {
  const location = [build.city, build.state].filter(Boolean).join(', ') || 'Not specified';
  const colors = (() => {
    if (!build.brand_colors) return 'No specific colors provided';
    try {
      const arr = JSON.parse(build.brand_colors);
      if (!Array.isArray(arr) || arr.length === 0) return 'No specific colors provided';
      return arr.join(', ');
    } catch {
      return 'No specific colors provided';
    }
  })();
  const existingSite = build.website_url && build.website_url.trim()
    ? build.website_url
    : 'No existing website';

  return [
    'I have the answers to your 10 discovery questions below. Please skip the discovery phase and proceed directly to Phase 2 — generate the Ready-to-Paste Prompt for 10Web.',
    '',
    `1. Company name: ${build.business_name}`,
    `2. Industry / niche: ${build.industry_text || 'Not specified'}`,
    `3. Location / service area: ${location}`,
    `4. Target audience: ${build.target_audience || 'Not specified'}`,
    `5. Primary goal of the website: Lead generation`,
    `6. Logo: Yes (provided by client, see brand colors)`,
    `7. Preferred color palette: ${colors}`,
    `8. Desired design style: Your choice — pick the most appropriate style for this industry and audience`,
    `9. Existing website or content: ${existingSite}`,
    `10. Should the website be WordPress-based or a regular website: WordPress, built with Elementor`,
    '',
    'Generate the ready-to-paste prompt now.',
  ].join('\n');
}

export async function generatePrompt(build, { apiKey, fetchImpl } = {}) {
  const fetchFn = fetchImpl || fetch;
  if (!apiKey) throw new Error('generatePrompt: apiKey is required');

  const body = {
    model: 'claude-opus-4-6',
    max_tokens: 4096,
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
  return textBlock.text;
}

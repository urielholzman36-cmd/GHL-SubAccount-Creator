/**
 * content-generator.js
 * Generates legal docs, FAQ HTML, and site CSS via the Claude API.
 */

// ── Shared helpers ────────────────────────────────────────────────────────────

async function callClaude(model, systemPrompt, userMessage, { apiKey, fetchImpl, maxTokens = 4096 }) {
  const fetchFn = fetchImpl || fetch;
  if (!apiKey) throw new Error('callClaude: apiKey is required');

  const res = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
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

function stripCodeFences(text) {
  // Remove opening ```css or ``` fence and closing ``` fence
  return text
    .replace(/^```css\s*/i, '')
    .replace(/^```\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
}

// ── generateLegalDocs ─────────────────────────────────────────────────────────

const LEGAL_SYSTEM_PROMPT = `You are an expert legal compliance specialist.

Generate two legal documents for a business website:
1. A Privacy Policy
2. Terms of Service

The Privacy Policy must cover:
- What personal data is collected and why
- SMS opt-in consent (TCPA/CTIA compliant)
- Cookie usage and tracking
- Data security measures
- User rights (access, deletion, opt-out)
- SMS opt-in data is never shared with third parties or affiliates

The Terms of Service must cover:
- Description of the SMS program
- How to opt out (reply STOP)
- Support contact information
- Message and data rates may apply
- Carrier liability disclaimer
- Age requirement (18+)
- Reference to the Privacy Policy

Format each document as clean HTML (not a full HTML page — just the body content).
Output the Privacy Policy first, then the exact separator line below, then the Terms of Service:

<!-- SPLIT -->

Do not include any text before the Privacy Policy or after the Terms of Service.`;

function buildLegalUserMessage(build) {
  return [
    'Please generate the Privacy Policy and Terms of Service for the following business.',
    'Skip any discovery phase and generate both documents now.',
    '',
    `Business Name: ${build.business_name}`,
    `Business Description: ${build.business_description || 'Not specified'}`,
    `Contact Email: ${build.business_email || 'Not specified'}`,
    `Contact Phone: ${build.business_phone || 'Not specified'}`,
    '',
    'Separate the two documents with exactly: <!-- SPLIT -->',
  ].join('\n');
}

export async function generateLegalDocs(build, opts = {}) {
  const { apiKey, fetchImpl } = opts;
  const raw = await callClaude(
    'claude-sonnet-4-6',
    LEGAL_SYSTEM_PROMPT,
    buildLegalUserMessage(build),
    { apiKey, fetchImpl, maxTokens: 4096 }
  );

  if (!raw.includes('<!-- SPLIT -->')) {
    throw new Error('generateLegalDocs: Claude response missing <!-- SPLIT --> marker');
  }

  const [privacyPolicy, termsOfService] = raw.split('<!-- SPLIT -->');
  return {
    privacyPolicy: privacyPolicy.trim(),
    termsOfService: termsOfService.trim(),
  };
}

// ── generateFAQ ───────────────────────────────────────────────────────────────

const FAQ_SYSTEM_PROMPT = `You are an expert FAQ generator for business websites.

Generate 100 frequently asked questions organized into 8-12 categories relevant to the business.

Format each FAQ item as HTML using these exact classes:
- faq-item: wrapper div for each Q&A pair
- faq-question: div containing the question
- faq-answer: div containing the answer

Example format:
<div class="faq-item">
  <div class="faq-question">What services do you offer?</div>
  <div class="faq-answer">We offer a wide range of services including...</div>
</div>

Group items under category headings using <h2> tags.
Output only the HTML — no preamble, no markdown, no explanation.`;

function buildFAQUserMessage(build) {
  const location = [build.city, build.state].filter(Boolean).join(', ') || 'Not specified';
  return [
    'I have all the information needed. Skip the discovery phase and generate 100 FAQ items now.',
    '',
    `Company Name: ${build.business_name}`,
    `Industry / Niche: ${build.industry_text || 'Not specified'}`,
    `Business Description: ${build.business_description || 'Not specified'}`,
    `Location / Service Area: ${location}`,
    `Target Audience: ${build.target_audience || 'Not specified'}`,
    `Contact Email: ${build.business_email || 'Not specified'}`,
    `Contact Phone: ${build.business_phone || 'Not specified'}`,
    '',
    'Generate the full 100-item FAQ HTML now.',
  ].join('\n');
}

export async function generateFAQ(build, opts = {}) {
  const { apiKey, fetchImpl } = opts;
  return callClaude(
    'claude-sonnet-4-6',
    FAQ_SYSTEM_PROMPT,
    buildFAQUserMessage(build),
    { apiKey, fetchImpl, maxTokens: 16384 }
  );
}

// ── generateSiteCSS ───────────────────────────────────────────────────────────

const CSS_SYSTEM_PROMPT = `You are an expert web designer specializing in premium WordPress websites built with Elementor.

Generate production-ready CSS that enhances and customizes the existing site styles.

Rules:
- Output raw CSS only — no markdown, no code fences, no explanations
- Use CSS custom properties (variables) for brand colors
- Keep existing styles intact; layer enhancements on top
- Ensure the design feels premium, modern, and aligned with the brand
- Target Elementor class patterns where appropriate`;

function buildCSSUserMessage(build, existingCSS) {
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

  return [
    'Generate premium custom CSS for this WordPress/Elementor website.',
    '',
    `Business Name: ${build.business_name}`,
    `Industry: ${build.industry_text || 'Not specified'}`,
    `Business Description: ${build.business_description || 'Not specified'}`,
    `Brand Colors: ${colors}`,
    '',
    '=== Site Structure (10Web Prompt) ===',
    build.tenweb_prompt || 'Not provided',
    '',
    '=== Existing Site CSS ===',
    existingCSS || '/* No existing CSS */',
    '',
    'Output only raw CSS. No markdown. No explanation.',
  ].join('\n');
}

export async function generateSiteCSS(build, existingCSS, opts = {}) {
  const { apiKey, fetchImpl } = opts;
  const raw = await callClaude(
    'claude-opus-4-6',
    CSS_SYSTEM_PROMPT,
    buildCSSUserMessage(build, existingCSS),
    { apiKey, fetchImpl, maxTokens: 16384 }
  );
  return stripCodeFences(raw);
}

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
  return text
    .replace(/^```css\s*/i, '')
    .replace(/^```\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();
}

/**
 * Wraps HTML content in a styled container that matches 10web's centered layout.
 * No h1 title — WordPress/theme already displays the page title.
 */
function wrapInStyledContainer(htmlContent) {
  return `<style>
/* Center the page title that the theme renders */
.entry-header, .page-header, .elementor-heading-title,
h1.entry-title, h1.page-title,
.elementor-widget-theme-post-title .elementor-heading-title {
  text-align: center !important;
  max-width: 800px !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
/* Content styling */
.vo360-content { max-width: 800px; margin: 0 auto; padding: 20px 30px; font-size: 16px; line-height: 1.7; color: #333; }
.vo360-content h2 { font-size: 1.4em; font-weight: 600; margin: 2em 0 0.8em; color: #111; }
.vo360-content h3 { font-size: 1.15em; font-weight: 600; margin: 1.5em 0 0.5em; color: #222; }
.vo360-content p { margin: 0 0 1em; }
.vo360-content ul, .vo360-content ol { margin: 0 0 1em; padding-left: 1.5em; }
.vo360-content li { margin-bottom: 0.5em; }
.vo360-content strong { color: #111; }
.vo360-content hr { border: none; border-top: 1px solid #e5e5e5; margin: 2em 0; }
.vo360-content .faq-item { margin-bottom: 16px; padding: 18px 0; border-bottom: 1px solid #eee; }
.vo360-content .faq-question { font-weight: 600; font-size: 1.05em; margin-bottom: 8px; color: #111; }
.vo360-content .faq-answer { color: #555; line-height: 1.7; }
</style>
<div class="vo360-content">
${htmlContent}
</div>`;
}

function wrapFAQWithSearch(htmlContent) {
  return `<style>
.entry-header, .page-header, .elementor-heading-title,
h1.entry-title, h1.page-title,
.elementor-widget-theme-post-title .elementor-heading-title {
  text-align: center !important;
  max-width: 800px !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
.vo360-content { max-width: 800px; margin: 0 auto; padding: 20px 30px; font-size: 16px; line-height: 1.7; color: #333; }
.vo360-content h2 { font-size: 1.4em; font-weight: 600; margin: 2em 0 0.8em; color: #111; }
.vo360-content .faq-item { margin-bottom: 16px; padding: 18px 0; border-bottom: 1px solid #eee; }
.vo360-content .faq-question { font-weight: 600; font-size: 1.05em; margin-bottom: 8px; color: #111; cursor: pointer; }
.vo360-content .faq-answer { color: #555; line-height: 1.7; }
.vo360-content .faq-item.hidden { display: none; }
.vo360-content .faq-category.hidden { display: none; }
#faq-search {
  width: 100%;
  max-width: 800px;
  margin: 0 auto 30px;
  display: block;
  padding: 14px 20px;
  font-size: 16px;
  border: 2px solid #e5e5e5;
  border-radius: 10px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
#faq-search:focus { border-color: #333; }
#faq-search::placeholder { color: #aaa; }
#faq-count { text-align: center; color: #999; font-size: 14px; margin-bottom: 20px; }
</style>
<div style="max-width: 800px; margin: 0 auto; padding: 20px 30px;">
<input type="text" id="faq-search" placeholder="Search FAQs..." />
<div id="faq-count"></div>
</div>
<div class="vo360-content" id="faq-container">
${htmlContent}
</div>
<script>
(function() {
  var input = document.getElementById('faq-search');
  var container = document.getElementById('faq-container');
  var countEl = document.getElementById('faq-count');
  var items = container.querySelectorAll('.faq-item');
  var categories = container.querySelectorAll('h2');
  var total = items.length;
  countEl.textContent = total + ' questions';

  input.addEventListener('input', function() {
    var q = this.value.toLowerCase().trim();
    var visible = 0;
    items.forEach(function(item) {
      var text = item.textContent.toLowerCase();
      var match = !q || text.indexOf(q) !== -1;
      item.classList.toggle('hidden', !match);
      if (match) visible++;
    });
    // Hide category headings if all their items are hidden
    categories.forEach(function(h2) {
      var next = h2.nextElementSibling;
      var hasVisible = false;
      while (next && next.tagName !== 'H2') {
        if (next.classList.contains('faq-item') && !next.classList.contains('hidden')) {
          hasVisible = true;
        }
        next = next.nextElementSibling;
      }
      h2.classList.toggle('hidden', !hasVisible);
    });
    countEl.textContent = q ? visible + ' of ' + total + ' questions' : total + ' questions';
  });
})();
</script>`;
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

Format rules:
- Output clean, well-structured HTML body content only (no full HTML page, no <html>/<head>/<body> tags)
- Use semantic tags: <h2> for section headings, <h3> for subsections, <p> for paragraphs, <ul>/<li> for lists, <strong> for emphasis
- Do NOT include an <h1> title — we add that separately
- Make sections clearly separated with proper heading hierarchy
- Each section should be substantive and thorough — not just one sentence per topic
- Write professionally but in plain language a customer can understand

Output the Privacy Policy first, then the exact separator line below, then the Terms of Service:

<!-- SPLIT -->

Do not include any preamble, commentary, or text outside the two documents.`;

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
    { apiKey, fetchImpl, maxTokens: 8192 }
  );

  if (!raw.includes('<!-- SPLIT -->')) {
    throw new Error('generateLegalDocs: Claude response missing <!-- SPLIT --> marker');
  }

  const [privacyRaw, termsRaw] = raw.split('<!-- SPLIT -->');
  return {
    privacyPolicy: wrapInStyledContainer(privacyRaw.trim()),
    termsOfService: wrapInStyledContainer(termsRaw.trim()),
  };
}

// ── generateFAQ ───────────────────────────────────────────────────────────────

const FAQ_SYSTEM_PROMPT = `You are an expert FAQ generator for business websites.

Generate 100 frequently asked questions organized into 8-12 categories relevant to the business.

Format rules:
- Use <h2> tags for category headings
- Each Q&A pair uses this exact HTML structure:
  <div class="faq-item" style="margin-bottom: 20px; padding: 15px; border-bottom: 1px solid #eee;">
    <div class="faq-question" style="font-weight: 600; font-size: 1.05em; margin-bottom: 8px; color: #222;">Q: [Question text]</div>
    <div class="faq-answer" style="color: #555; line-height: 1.6;">A: [Answer — 2-4 sentences, specific to the business, not generic]</div>
  </div>
- Do NOT include an <h1> title — we add that separately
- Make every answer specific to this company — no generic filler
- Distribute roughly 8-12 questions per category
- Output only the HTML — no preamble, no markdown, no explanation.`;

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
  const raw = await callClaude(
    'claude-sonnet-4-6',
    FAQ_SYSTEM_PROMPT,
    buildFAQUserMessage(build),
    { apiKey, fetchImpl, maxTokens: 16384 }
  );
  return wrapFAQWithSearch(raw);
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
    'claude-sonnet-4-6',
    CSS_SYSTEM_PROMPT,
    buildCSSUserMessage(build, existingCSS),
    { apiKey, fetchImpl, maxTokens: 16384 }
  );
  return stripCodeFences(raw);
}

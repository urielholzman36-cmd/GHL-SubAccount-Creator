# M2b: WordPress Post-Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the user enters WordPress credentials, automatically install plugins, upload logo, generate & publish legal/FAQ pages, and apply a full-site CSS overhaul.

**Architecture:** Extend the existing 3-step pipeline to 11 steps across 3 phases. Two new server modules (`wordpress.js` for WP REST API, `content-generator.js` for Claude content) keep responsibilities isolated. The build runner's existing retry/pause/emit pattern handles orchestration.

**Tech Stack:** Node.js, WP REST API (Basic Auth), Claude API (Sonnet 4.6 + Opus 4.6), better-sqlite3, Vitest

---

### Task 1: WordPress Client — Core Module

**Files:**
- Create: `server/services/wordpress.js`
- Create: `tests/server/wordpress.test.js`

- [ ] **Step 1: Write failing tests for WordPressClient**

```js
// tests/server/wordpress.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WordPressClient } from '../server/services/wordpress.js';

describe('WordPressClient', () => {
  let client;
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new WordPressClient({
      url: 'https://test.10web.site',
      username: 'admin',
      appPassword: 'xxxx xxxx xxxx',
      fetchImpl: mockFetch,
    });
  });

  it('validateConnection succeeds on 200', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ title: 'Test' }) });
    await expect(client.validateConnection()).resolves.not.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://test.10web.site/wp-json/wp/v2/settings');
    expect(opts.headers['Authorization']).toMatch(/^Basic /);
  });

  it('validateConnection throws on 401', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });
    await expect(client.validateConnection()).rejects.toThrow(/WP API 401/);
  });

  it('installPlugin sends correct payload', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ plugin: 'test/test', status: 'active' }) });
    const result = await client.installPlugin('test-plugin');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://test.10web.site/wp-json/wp/v2/plugins');
    expect(JSON.parse(opts.body)).toEqual({ slug: 'test-plugin', status: 'active' });
    expect(result.status).toBe('active');
  });

  it('uploadMedia sends file with correct headers', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 42, source_url: 'https://test.10web.site/logo.png' }) });
    const fakeBuffer = Buffer.from('fake-image');
    const result = await client.uploadMedia(fakeBuffer, 'logo.png', 'image/png');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://test.10web.site/wp-json/wp/v2/media');
    expect(opts.headers['Content-Disposition']).toContain('logo.png');
    expect(result).toEqual({ id: 42, source_url: 'https://test.10web.site/logo.png' });
  });

  it('setSiteLogo sends both site_logo and site_icon', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await client.setSiteLogo(42);
    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.site_logo).toBe(42);
    expect(body.site_icon).toBe(42);
  });

  it('deleteTemplate swallows errors', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, text: async () => 'Not found' });
    await expect(client.deleteTemplate('header-home')).resolves.not.toThrow();
  });

  it('createPage returns id and link', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 99, link: 'https://test.10web.site/privacy-policy/' }) });
    const result = await client.createPage('Privacy Policy', '<h1>Privacy</h1>');
    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.title).toBe('Privacy Policy');
    expect(body.content).toBe('<h1>Privacy</h1>');
    expect(body.status).toBe('publish');
    expect(result).toEqual({ id: 99, link: 'https://test.10web.site/privacy-policy/' });
  });

  it('getCustomCSS returns empty string on 404', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ([]) });
    const css = await client.getCustomCSS();
    expect(css).toBe('');
  });

  it('getCustomCSS returns existing CSS', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ([{ id: 1, content: { raw: 'body { color: red; }' } }]) });
    const css = await client.getCustomCSS();
    expect(css).toBe('body { color: red; }');
  });

  it('setCustomCSS appends with marker', async () => {
    // First call: getCustomCSS
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ([{ id: 1, content: { raw: 'body { color: red; }' } }]) });
    // Second call: PUT custom_css
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    await client.setCustomCSS('.new { color: blue; }');
    const [, opts] = mockFetch.mock.calls[1];
    const body = JSON.parse(opts.body);
    expect(body.css).toContain('body { color: red; }');
    expect(body.css).toContain('/* === VO360 Onboarding — Auto-generated === */');
    expect(body.css).toContain('.new { color: blue; }');
  });

  it('setCustomCSS creates new when none exists', async () => {
    // First call: getCustomCSS returns empty
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ([]) });
    // Second call: POST custom_css
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) });

    await client.setCustomCSS('.new { color: blue; }');
    const [url, opts] = mockFetch.mock.calls[1];
    expect(url).toBe('https://test.10web.site/wp-json/wp/v2/custom_css');
    expect(opts.method).toBe('POST');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/wordpress.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement WordPressClient**

```js
// server/services/wordpress.js

const CSS_MARKER = '/* === VO360 Onboarding — Auto-generated === */';

export class WordPressClient {
  constructor({ url, username, appPassword, fetchImpl }) {
    this.baseUrl = url.replace(/\/+$/, '');
    this.authHeader = 'Basic ' + Buffer.from(`${username}:${appPassword}`).toString('base64');
    this.fetchFn = fetchImpl || fetch;
  }

  async _request(method, path, body = null, extraHeaders = {}) {
    const url = `${this.baseUrl}/wp-json${path}`;
    const headers = {
      'Authorization': this.authHeader,
      ...extraHeaders,
    };
    if (body && typeof body === 'object' && !(body instanceof Buffer)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const res = await this.fetchFn(url, { method, headers, body });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WP API ${res.status}: ${text}`);
    }
    return res.json();
  }

  async validateConnection() {
    await this._request('GET', '/wp/v2/settings');
  }

  async installPlugin(slug) {
    return await this._request('POST', '/wp/v2/plugins', { slug, status: 'active' });
  }

  async uploadMedia(fileBuffer, filename, mimeType) {
    const url = `${this.baseUrl}/wp-json/wp/v2/media`;
    const headers = {
      'Authorization': this.authHeader,
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    };
    const res = await this.fetchFn(url, { method: 'POST', headers, body: fileBuffer });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WP API ${res.status}: ${text}`);
    }
    const data = await res.json();
    return { id: data.id, source_url: data.source_url };
  }

  async setSiteLogo(mediaId) {
    await this._request('POST', '/wp/v2/settings', { site_logo: mediaId, site_icon: mediaId });
  }

  async deleteTemplate(slug) {
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/templates/${slug}?force=true`;
      await this.fetchFn(url, {
        method: 'DELETE',
        headers: { 'Authorization': this.authHeader },
      });
    } catch (_) {
      // Best-effort — swallow all errors
    }
  }

  async createPage(title, htmlContent) {
    const data = await this._request('POST', '/wp/v2/pages', {
      title,
      content: htmlContent,
      status: 'publish',
    });
    return { id: data.id, link: data.link };
  }

  async getCustomCSS() {
    const url = `${this.baseUrl}/wp-json/wp/v2/custom_css`;
    const res = await this.fetchFn(url, {
      method: 'GET',
      headers: { 'Authorization': this.authHeader },
    });
    if (!res.ok) return '';
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) return '';
    return items[0]?.content?.raw || '';
  }

  async setCustomCSS(newCSS) {
    const existing = await this.getCustomCSS();
    // Strip any previous auto-generated block
    const markerIdx = existing.indexOf(CSS_MARKER);
    const base = markerIdx >= 0 ? existing.substring(0, markerIdx).trimEnd() : existing;
    const combined = [base, '', CSS_MARKER, newCSS].filter((s) => s !== undefined).join('\n').trim();

    // Check if a custom_css post already exists
    const checkUrl = `${this.baseUrl}/wp-json/wp/v2/custom_css`;
    const checkRes = await this.fetchFn(checkUrl, {
      method: 'GET',
      headers: { 'Authorization': this.authHeader },
    });
    const items = checkRes.ok ? await checkRes.json() : [];
    const existingId = Array.isArray(items) && items.length > 0 ? items[0].id : null;

    if (existingId) {
      const url = `${this.baseUrl}/wp-json/wp/v2/custom_css/${existingId}`;
      const res = await this.fetchFn(url, {
        method: 'PUT',
        headers: { 'Authorization': this.authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ css: combined }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`WP API ${res.status}: ${text}`);
      }
    } else {
      const url = `${this.baseUrl}/wp-json/wp/v2/custom_css`;
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Authorization': this.authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ css: combined }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`WP API ${res.status}: ${text}`);
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/wordpress.test.js`
Expected: all 11 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/ghl-sub-account-builder
git add server/services/wordpress.js tests/server/wordpress.test.js
git commit -m "feat(m2b): add WordPressClient for WP REST API operations"
```

---

### Task 2: Content Generator — Legal Docs + FAQ + CSS

**Files:**
- Create: `server/services/content-generator.js`
- Create: `tests/server/content-generator.test.js`

- [ ] **Step 1: Write failing tests for content generator**

```js
// tests/server/content-generator.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateLegalDocs, generateFAQ, generateSiteCSS } from '../server/services/content-generator.js';

const mockBuild = {
  business_name: 'Spark & Sons Electric',
  business_description: 'Family-owned electrical company serving Miami-Dade since 2012.',
  business_email: 'info@sparkandsons.com',
  business_phone: '(305) 555-1234',
  industry_text: 'Residential & commercial electrical contracting',
  target_audience: 'Homeowners and property managers in Miami-Dade County',
  city: 'Miami',
  state: 'FL',
  brand_colors: '["#ff6600","#003366","#ffffff"]',
  tenweb_prompt: 'Build a professional website for Spark & Sons Electric...',
};

describe('generateLegalDocs', () => {
  it('returns privacyPolicy and termsOfService from Claude response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{
          type: 'text',
          text: '<h1>Privacy Policy</h1><p>We collect data.</p>\n<!-- SPLIT -->\n<h1>Terms of Service</h1><p>By using our service.</p>',
        }],
      }),
    });

    const result = await generateLegalDocs(mockBuild, { apiKey: 'test-key', fetchImpl: mockFetch });
    expect(result.privacyPolicy).toContain('Privacy Policy');
    expect(result.termsOfService).toContain('Terms of Service');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.system).toContain('Privacy');
    expect(body.messages[0].content).toContain('Spark & Sons Electric');
  });

  it('throws when no SPLIT marker in response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: '<h1>Just one doc</h1>' }],
      }),
    });

    await expect(generateLegalDocs(mockBuild, { apiKey: 'test-key', fetchImpl: mockFetch }))
      .rejects.toThrow(/SPLIT/);
  });
});

describe('generateFAQ', () => {
  it('returns HTML string from Claude response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: '<h2>General</h2><p><strong>Q:</strong> What do you do?</p>' }],
      }),
    });

    const result = await generateFAQ(mockBuild, { apiKey: 'test-key', fetchImpl: mockFetch });
    expect(typeof result).toBe('string');
    expect(result).toContain('General');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.messages[0].content).toContain('Spark & Sons Electric');
  });
});

describe('generateSiteCSS', () => {
  it('returns CSS string using opus model', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'body { font-family: "Inter", sans-serif; color: #003366; }' }],
      }),
    });

    const result = await generateSiteCSS(mockBuild, 'existing { }', { apiKey: 'test-key', fetchImpl: mockFetch });
    expect(typeof result).toBe('string');
    expect(result).toContain('font-family');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-opus-4-6');
    expect(body.messages[0].content).toContain('#ff6600');
    expect(body.messages[0].content).toContain('Build a professional website');
    expect(body.messages[0].content).toContain('existing { }');
  });

  it('strips markdown code fences from response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: '```css\nbody { color: red; }\n```' }],
      }),
    });

    const result = await generateSiteCSS(mockBuild, '', { apiKey: 'test-key', fetchImpl: mockFetch });
    expect(result).not.toContain('```');
    expect(result).toContain('body { color: red; }');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/content-generator.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement content-generator.js**

```js
// server/services/content-generator.js

const LEGAL_SYSTEM_PROMPT = `You are an expert legal compliance specialist with deep expertise in drafting Privacy Policies and Terms of Service, with a focus on SMS marketing compliance (TCPA, CTIA guidelines) and data privacy regulations (GDPR, CCPA).

Your goal is to generate two documents based on the business details provided.

Document 1 — Privacy Policy covering:
- What information is collected
- How data is used
- SMS opt-in details and consent language (covering all message types: promotions, reminders, updates, alerts, and transactional messages)
- Cookie & tracking disclosure
- Data security practices
- User rights (unsubscribe, update/delete info)
- A clear, explicit statement that SMS opt-in data is NEVER shared with third parties

Document 2 — Terms of Service covering:
- Description of the SMS program covering all use cases (promotions, reminders, updates, alerts, transactional messages)
- Opt-out instructions ("Text STOP to unsubscribe")
- Support contact information
- Message & data rates disclosure
- Carrier liability disclaimer
- Age restriction (18+ only)
- Link/reference to the Privacy Policy

Rules:
- Output clean semantic HTML only (h1, h2, h3, p, ul, li, strong, em). No markdown.
- Separate the two documents with exactly this marker on its own line: <!-- SPLIT -->
- Adapt all content to the specific business based on the details provided.
- Keep language clear, user-friendly, and legally sound.`;

const FAQ_SYSTEM_PROMPT = `You are an expert FAQ Generator assistant. Generate exactly 100 professional FAQ questions and answers organized by category.

Pick the most relevant 8-12 categories from: General / About Us, Product / Service Overview, Features & Capabilities, Pricing & Plans, Getting Started / Onboarding, Account & Billing, Integrations & Compatibility, Security & Privacy, Customer Support, Cancellation & Refunds, Troubleshooting, Comparisons & Alternatives.

Format as clean HTML:
<h2>[Category Name]</h2>
<div class="faq-item">
<p class="faq-question"><strong>Q: [Question]</strong></p>
<p class="faq-answer">A: [Answer — 2 to 4 sentences, specific and useful]</p>
</div>

Rules:
- Make every answer specific to the company — never write generic filler
- Write answers in a friendly, professional tone
- Questions should reflect what real customers actually ask
- Distribute questions evenly across categories (roughly 8-12 per category)
- Output clean HTML only. No markdown.`;

const CSS_SYSTEM_PROMPT = `You are an expert web designer specializing in premium WordPress CSS customization.

Your task is to generate a comprehensive CSS overhaul that transforms a WordPress site into a premium, professionally designed website.

Rules:
- Output RAW CSS ONLY. No markdown, no code fences, no explanations.
- The CSS must cover: typography (font families, sizes, weights, line heights), color scheme (backgrounds, text, accents), buttons (hover states, transitions, shadows), header and footer styling, cards and content sections, form elements, spacing and padding, hover/focus states, and specific styling for legal pages and FAQ pages.
- Use the brand colors provided as the primary palette.
- Make the design feel premium and cohesive — not generic template CSS.
- Override existing styles with sufficient specificity.
- Include responsive considerations.
- Style .faq-item, .faq-question, .faq-answer classes for FAQ pages.
- Style legal pages with clean readable typography.`;

async function callClaude(model, systemPrompt, userMessage, { apiKey, fetchImpl, maxTokens = 8192 }) {
  const fetchFn = fetchImpl || fetch;
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
    try { const e = await res.json(); detail = e?.error?.message || JSON.stringify(e); } catch (_) {}
    throw new Error(`Claude API error: ${res.status} ${detail}`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((c) => c.type === 'text');
  if (!textBlock || !textBlock.text) throw new Error('Claude API returned empty content');
  return textBlock.text;
}

function stripCodeFences(text) {
  return text.replace(/^```(?:css)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();
}

export async function generateLegalDocs(build, opts = {}) {
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  const userMessage = [
    'Here are the business details. Generate both documents now.',
    '',
    `Company name: ${build.business_name}`,
    `What the company does: ${build.business_description || 'Not specified'}`,
    `Support phone: ${build.business_phone || 'Not provided'}`,
    `Support email: ${build.business_email || 'Not provided'}`,
  ].join('\n');

  const text = await callClaude('claude-sonnet-4-6', LEGAL_SYSTEM_PROMPT, userMessage, { apiKey, fetchImpl: opts.fetchImpl });

  if (!text.includes('<!-- SPLIT -->')) {
    throw new Error('Legal docs response missing <!-- SPLIT --> marker between documents');
  }

  const [privacyPolicy, termsOfService] = text.split('<!-- SPLIT -->').map((s) => s.trim());
  return { privacyPolicy, termsOfService };
}

export async function generateFAQ(build, opts = {}) {
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  const location = [build.city, build.state].filter(Boolean).join(', ') || 'Not specified';
  const userMessage = [
    'Here are the business details. Skip the discovery phase and generate all 100 FAQs now.',
    '',
    `Company name: ${build.business_name}`,
    `What the company does: ${build.business_description || 'Not specified'}`,
    `Industry: ${build.industry_text || 'Not specified'}`,
    `Location: ${location}`,
    `Target audience: ${build.target_audience || 'Not specified'}`,
    `Support email: ${build.business_email || 'Not provided'}`,
    `Support phone: ${build.business_phone || 'Not provided'}`,
  ].join('\n');

  return await callClaude('claude-sonnet-4-6', FAQ_SYSTEM_PROMPT, userMessage, { apiKey, fetchImpl: opts.fetchImpl, maxTokens: 16384 });
}

export async function generateSiteCSS(build, existingCSS, opts = {}) {
  const apiKey = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  const colors = (() => {
    try {
      const arr = JSON.parse(build.brand_colors || '[]');
      return Array.isArray(arr) && arr.length > 0 ? arr.join(', ') : 'No brand colors provided';
    } catch { return 'No brand colors provided'; }
  })();

  const userMessage = [
    'Generate a premium CSS overhaul for this WordPress site.',
    '',
    `Business: ${build.business_name}`,
    `Industry: ${build.industry_text || 'Not specified'}`,
    `Description: ${build.business_description || 'Not specified'}`,
    `Brand colors: ${colors}`,
    '',
    '--- 10Web Website Prompt (describes the site structure and design direction) ---',
    build.tenweb_prompt || 'Not available',
    '',
    '--- Existing Site CSS ---',
    existingCSS || '(none)',
    '',
    'Generate the complete CSS now. Raw CSS only, no markdown.',
  ].join('\n');

  const text = await callClaude('claude-opus-4-6', CSS_SYSTEM_PROMPT, userMessage, { apiKey, fetchImpl: opts.fetchImpl, maxTokens: 16384 });
  return stripCodeFences(text);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/content-generator.test.js`
Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/ghl-sub-account-builder
git add server/services/content-generator.js tests/server/content-generator.test.js
git commit -m "feat(m2b): add content generator for legal docs, FAQ, and site CSS"
```

---

### Task 3: DB Migration + Phases Config Update

**Files:**
- Modify: `server/db/index.js`
- Modify: `server/services/phases.config.js`
- Modify: `tests/server/phases.config.test.js`
- Modify: `tests/server/db.test.js`

- [ ] **Step 1: Update phases.config.js with Phase 3**

```js
// server/services/phases.config.js
export const PHASES = [
  {
    id: 1,
    name: 'GHL Sub-Account Setup',
    steps: [
      { number: 1, name: 'Create Sub-Account' },
    ],
  },
  {
    id: 2,
    name: 'Website Build',
    steps: [
      { number: 2, name: 'Generate 10web Prompt' },
      { number: 3, name: 'Website Creation (Manual)', pausesForManualInput: true },
    ],
  },
  {
    id: 3,
    name: 'WordPress Setup',
    steps: [
      { number: 4, name: 'Validate WordPress' },
      { number: 5, name: 'Install Plugins' },
      { number: 6, name: 'Upload Logo' },
      { number: 7, name: 'Fix Header', optional: true },
      { number: 8, name: 'Generate Legal Pages' },
      { number: 9, name: 'Generate FAQ' },
      { number: 10, name: 'Publish Pages' },
      { number: 11, name: 'Apply Site CSS' },
    ],
  },
];

export function getAllSteps() {
  return PHASES.flatMap((p) => p.steps);
}

export function getPhaseForStep(stepNumber) {
  for (const p of PHASES) {
    if (p.steps.some((s) => s.number === stepNumber)) return p.id;
  }
  return null;
}

export function getStepName(stepNumber) {
  const step = getAllSteps().find((s) => s.number === stepNumber);
  return step ? step.name : null;
}

export function isStepOptional(stepNumber) {
  const step = getAllSteps().find((s) => s.number === stepNumber);
  return step ? step.optional === true : false;
}

export function getTotalStepCount() {
  return getAllSteps().length;
}
```

- [ ] **Step 2: Add M2b DB migration columns**

Add to `server/db/index.js` after the existing M2a migration block:

```js
  // M2b additive migrations
  const buildCols3 = db.prepare("PRAGMA table_info(builds)").all().map((c) => c.name);
  const m2bCols = [
    ['privacy_policy_url', 'TEXT'],
    ['terms_url', 'TEXT'],
    ['faq_url', 'TEXT'],
  ];
  for (const [name, type] of m2bCols) {
    if (!buildCols3.includes(name)) {
      db.exec(`ALTER TABLE builds ADD COLUMN ${name} ${type}`);
    }
  }
```

- [ ] **Step 3: Update phases.config tests**

```js
// tests/server/phases.config.test.js
import { describe, it, expect } from 'vitest';
import { PHASES, getAllSteps, getPhaseForStep, getStepName, getTotalStepCount } from '../server/services/phases.config.js';

describe('phases config', () => {
  it('has 3 phases', () => {
    expect(PHASES).toHaveLength(3);
  });

  it('getAllSteps returns all steps in order', () => {
    expect(getAllSteps().map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('getPhaseForStep maps correctly', () => {
    expect(getPhaseForStep(1)).toBe(1);
    expect(getPhaseForStep(2)).toBe(2);
    expect(getPhaseForStep(3)).toBe(2);
    expect(getPhaseForStep(4)).toBe(3);
    expect(getPhaseForStep(7)).toBe(3);
    expect(getPhaseForStep(11)).toBe(3);
    expect(getPhaseForStep(99)).toBeNull();
  });

  it('getStepName returns each step name', () => {
    expect(getStepName(1)).toBe('Create Sub-Account');
    expect(getStepName(2)).toBe('Generate 10web Prompt');
    expect(getStepName(3)).toBe('Website Creation (Manual)');
    expect(getStepName(4)).toBe('Validate WordPress');
    expect(getStepName(5)).toBe('Install Plugins');
    expect(getStepName(6)).toBe('Upload Logo');
    expect(getStepName(7)).toBe('Fix Header');
    expect(getStepName(8)).toBe('Generate Legal Pages');
    expect(getStepName(9)).toBe('Generate FAQ');
    expect(getStepName(10)).toBe('Publish Pages');
    expect(getStepName(11)).toBe('Apply Site CSS');
  });

  it('getTotalStepCount returns 11', () => {
    expect(getTotalStepCount()).toBe(11);
  });

  it('step 7 is optional', () => {
    const step7 = getAllSteps().find((s) => s.number === 7);
    expect(step7.optional).toBe(true);
  });

  it('step 3 has pausesForManualInput', () => {
    const step3 = getAllSteps().find((s) => s.number === 3);
    expect(step3.pausesForManualInput).toBe(true);
  });
});
```

- [ ] **Step 4: Update db.test.js for new step count**

Update the test that checks step creation to expect 11 steps instead of 3. Update phase assignments: steps 1 → phase 1, steps 2-3 → phase 2, steps 4-11 → phase 3.

- [ ] **Step 5: Run all tests**

Run: `cd ~/ghl-sub-account-builder && npx vitest run`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
cd ~/ghl-sub-account-builder
git add server/db/index.js server/services/phases.config.js tests/server/phases.config.test.js tests/server/db.test.js
git commit -m "feat(m2b): add Phase 3 config and DB migration for page URLs"
```

---

### Task 4: Build Runner — Steps 4-11

**Files:**
- Modify: `server/services/build-runner.js`
- Modify: `tests/server/build-runner.test.js`

- [ ] **Step 1: Write failing tests for steps 4-11**

Add these tests to `tests/server/build-runner.test.js`:

```js
// Add to existing describe block, after existing tests

it('step 4 validates WP connection', async () => {
  const mockWPFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ title: 'Test' }) });
  const runner = new BuildRunner(db, mockGhl(), {
    generatePromptImpl: vi.fn().mockResolvedValue('test prompt'),
    wpFetchImpl: mockWPFetch,
  });

  // Seed a build that is paused at step 3 with WP credentials
  seedBuild(db, 'wp-test');
  await runner.run('wp-test', emit);
  // Resume with WP credentials to trigger steps 4+
  await runner.resume('wp-test', {
    wp_url: 'https://test.10web.site',
    wp_username: 'admin',
    wp_password: 'test-pass',
  }, emit);

  // Step 4 should have called WP settings endpoint
  const settingsCalls = mockWPFetch.mock.calls.filter(([url]) => url.includes('/wp/v2/settings'));
  expect(settingsCalls.length).toBeGreaterThanOrEqual(1);
});

it('step 5 installs 3 plugins', async () => {
  const mockWPFetch = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ plugin: 'test', status: 'active' }) });
  // Also mock settings for step 4
  mockWPFetch.mockImplementation(async (url) => {
    if (url.includes('/wp/v2/settings')) return { ok: true, status: 200, json: async () => ({}) };
    if (url.includes('/wp/v2/plugins')) return { ok: true, status: 201, json: async () => ({ status: 'active' }) };
    if (url.includes('/wp/v2/media')) return { ok: true, status: 201, json: async () => ({ id: 1, source_url: 'x' }) };
    if (url.includes('/wp/v2/templates')) return { ok: true, status: 200, json: async () => ({}) };
    if (url.includes('/wp/v2/pages')) return { ok: true, status: 201, json: async () => ({ id: 1, link: 'x' }) };
    if (url.includes('/wp/v2/custom_css')) return { ok: true, status: 200, json: async () => ([]) };
    return { ok: true, status: 200, json: async () => ({}) };
  });

  // Build runner with all mocks...
  // Verify /wp/v2/plugins was called 3 times (one per plugin)
  const pluginCalls = mockWPFetch.mock.calls.filter(([url]) => url.includes('/wp/v2/plugins'));
  expect(pluginCalls).toHaveLength(3);
});

it('step 7 fix header is optional — warning on failure doesnt stop build', async () => {
  // Mock that template delete returns 404
  // Verify build continues past step 7 with warning status
  const step7 = queries.getBuildSteps(db, buildId).find((s) => s.step_number === 7);
  expect(step7.status).toBe('warning');
});

it('step 10 publishes 3 pages and stores URLs', async () => {
  // Verify createPage called 3 times
  // Verify privacy_policy_url, terms_url, faq_url stored in builds table
  const build = queries.getBuildById(db, buildId);
  expect(build.privacy_policy_url).toBeTruthy();
  expect(build.terms_url).toBeTruthy();
  expect(build.faq_url).toBeTruthy();
});
```

Note: The full test implementations need to be written with proper setup (seed build, run to pause, resume with WP creds, mock all external calls). The patterns above show the assertions — the actual test should follow the existing `pause-resume.test.js` pattern of seeding, running, and asserting.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/ghl-sub-account-builder && npx vitest run tests/server/build-runner.test.js`
Expected: FAIL — new step cases not implemented

- [ ] **Step 3: Implement steps 4-11 in build-runner.js**

Add imports at the top of `server/services/build-runner.js`:

```js
import { WordPressClient } from './wordpress.js';
import { generateLegalDocs, generateFAQ, generateSiteCSS } from './content-generator.js';
import { decrypt } from './crypto.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PLUGINS = ['allaccessible', 'leadconnector', 'wp-call-button'];
```

Update `_runStepLogic` switch:

```js
  async _runStepLogic(build, stepNumber, state, ctx) {
    const freshBuild = queries.getBuildById(this.db, build.id) || build;
    switch (stepNumber) {
      case 1: return await this._step1CreateLocation(freshBuild);
      case 2: return await this._step2GeneratePrompt(freshBuild, state);
      case 3: return await this._step3WebsiteCreationManual(freshBuild, state, ctx);
      case 4: return await this._step4ValidateWP(freshBuild);
      case 5: return await this._step5InstallPlugins(freshBuild, state);
      case 6: return await this._step6UploadLogo(freshBuild, state);
      case 7: return await this._step7FixHeader(freshBuild, state);
      case 8: return await this._step8GenerateLegal(freshBuild);
      case 9: return await this._step9GenerateFAQ(freshBuild);
      case 10: return await this._step10PublishPages(freshBuild, state);
      case 11: return await this._step11ApplySiteCSS(freshBuild, state);
      default: throw new Error(`Unknown step number: ${stepNumber}`);
    }
  }
```

Add new step methods:

```js
  _createWPClient(build) {
    const password = decrypt(build.wp_password_encrypted);
    return new WordPressClient({
      url: build.wp_url,
      username: build.wp_username,
      appPassword: password,
      fetchImpl: this.wpFetchImpl || undefined,
    });
  }

  async _step4ValidateWP(build) {
    const wp = this._createWPClient(build);
    await wp.validateConnection();
    return { wpValidated: true };
  }

  async _step5InstallPlugins(build, state) {
    const wp = this._createWPClient(build);
    const results = [];
    for (const slug of DEFAULT_PLUGINS) {
      try {
        await wp.installPlugin(slug);
        results.push({ slug, status: 'installed' });
      } catch (err) {
        results.push({ slug, status: 'failed', error: err.message });
      }
    }
    return { pluginsInstalled: results };
  }

  async _step6UploadLogo(build, state) {
    if (!build.logo_path) {
      const err = new Error('No logo file available');
      err.skipRetry = true;
      throw err;
    }
    const wp = this._createWPClient(build);
    const logoFullPath = path.resolve(__dirname, '../..', build.logo_path);
    const fileBuffer = fs.readFileSync(logoFullPath);
    const filename = path.basename(build.logo_path);
    const ext = path.extname(filename).toLowerCase();
    const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
    const mimeType = mimeMap[ext] || 'image/png';

    const media = await wp.uploadMedia(fileBuffer, filename, mimeType);
    await wp.setSiteLogo(media.id);
    return { logoMediaId: media.id, logoUrl: media.source_url };
  }

  async _step7FixHeader(build, state) {
    const wp = this._createWPClient(build);
    await wp.deleteTemplate('header-home');
    return { headerFixed: true };
  }

  async _step8GenerateLegal(build) {
    const result = await (this.generateLegalImpl || generateLegalDocs)(build, {
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    return { privacyPolicy: result.privacyPolicy, termsOfService: result.termsOfService };
  }

  async _step9GenerateFAQ(build) {
    const faqHtml = await (this.generateFAQImpl || generateFAQ)(build, {
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    return { faqHtml };
  }

  async _step10PublishPages(build, state) {
    const wp = this._createWPClient(build);

    const ppResult = await wp.createPage('Privacy Policy', state.privacyPolicy);
    const tosResult = await wp.createPage('Terms of Service', state.termsOfService);
    const faqResult = await wp.createPage('FAQ', state.faqHtml);

    this.db.prepare(
      'UPDATE builds SET privacy_policy_url = ?, terms_url = ?, faq_url = ? WHERE id = ?'
    ).run(ppResult.link, tosResult.link, faqResult.link, build.id);

    return {
      privacyPolicyUrl: ppResult.link,
      termsUrl: tosResult.link,
      faqUrl: faqResult.link,
    };
  }

  async _step11ApplySiteCSS(build, state) {
    const wp = this._createWPClient(build);
    const existingCSS = await wp.getCustomCSS();
    const newCSS = await (this.generateCSSImpl || generateSiteCSS)(build, existingCSS, {
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    await wp.setCustomCSS(newCSS);
    return { cssApplied: true };
  }
```

Also update constructor to accept new mock injection points:

```js
  constructor(db, ghl, options = {}) {
    this.db = db;
    this.ghl = ghl;
    this.backoffMs = options.backoffMs || DEFAULT_BACKOFF_MS;
    this.generatePromptImpl =
      options.generatePromptImpl ||
      ((build) => realGeneratePrompt(build, { apiKey: process.env.ANTHROPIC_API_KEY }));
    this.wpFetchImpl = options.wpFetchImpl || null;
    this.generateLegalImpl = options.generateLegalImpl || null;
    this.generateFAQImpl = options.generateFAQImpl || null;
    this.generateCSSImpl = options.generateCSSImpl || null;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/ghl-sub-account-builder && npx vitest run`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
cd ~/ghl-sub-account-builder
git add server/services/build-runner.js tests/server/build-runner.test.js
git commit -m "feat(m2b): implement build runner steps 4-11 for WordPress setup"
```

---

### Task 5: Update Retry Route Step Range

**Files:**
- Modify: `server/routes/builds.js`

- [ ] **Step 1: Update step range validation**

In `server/routes/builds.js`, find the retry route validation:

```js
    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 3) {
      return res.status(400).json({ error: 'step must be a number between 1 and 3' });
    }
```

Change to:

```js
    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 11) {
      return res.status(400).json({ error: 'step must be a number between 1 and 11' });
    }
```

- [ ] **Step 2: Run all tests**

Run: `cd ~/ghl-sub-account-builder && npx vitest run`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
cd ~/ghl-sub-account-builder
git add server/routes/builds.js
git commit -m "fix(m2b): update retry route to support steps 1-11"
```

---

### Task 6: Frontend — Update SSE Hook + Progress Grid

**Files:**
- Modify: `src/hooks/useSSE.js`
- Modify: `src/components/ProgressTracker.jsx`

- [ ] **Step 1: Update DEFAULT_PHASES in useSSE.js**

```js
const DEFAULT_PHASES = [
  {
    id: 1,
    name: 'GHL Sub-Account Setup',
    steps: [
      { step: 1, name: 'Create Sub-Account' },
    ],
  },
  {
    id: 2,
    name: 'Website Build',
    steps: [
      { step: 2, name: 'Generate 10web Prompt' },
      { step: 3, name: 'Website Creation (Manual)' },
    ],
  },
  {
    id: 3,
    name: 'WordPress Setup',
    steps: [
      { step: 4, name: 'Validate WordPress' },
      { step: 5, name: 'Install Plugins' },
      { step: 6, name: 'Upload Logo' },
      { step: 7, name: 'Fix Header' },
      { step: 8, name: 'Generate Legal Pages' },
      { step: 9, name: 'Generate FAQ' },
      { step: 10, name: 'Publish Pages' },
      { step: 11, name: 'Apply Site CSS' },
    ],
  },
];
```

- [ ] **Step 2: Update ProgressTracker grid layout**

In `src/components/ProgressTracker.jsx`, change the step cards grid:

```jsx
{/* From: */}
<div className="grid grid-cols-3 gap-4">

{/* To: */}
<div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
```

- [ ] **Step 3: Verify app loads without errors**

Run: open `http://localhost:5173` in browser, check console for errors.

- [ ] **Step 4: Commit**

```bash
cd ~/ghl-sub-account-builder
git add src/hooks/useSSE.js src/components/ProgressTracker.jsx
git commit -m "feat(m2b): update frontend for 11-step 3-phase pipeline"
```

---

### Task 7: Update Pause-Resume Tests + Full Integration

**Files:**
- Modify: `tests/server/pause-resume.test.js`

- [ ] **Step 1: Update pause-resume tests for new step count**

The resume test needs to mock WP fetch and content generators so that after resume at step 3, steps 4-11 also execute. Update the test to provide `wpFetchImpl`, `generateLegalImpl`, `generateFAQImpl`, `generateCSSImpl` options to the BuildRunner constructor, and verify the build reaches `completed` status.

```js
it('full pipeline completes after resume with WP setup', async () => {
  const db = createTestDb();
  seedBuild(db, 'full-test');

  const mockWPFetch = vi.fn().mockImplementation(async (url) => {
    if (url.includes('/wp/v2/settings')) return { ok: true, status: 200, json: async () => ({}) };
    if (url.includes('/wp/v2/plugins')) return { ok: true, status: 201, json: async () => ({ status: 'active' }) };
    if (url.includes('/wp/v2/media')) return { ok: true, status: 201, json: async () => ({ id: 1, source_url: 'https://test/logo.png' }) };
    if (url.includes('/wp/v2/templates')) return { ok: false, status: 404, text: async () => 'Not found' };
    if (url.includes('/wp/v2/pages')) return { ok: true, status: 201, json: async () => ({ id: 1, link: 'https://test/page' }) };
    if (url.includes('/wp/v2/custom_css')) return { ok: true, status: 200, json: async () => ([]) };
    return { ok: true, status: 200, json: async () => ({}) };
  });

  const runner = new BuildRunner(db, mockGhl(), {
    generatePromptImpl: vi.fn().mockResolvedValue('prompt text'),
    wpFetchImpl: mockWPFetch,
    generateLegalImpl: vi.fn().mockResolvedValue({
      privacyPolicy: '<h1>Privacy</h1>',
      termsOfService: '<h1>Terms</h1>',
    }),
    generateFAQImpl: vi.fn().mockResolvedValue('<h2>FAQ</h2>'),
    generateCSSImpl: vi.fn().mockResolvedValue('body { color: blue; }'),
  });

  const emit = vi.fn();
  await runner.run('full-test', emit);

  // Build should be paused at step 3
  let build = queries.getBuildById(db, 'full-test');
  expect(build.status).toBe('paused');

  // Resume with WP credentials
  await runner.resume('full-test', {
    wp_url: 'https://test.10web.site',
    wp_username: 'admin',
    wp_password: 'test-pass',
  }, emit);

  // Build should complete
  build = queries.getBuildById(db, 'full-test');
  expect(build.status).toBe('completed');
  expect(build.privacy_policy_url).toBeTruthy();
  expect(build.terms_url).toBeTruthy();
  expect(build.faq_url).toBeTruthy();
});
```

- [ ] **Step 2: Run all tests**

Run: `cd ~/ghl-sub-account-builder && npx vitest run`
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
cd ~/ghl-sub-account-builder
git add tests/server/pause-resume.test.js
git commit -m "test(m2b): add full-pipeline integration test through WP setup"
```

---

### Task 8: Run DB Migration on Live Database

**Files:**
- None (runtime migration)

- [ ] **Step 1: Restart the server to trigger migration**

```bash
cd ~/ghl-sub-account-builder
pkill -f "node server/index.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1
npm run dev:all &
sleep 3
```

- [ ] **Step 2: Verify new columns exist**

```bash
cd ~/ghl-sub-account-builder
sqlite3 data.db "PRAGMA table_info(builds);" | grep -E 'privacy_policy_url|terms_url|faq_url'
```

Expected: 3 rows showing the new columns

- [ ] **Step 3: Run full test suite one final time**

Run: `cd ~/ghl-sub-account-builder && npx vitest run`
Expected: all tests PASS

- [ ] **Step 4: Commit all remaining changes**

```bash
cd ~/ghl-sub-account-builder
git add -A
git commit -m "feat(m2b): WordPress post-setup automation complete — 11-step pipeline"
```

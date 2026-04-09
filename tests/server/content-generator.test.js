import { describe, it, expect, vi } from 'vitest';
import {
  generateLegalDocs,
  generateFAQ,
  generateSiteCSS,
} from '../../server/services/content-generator.js';

function sampleBuild(overrides = {}) {
  return {
    business_name: 'Calispark Electric',
    business_description: 'Residential electrical contractor specializing in EV chargers and panel upgrades',
    business_email: 'info@calispark.com',
    business_phone: '(619) 555-0100',
    industry_text: 'Residential electrical contracting',
    city: 'San Diego',
    state: 'CA',
    target_audience: 'Homeowners aged 35-60',
    brand_colors: JSON.stringify(['#0068E5', '#BBF367']),
    tenweb_prompt: 'Build a WordPress site with Elementor for an electrical contractor.',
    ...overrides,
  };
}

function makeOkFetch(text) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: [{ type: 'text', text }] }),
  });
}

// ── generateLegalDocs ────────────────────────────────────────────────────────

describe('generateLegalDocs', () => {
  it('returns privacyPolicy and termsOfService split on <!-- SPLIT --> marker', async () => {
    const privacy = '<h1>Privacy Policy</h1><p>We respect your data.</p>';
    const tos = '<h1>Terms of Service</h1><p>Use our service responsibly.</p>';
    const fetchImpl = makeOkFetch(`${privacy}\n<!-- SPLIT -->\n${tos}`);

    const result = await generateLegalDocs(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl });

    expect(result).toHaveProperty('privacyPolicy');
    expect(result).toHaveProperty('termsOfService');
    expect(result.privacyPolicy).toContain('Privacy Policy');
    expect(result.termsOfService).toContain('Terms of Service');
  });

  it('throws when Claude response contains no <!-- SPLIT --> marker', async () => {
    const fetchImpl = makeOkFetch('<h1>Only one document, no split</h1>');
    await expect(
      generateLegalDocs(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl })
    ).rejects.toThrow(/SPLIT/i);
  });

  it('uses sonnet model in the request body', async () => {
    const fetchImpl = makeOkFetch('<p>Privacy</p>\n<!-- SPLIT -->\n<p>ToS</p>');
    await generateLegalDocs(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('includes business name in the user message', async () => {
    const fetchImpl = makeOkFetch('<p>Privacy</p>\n<!-- SPLIT -->\n<p>ToS</p>');
    await generateLegalDocs(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userMsg = body.messages[0].content;
    expect(userMsg).toContain('Calispark Electric');
  });

  it('includes business email and phone in the user message', async () => {
    const fetchImpl = makeOkFetch('<p>Privacy</p>\n<!-- SPLIT -->\n<p>ToS</p>');
    await generateLegalDocs(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userMsg = body.messages[0].content;
    expect(userMsg).toContain('info@calispark.com');
    expect(userMsg).toContain('(619) 555-0100');
  });

  it('throws on API error response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Unauthorized' } }),
    });
    await expect(
      generateLegalDocs(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl })
    ).rejects.toThrow(/401|Unauthorized/);
  });

  it('throws when API returns empty content array', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [] }),
    });
    await expect(
      generateLegalDocs(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl })
    ).rejects.toThrow(/empty/i);
  });
});

// ── generateFAQ ──────────────────────────────────────────────────────────────

describe('generateFAQ', () => {
  it('returns an HTML string from Claude', async () => {
    const html = '<div class="faq-item"><div class="faq-question">Q?</div><div class="faq-answer">A.</div></div>';
    const fetchImpl = makeOkFetch(html);

    const result = await generateFAQ(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl });

    expect(typeof result).toBe('string');
    expect(result).toContain('faq-item');
  });

  it('uses sonnet model in the request body', async () => {
    const fetchImpl = makeOkFetch('<div class="faq-item">...</div>');
    await generateFAQ(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.model).toBe('claude-sonnet-4-6');
  });

  it('uses max_tokens of 16384', async () => {
    const fetchImpl = makeOkFetch('<div class="faq-item">...</div>');
    await generateFAQ(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(16384);
  });

  it('includes company name and location in the user message', async () => {
    const fetchImpl = makeOkFetch('<div class="faq-item">...</div>');
    await generateFAQ(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userMsg = body.messages[0].content;
    expect(userMsg).toContain('Calispark Electric');
    expect(userMsg).toContain('San Diego');
  });

  it('POSTs to the Claude messages endpoint', async () => {
    const fetchImpl = makeOkFetch('<div class="faq-item">...</div>');
    await generateFAQ(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('sk-ant-fake');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
  });
});

// ── generateSiteCSS ──────────────────────────────────────────────────────────

describe('generateSiteCSS', () => {
  const existingCSS = 'body { margin: 0; } h1 { color: #000; }';

  it('returns a CSS string from Claude', async () => {
    const css = ':root { --primary: #0068E5; } body { font-family: sans-serif; }';
    const fetchImpl = makeOkFetch(css);

    const result = await generateSiteCSS(sampleBuild(), existingCSS, { apiKey: 'sk-ant-fake', fetchImpl });

    expect(typeof result).toBe('string');
    expect(result).toContain('--primary');
  });

  it('uses opus model in the request body', async () => {
    const fetchImpl = makeOkFetch(':root { --primary: #0068E5; }');
    await generateSiteCSS(sampleBuild(), existingCSS, { apiKey: 'sk-ant-fake', fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.model).toBe('claude-opus-4-6');
  });

  it('uses max_tokens of 16384', async () => {
    const fetchImpl = makeOkFetch(':root {}');
    await generateSiteCSS(sampleBuild(), existingCSS, { apiKey: 'sk-ant-fake', fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(16384);
  });

  it('includes brand colors in the user message', async () => {
    const fetchImpl = makeOkFetch(':root {}');
    await generateSiteCSS(sampleBuild(), existingCSS, { apiKey: 'sk-ant-fake', fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userMsg = body.messages[0].content;
    expect(userMsg).toContain('#0068E5');
    expect(userMsg).toContain('#BBF367');
  });

  it('includes tenweb_prompt in the user message', async () => {
    const fetchImpl = makeOkFetch(':root {}');
    await generateSiteCSS(sampleBuild(), existingCSS, { apiKey: 'sk-ant-fake', fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userMsg = body.messages[0].content;
    expect(userMsg).toContain('Elementor');
  });

  it('includes existing CSS in the user message', async () => {
    const fetchImpl = makeOkFetch(':root {}');
    await generateSiteCSS(sampleBuild(), existingCSS, { apiKey: 'sk-ant-fake', fetchImpl });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const userMsg = body.messages[0].content;
    expect(userMsg).toContain(existingCSS);
  });

  it('strips markdown css code fences from the response', async () => {
    const fenced = '```css\n:root { --primary: #0068E5; }\n```';
    const fetchImpl = makeOkFetch(fenced);

    const result = await generateSiteCSS(sampleBuild(), existingCSS, { apiKey: 'sk-ant-fake', fetchImpl });

    expect(result).not.toContain('```css');
    expect(result).not.toContain('```');
    expect(result).toContain(':root');
  });

  it('strips plain code fences (no language specifier) from the response', async () => {
    const fenced = '```\n:root { --primary: #0068E5; }\n```';
    const fetchImpl = makeOkFetch(fenced);

    const result = await generateSiteCSS(sampleBuild(), existingCSS, { apiKey: 'sk-ant-fake', fetchImpl });

    expect(result).not.toContain('```');
    expect(result).toContain(':root');
  });

  it('POSTs to the Claude messages endpoint with correct headers', async () => {
    const fetchImpl = makeOkFetch(':root {}');
    await generateSiteCSS(sampleBuild(), existingCSS, { apiKey: 'sk-ant-fake', fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('sk-ant-fake');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    expect(init.headers['content-type']).toBe('application/json');
  });
});

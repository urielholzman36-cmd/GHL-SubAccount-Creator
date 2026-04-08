import { describe, it, expect, vi } from 'vitest';
import { SYSTEM_PROMPT, buildUserMessage, generatePrompt } from '../../server/services/prompt-generator.js';

function sampleBuild(overrides = {}) {
  return {
    business_name: 'Calispark Electric',
    industry_text: 'Residential electrical contracting',
    city: 'San Diego',
    state: 'CA',
    target_audience: 'Homeowners aged 35-60 considering EV chargers and panel upgrades',
    brand_colors: JSON.stringify(['#0068E5', '#BBF367']),
    website_url: null,
    ...overrides,
  };
}

describe('SYSTEM_PROMPT', () => {
  it('is a non-empty string containing the Ready-to-Paste marker', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(500);
    expect(SYSTEM_PROMPT).toContain('Ready-to-Paste Prompt for 10Web:');
  });

  it('mentions Elementor and legal pages', () => {
    expect(SYSTEM_PROMPT).toMatch(/elementor/i);
    expect(SYSTEM_PROMPT).toMatch(/privacy policy/i);
    expect(SYSTEM_PROMPT).toMatch(/terms of service/i);
  });
});

describe('buildUserMessage', () => {
  it('includes all key fields from the build row', () => {
    const msg = buildUserMessage(sampleBuild());
    expect(msg).toContain('Calispark Electric');
    expect(msg).toContain('Residential electrical contracting');
    expect(msg).toContain('San Diego, CA');
    expect(msg).toContain('Homeowners aged 35-60');
    expect(msg).toContain('#0068E5');
    expect(msg).toContain('#BBF367');
  });

  it('handles missing existing website with a sensible placeholder', () => {
    const msg = buildUserMessage(sampleBuild({ website_url: null }));
    expect(msg).toMatch(/no existing website|none/i);
  });

  it('handles missing brand colors', () => {
    const msg = buildUserMessage(sampleBuild({ brand_colors: null }));
    expect(msg).toMatch(/colors|palette/i);
  });

  it('always states WordPress is yes and Elementor', () => {
    const msg = buildUserMessage(sampleBuild());
    expect(msg).toMatch(/wordpress/i);
    expect(msg).toMatch(/elementor/i);
  });
});

describe('generatePrompt', () => {
  it('POSTs to the Claude messages API with the expected shape', async () => {
    const fakeResponse = {
      content: [{ type: 'text', text: 'Ready-to-Paste Prompt for 10Web:\n...prompt body...' }],
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeResponse,
    });

    const out = await generatePrompt(sampleBuild(), {
      apiKey: 'sk-ant-fake',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('sk-ant-fake');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    expect(init.headers['content-type']).toBe('application/json');

    const body = JSON.parse(init.body);
    expect(body.model).toBe('claude-opus-4-6');
    expect(body.max_tokens).toBeGreaterThanOrEqual(2048);
    expect(body.system).toBe(SYSTEM_PROMPT);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toContain('Calispark Electric');

    expect(out).toContain('Ready-to-Paste Prompt for 10Web:');
  });

  it('throws with a helpful message if the API returns a non-ok status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'boom' } }),
    });
    await expect(
      generatePrompt(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl })
    ).rejects.toThrow(/500|boom/);
  });

  it('throws if the API returns no text content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [] }),
    });
    await expect(
      generatePrompt(sampleBuild(), { apiKey: 'sk-ant-fake', fetchImpl })
    ).rejects.toThrow(/empty|no content/i);
  });
});

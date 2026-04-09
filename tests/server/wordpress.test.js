import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WordPressClient } from '../../server/services/wordpress.js';

const BASE_URL = 'https://example.com';
const USERNAME = 'admin';
const APP_PASSWORD = 'xxxx xxxx xxxx xxxx xxxx xxxx';

function makeClient(fetchImpl) {
  return new WordPressClient({ url: BASE_URL, username: USERNAME, appPassword: APP_PASSWORD, fetchImpl });
}

function mockFetch(status, body, extraHeaders = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    headers: extraHeaders,
  });
}

describe('WordPressClient', () => {
  describe('validateConnection()', () => {
    it('succeeds on 200', async () => {
      const fetch = mockFetch(200, { blogname: 'My Site' });
      const client = makeClient(fetch);
      await expect(client.validateConnection()).resolves.not.toThrow();
      expect(fetch).toHaveBeenCalledWith(
        `${BASE_URL}/wp-json/wp/v2/settings`,
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('throws WP API {status}: {text} on failure', async () => {
      const fetch = mockFetch(401, 'Unauthorized');
      const client = makeClient(fetch);
      await expect(client.validateConnection()).rejects.toThrow('WP API 401: Unauthorized');
    });
  });

  describe('installPlugin()', () => {
    it('posts correct payload and returns JSON response', async () => {
      const responseData = { plugin: 'my-plugin/my-plugin.php', status: 'active' };
      const fetch = mockFetch(201, responseData);
      const client = makeClient(fetch);
      const result = await client.installPlugin('my-plugin');
      expect(result).toEqual(responseData);
      const [url, opts] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/wp-json/wp/v2/plugins`);
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ slug: 'my-plugin', status: 'active' });
    });
  });

  describe('uploadMedia()', () => {
    it('sends binary body with correct headers and returns id + source_url', async () => {
      const responseData = { id: 42, source_url: 'https://example.com/wp-content/uploads/logo.png', other: 'ignored' };
      const fetch = mockFetch(201, responseData);
      const client = makeClient(fetch);
      const buffer = Buffer.from('fake image data');
      const result = await client.uploadMedia(buffer, 'logo.png', 'image/png');
      expect(result).toEqual({ id: 42, source_url: 'https://example.com/wp-content/uploads/logo.png' });
      const [url, opts] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/wp-json/wp/v2/media`);
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('image/png');
      expect(opts.headers['Content-Disposition']).toContain('logo.png');
    });
  });

  describe('setSiteLogo()', () => {
    it('posts correct payload with site_logo and site_icon', async () => {
      const fetch = mockFetch(200, {});
      const client = makeClient(fetch);
      await client.setSiteLogo(42);
      const [url, opts] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/wp-json/wp/v2/settings`);
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ site_logo: 42, site_icon: 42 });
    });
  });

  describe('deleteTemplate()', () => {
    it('swallows errors and does not throw', async () => {
      const fetch = vi.fn().mockRejectedValue(new Error('network error'));
      const client = makeClient(fetch);
      await expect(client.deleteTemplate('my-template')).resolves.not.toThrow();
    });

    it('swallows non-ok responses and does not throw', async () => {
      const fetch = mockFetch(404, 'Not Found');
      const client = makeClient(fetch);
      await expect(client.deleteTemplate('my-template')).resolves.not.toThrow();
    });

    it('calls DELETE with force=true on correct URL', async () => {
      const fetch = mockFetch(200, {});
      const client = makeClient(fetch);
      await client.deleteTemplate('my-template');
      const [url, opts] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/wp-json/wp/v2/templates/my-template?force=true`);
      expect(opts.method).toBe('DELETE');
    });
  });

  describe('createPage()', () => {
    it('returns id and link', async () => {
      const responseData = { id: 7, link: 'https://example.com/my-page/', slug: 'my-page' };
      const fetch = mockFetch(201, responseData);
      const client = makeClient(fetch);
      const result = await client.createPage('My Page', '<p>Hello</p>');
      expect(result).toEqual({ id: 7, link: 'https://example.com/my-page/' });
      const [url, opts] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/wp-json/wp/v2/pages`);
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ title: 'My Page', content: '<p>Hello</p>', status: 'publish' });
    });
  });

  describe('getCustomCSS()', () => {
    it('returns empty string when no results', async () => {
      const fetch = mockFetch(200, []);
      const client = makeClient(fetch);
      const result = await client.getCustomCSS();
      expect(result).toBe('');
    });

    it('returns raw CSS from first item', async () => {
      const fetch = mockFetch(200, [{ id: 1, content: { raw: 'body { color: red; }' } }]);
      const client = makeClient(fetch);
      const result = await client.getCustomCSS();
      expect(result).toBe('body { color: red; }');
    });
  });

  describe('setCustomCSS()', () => {
    const MARKER = '/* === VO360 Onboarding — Auto-generated === */';

    it('appends marker + new CSS after existing CSS (existing post, no previous marker)', async () => {
      const existingCSS = 'body { color: red; }';
      const existingItems = [{ id: 1, content: { raw: existingCSS } }];
      const newCSS = '.hero { background: blue; }';

      // First call: getCustomCSS (GET) — returns existing items
      // Second call: setCustomCSS PUT
      const fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => existingItems,
          text: async () => JSON.stringify(existingItems),
        })
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({}),
          text: async () => '{}',
        });

      const client = makeClient(fetch);
      await client.setCustomCSS(newCSS);

      const [putUrl, putOpts] = fetch.mock.calls[1];
      expect(putUrl).toBe(`${BASE_URL}/wp-json/wp/v2/custom_css/1`);
      expect(putOpts.method).toBe('PUT');
      const body = JSON.parse(putOpts.body);
      expect(body.content).toContain(existingCSS);
      expect(body.content).toContain(MARKER);
      expect(body.content).toContain(newCSS);
      // marker comes after existing CSS
      expect(body.content.indexOf(existingCSS)).toBeLessThan(body.content.indexOf(MARKER));
    });

    it('strips previous auto-generated block before appending new CSS', async () => {
      const existingCSS = `body { color: red; }\n${MARKER}\n.old { display: none; }`;
      const existingItems = [{ id: 1, content: { raw: existingCSS } }];
      const newCSS = '.new { display: block; }';

      const fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => existingItems,
          text: async () => JSON.stringify(existingItems),
        })
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => ({}),
          text: async () => '{}',
        });

      const client = makeClient(fetch);
      await client.setCustomCSS(newCSS);

      const [, putOpts] = fetch.mock.calls[1];
      const body = JSON.parse(putOpts.body);
      expect(body.content).not.toContain('.old { display: none; }');
      expect(body.content).toContain('body { color: red; }');
      expect(body.content).toContain(MARKER);
      expect(body.content).toContain(newCSS);
    });

    it('creates new post when no existing CSS', async () => {
      const newCSS = '.hero { background: blue; }';

      const fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true, status: 200,
          json: async () => [],
          text: async () => '[]',
        })
        .mockResolvedValueOnce({
          ok: true, status: 201,
          json: async () => ({ id: 5 }),
          text: async () => '{"id":5}',
        });

      const client = makeClient(fetch);
      await client.setCustomCSS(newCSS);

      const [postUrl, postOpts] = fetch.mock.calls[1];
      expect(postUrl).toBe(`${BASE_URL}/wp-json/wp/v2/custom_css`);
      expect(postOpts.method).toBe('POST');
      const body = JSON.parse(postOpts.body);
      expect(body.content).toContain(MARKER);
      expect(body.content).toContain(newCSS);
    });
  });
});

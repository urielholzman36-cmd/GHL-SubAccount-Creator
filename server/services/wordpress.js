const CSS_MARKER = '/* === VO360 Onboarding — Auto-generated === */';

export class WordPressClient {
  constructor({ url, username, appPassword, fetchImpl }) {
    this.baseUrl = url.replace(/\/$/, '');
    this.authHeader = 'Basic ' + Buffer.from(`${username}:${appPassword}`).toString('base64');
    this._fetch = fetchImpl || fetch;
  }

  async _request(method, path, body = null, extraHeaders = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Authorization': this.authHeader,
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
    const options = { method, headers };
    if (body !== null) options.body = JSON.stringify(body);
    const response = await this._fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`WP API ${response.status}: ${text}`);
    }
    return response.json();
  }

  async validateConnection() {
    await this._request('GET', '/wp-json/wp/v2/settings');
  }

  async installPlugin(slug) {
    return this._request('POST', '/wp-json/wp/v2/plugins', { slug, status: 'active' });
  }

  async uploadMedia(fileBuffer, filename, mimeType) {
    const url = `${this.baseUrl}/wp-json/wp/v2/media`;
    const headers = {
      'Authorization': this.authHeader,
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    };
    const response = await this._fetch(url, { method: 'POST', headers, body: fileBuffer });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`WP API ${response.status}: ${text}`);
    }
    const data = await response.json();
    return { id: data.id, source_url: data.source_url };
  }

  async setSiteLogo(mediaId) {
    return this._request('POST', '/wp-json/wp/v2/settings', { site_logo: mediaId, site_icon: mediaId });
  }

  async deleteTemplate(slug) {
    try {
      const url = `${this.baseUrl}/wp-json/wp/v2/templates/${slug}?force=true`;
      const headers = { 'Authorization': this.authHeader, 'Content-Type': 'application/json' };
      await this._fetch(url, { method: 'DELETE', headers });
    } catch (_) {
      // swallow all errors
    }
  }

  async createPage(title, htmlContent) {
    const data = await this._request('POST', '/wp-json/wp/v2/pages', {
      title,
      content: htmlContent,
      status: 'publish',
    });
    return { id: data.id, link: data.link };
  }

  async getCustomCSS() {
    const url = `${this.baseUrl}/wp-json/wp/v2/custom_css`;
    const headers = { 'Authorization': this.authHeader, 'Content-Type': 'application/json' };
    const response = await this._fetch(url, { method: 'GET', headers });
    if (!response.ok) return '';
    const items = await response.json();
    if (!Array.isArray(items) || items.length === 0) return '';
    return items[0]?.content?.raw ?? '';
  }

  async setCustomCSS(newCSS) {
    const url = `${this.baseUrl}/wp-json/wp/v2/custom_css`;
    const headers = { 'Authorization': this.authHeader, 'Content-Type': 'application/json' };

    // Fetch existing items to detect id and current CSS
    const getResponse = await this._fetch(url, { method: 'GET', headers });
    const items = getResponse.ok ? await getResponse.json() : [];
    const existingItem = Array.isArray(items) && items.length > 0 ? items[0] : null;
    const existingCSS = existingItem?.content?.raw ?? '';

    // Strip any previous auto-generated block (marker + everything after)
    const markerIndex = existingCSS.indexOf(CSS_MARKER);
    const baseCSS = markerIndex >= 0 ? existingCSS.slice(0, markerIndex).trimEnd() : existingCSS;

    const combined = baseCSS
      ? `${baseCSS}\n${CSS_MARKER}\n${newCSS}`
      : `${CSS_MARKER}\n${newCSS}`;

    const body = JSON.stringify({ content: combined });

    if (existingItem) {
      const putUrl = `${this.baseUrl}/wp-json/wp/v2/custom_css/${existingItem.id}`;
      const response = await this._fetch(putUrl, { method: 'PUT', headers, body });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`WP API ${response.status}: ${text}`);
      }
    } else {
      const response = await this._fetch(url, { method: 'POST', headers, body });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`WP API ${response.status}: ${text}`);
      }
    }
  }
}

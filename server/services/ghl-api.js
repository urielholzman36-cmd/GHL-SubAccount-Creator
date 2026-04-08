const BASE_URL = 'https://services.leadconnectorhq.com';

export class GhlApi {
  constructor(apiKey, companyId = null) {
    this.apiKey = apiKey;
    this.companyId = companyId || process.env.GHL_COMPANY_ID || null;
  }

  async getCompanyId() {
    if (this.companyId) return this.companyId;
    // Discover companyId from an existing location
    const data = await this.request('GET', '/locations/search?limit=1');
    if (data.locations && data.locations.length > 0) {
      this.companyId = data.locations[0].companyId;
      return this.companyId;
    }
    throw new Error('Unable to determine companyId: no existing locations found');
  }

  async request(method, path, body = null, version = '2021-07-28') {
    const url = `${BASE_URL}${path}`;
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Version': version,
      'Content-Type': 'application/json',
    };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(`GHL API error: ${response.status} ${data.message || JSON.stringify(data)}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  async createLocation(locationData) {
    const companyId = await this.getCompanyId();
    const body = { ...locationData, companyId };
    const data = await this.request('POST', '/locations/', body);
    // Wrap in { location } shape expected by BuildRunner and tests
    return { location: data };
  }
  async buyPhoneNumber(locationId, areaCode) { return this.request('POST', '/phone-numbers/buy', { locationId, areaCode, capabilities: ['sms', 'voice', 'mms'] }); }
  async setCustomValues(locationId, customValues) { return this.request('POST', `/locations/${locationId}/customValues`, { customValues }); }
  async createPipeline(locationId, name, stages) { return this.request('POST', '/opportunities/pipelines', { locationId, name, stages }); }
  async createUser(locationId, firstName, lastName, email) { return this.request('POST', '/users/', { locationIds: [locationId], firstName, lastName, email, role: 'admin', permissions: {} }); }
  async createContact(locationId, firstName, lastName, email, phone) { return this.request('POST', '/contacts/', { locationId, firstName, lastName, email, phone }); }
  async sendMessage(type, locationId, contactId, message, subject = null) { const body = { type, locationId, contactId, message }; if (subject) body.subject = subject; return this.request('POST', '/conversations/messages', body); }
}

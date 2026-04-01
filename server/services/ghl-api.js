const BASE_URL = 'https://services.leadconnectorhq.com';

export class GhlApi {
  constructor(apiKey) {
    this.apiKey = apiKey;
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

  async createLocation(locationData) { return this.request('POST', '/locations/', locationData); }
  async buyPhoneNumber(locationId, areaCode) { return this.request('POST', '/phone-numbers/buy', { locationId, areaCode, capabilities: ['sms', 'voice', 'mms'] }); }
  async setCustomValues(locationId, customValues) { return this.request('POST', `/locations/${locationId}/customValues`, { customValues }); }
  async createPipeline(locationId, name, stages) { return this.request('POST', '/opportunities/pipelines', { locationId, name, stages }); }
  async createUser(locationId, firstName, lastName, email) { return this.request('POST', '/users/', { locationIds: [locationId], firstName, lastName, email, role: 'admin', permissions: {} }); }
  async createContact(locationId, firstName, lastName, email, phone) { return this.request('POST', '/contacts/', { locationId, firstName, lastName, email, phone }); }
  async sendMessage(type, locationId, contactId, message, subject = null) { const body = { type, locationId, contactId, message }; if (subject) body.subject = subject; return this.request('POST', '/conversations/messages', body); }
}

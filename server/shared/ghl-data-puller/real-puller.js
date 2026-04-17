// Real GHL data puller — uses a per-location Private Integration Token (PIT)
// to read contacts / opportunities / conversations / appointments for a single
// sub-account. Returns the same GHLRawData shape as the mock puller.

const BASE_URL = 'https://services.leadconnectorhq.com';
const API_VERSION = '2021-07-28';

async function ghlGet(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Version': API_VERSION,
      'Accept': 'application/json',
    },
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`GHL ${res.status} on ${path}: ${data.message || text}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function fetchContacts(locationId, token, sinceIso) {
  const sinceMs = new Date(sinceIso).getTime();
  const out = [];
  let startAfter = null;
  let startAfterId = null;
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ locationId, limit: '100' });
    if (startAfter) params.set('startAfter', String(startAfter));
    if (startAfterId) params.set('startAfterId', startAfterId);
    const data = await ghlGet(`/contacts/?${params}`, token);
    const list = data.contacts || [];
    if (!list.length) break;
    for (const c of list) {
      out.push({
        id: c.id,
        dateAdded: c.dateAdded || c.createdAt || null,
        tags: c.tags || [],
        source: c.source,
      });
    }
    const last = list[list.length - 1];
    startAfter = last.dateAdded ? new Date(last.dateAdded).getTime() : null;
    startAfterId = last.id;
    // Stop once we've paged past the cutoff
    if (startAfter && startAfter < sinceMs) break;
  }
  return out.filter(c => c.dateAdded);
}

async function fetchOpportunities(locationId, token) {
  const out = [];
  let page = 1;
  for (; page <= 5; page++) {
    const params = new URLSearchParams({
      location_id: locationId,
      limit: '100',
      page: String(page),
    });
    const data = await ghlGet(`/opportunities/search?${params}`, token);
    const list = data.opportunities || [];
    if (!list.length) break;
    for (const o of list) {
      out.push({
        id: o.id,
        pipelineId: o.pipelineId,
        stageId: o.pipelineStageId || o.stageId,
        stageChangedAt: o.lastStatusChangeAt || o.updatedAt || o.createdAt,
        status: o.status,
        monetaryValue: o.monetaryValue || 0,
        dateAdded: o.createdAt,
      });
    }
    if (list.length < 100) break;
  }
  return out;
}

async function fetchConversations(locationId, token) {
  const params = new URLSearchParams({ locationId, limit: '100' });
  const data = await ghlGet(`/conversations/search?${params}`, token);
  const list = data.conversations || [];
  return list.map(c => ({
    id: c.id,
    contactId: c.contactId,
    lastInboundAt: c.lastInboundMessageDate || c.lastMessageDate || null,
    lastOutboundAt: c.lastOutboundMessageDate || null,
    // GHL doesn't expose avg response time directly on conversation; leave null
    avgResponseMinutes: null,
  }));
}

async function fetchAppointments(locationId, token, sinceIso) {
  // 1. List calendars for this location
  let calData;
  try {
    calData = await ghlGet(`/calendars/?locationId=${locationId}`, token);
  } catch (err) {
    if (err.status === 401 || err.status === 403) return []; // no calendar scope
    throw err;
  }
  const calendars = calData.calendars || [];
  if (!calendars.length) return [];

  const startMs = new Date(sinceIso).getTime();
  const endMs = Date.now();
  const out = [];
  for (const cal of calendars) {
    const params = new URLSearchParams({
      locationId,
      calendarId: cal.id,
      startTime: String(startMs),
      endTime: String(endMs),
    });
    let data;
    try {
      data = await ghlGet(`/calendars/events?${params}`, token);
    } catch {
      continue;
    }
    const events = data.events || [];
    for (const e of events) {
      if (e.appointmentStatus || e.contactId) {
        out.push({
          id: e.id,
          startTime: e.startTime,
          status: e.appointmentStatus || 'booked',
          contactId: e.contactId,
        });
      }
    }
  }
  return out;
}

export async function realPullAll(locationId, dateRange, opts = {}) {
  const token = opts.token;
  if (!token) throw new Error('Missing per-location PIT token for real GHL pull');
  if (!locationId) throw new Error('Missing locationId for real GHL pull');

  const [contacts, opportunities, conversations, appointments] = await Promise.all([
    fetchContacts(locationId, token, dateRange.from).catch(err => {
      console.error('[GHL] contacts failed:', err.message);
      return [];
    }),
    fetchOpportunities(locationId, token).catch(err => {
      console.error('[GHL] opportunities failed:', err.message);
      return [];
    }),
    fetchConversations(locationId, token).catch(err => {
      console.error('[GHL] conversations failed:', err.message);
      return [];
    }),
    fetchAppointments(locationId, token, dateRange.from).catch(err => {
      console.error('[GHL] appointments failed:', err.message);
      return [];
    }),
  ]);

  return {
    contacts,
    opportunities,
    conversations,
    appointments,
    reviewRequestsSent: 0, // GHL has no standard endpoint for this; left 0 for real pulls
    metadata: {
      locationId,
      pulledAt: new Date().toISOString(),
      dateRange,
    },
  };
}

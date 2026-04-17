import { mockPullAll } from './mock-puller.js';
import { realPullAll } from './real-puller.js';

/**
 * Decides between mock and real GHL data. A client is considered "real-ready"
 * if it has both a location_id and a per-location PIT token. Otherwise we fall
 * back to mock (unless GHL_MOCK_MODE=false is set AND no token is present, in
 * which case we throw so the failure is visible).
 */
export async function pullAll(locationId, dateRange, opts = {}) {
  const hasToken = !!opts.token;
  const hasLocation = !!locationId && !String(locationId).startsWith('mock_');
  const forceMock = process.env.GHL_MOCK_MODE === 'true';

  if (!forceMock && hasLocation && hasToken) {
    return realPullAll(locationId, dateRange, opts);
  }
  return mockPullAll(locationId, dateRange, opts);
}

export function defaultDateRange(days = 30) {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(to.getUTCDate() - days);
  return { from: from.toISOString(), to: to.toISOString() };
}

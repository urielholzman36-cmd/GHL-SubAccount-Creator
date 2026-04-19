import { fetchMonthlyAggregate } from '../../../shared/ghl-data-puller/index.js';
import { decrypt } from '../../../services/crypto.js';

function isSameUtcDay(aIso, bIso) {
  const a = new Date(aIso);
  const b = new Date(bIso);
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

// Hybrid pull:
// - If there's a report row for (client_id, month) updated today and it has a data_snapshot → return cached.
// - Otherwise, pull fresh via the GHL pullAll entrypoint and return the aggregate.
// - This function does NOT write anything; the caller persists.
export async function pullMonthlyData({ db, client, month }) {
  if (!client.location_id) {
    const e = new Error('Client has no GHL location — connect GHL first.');
    e.status = 400;
    throw e;
  }

  const cached = await db.execute({
    sql: `SELECT data_snapshot_json, updated_at FROM reports WHERE client_id = ? AND month = ?`,
    args: [client.id, month],
  });
  const row = cached.rows[0];
  const nowIso = new Date().toISOString();
  if (row && row.data_snapshot_json && row.updated_at && isSameUtcDay(row.updated_at, nowIso)) {
    try {
      return { source: 'cache', aggregate: JSON.parse(row.data_snapshot_json) };
    } catch { /* fall through to fresh pull */ }
  }

  let token = null;
  if (client.ghl_api_key_encrypted) {
    try { token = decrypt(client.ghl_api_key_encrypted); } catch { token = null; }
  }
  // Note: token can remain null — pullAll will fall back to mock in that case.

  try {
    const aggregate = await fetchMonthlyAggregate(client.location_id, token, month);
    return { source: 'fresh', aggregate };
  } catch (err) {
    if (err.status && err.status >= 400 && err.status < 500) throw err;
    const e = new Error('GHL is unreachable. Try again in a minute.');
    e.status = 502;
    throw e;
  }
}

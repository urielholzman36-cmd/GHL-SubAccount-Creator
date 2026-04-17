import { pullAll, defaultDateRange } from '../../../shared/ghl-data-puller/index.js';
import { calculateScore } from './score-calculator.js';
import { checkAlerts } from './churn-alerts.js';
import { decrypt } from '../../../services/crypto.js';

async function getLatestScore(db, clientId) {
  const r = await db.execute({
    sql: `SELECT score, status, calculated_at
          FROM health_scores WHERE client_id = ?
          ORDER BY calculated_at DESC LIMIT 1`,
    args: [clientId],
  });
  const row = r.rows[0];
  if (!row) return null;
  return { score: Number(row.score), status: row.status };
}

async function getRecentAlerts(db, clientId, hours = 24) {
  const r = await db.execute({
    sql: `SELECT rule, client_id FROM alerts
          WHERE client_id = ?
          AND created_at >= datetime('now', ?)`,
    args: [clientId, `-${hours} hours`],
  });
  return r.rows;
}

export async function scoreClient(db, client) {
  const locationId = client.location_id || `mock_client_${client.id}`;
  const niche = (client.industry || '').toLowerCase();
  const dateRange = defaultDateRange(30);

  let token = null;
  if (client.ghl_api_key_encrypted) {
    try { token = decrypt(client.ghl_api_key_encrypted); }
    catch (err) { console.error(`[health] failed to decrypt GHL key for client ${client.id}:`, err.message); }
  }

  const rawData = await pullAll(locationId, dateRange, { niche, token });
  const prev = await getLatestScore(db, client.id);
  const result = calculateScore(rawData, niche);

  // Persist score snapshot
  await db.execute({
    sql: `INSERT INTO health_scores
      (client_id, score, status,
       metric_new_leads, metric_pipeline_movement, metric_conversation_activity,
       metric_response_time, metric_appointments, metric_reviews, raw_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      client.id, result.score, result.status,
      result.metrics.new_leads.score,
      result.metrics.pipeline_movement.score,
      result.metrics.conversation_activity.score,
      result.metrics.response_time.score,
      result.metrics.appointments_booked.score,
      result.metrics.review_requests.score,
      JSON.stringify({ raw: rawData, metrics: result.metrics }),
    ],
  });

  // Churn alerts
  const recent = await getRecentAlerts(db, client.id, 24);
  const newAlerts = checkAlerts(client, prev, result, rawData, recent);
  for (const a of newAlerts) {
    await db.execute({
      sql: `INSERT INTO alerts (client_id, rule, message, score_at_alert, delivered_via)
            VALUES (?, ?, ?, ?, ?)`,
      args: [a.client_id, a.rule, a.message, a.score_at_alert, 'dashboard'],
    });
  }

  return { clientId: client.id, score: result.score, status: result.status, alertsCreated: newAlerts.length };
}

export async function refreshAll(db) {
  const clientsResult = await db.execute('SELECT * FROM clients ORDER BY id');
  const out = { total: 0, ok: 0, failed: 0, alerts: 0, results: [] };
  for (const client of clientsResult.rows) {
    out.total++;
    try {
      const r = await scoreClient(db, client);
      out.ok++;
      out.alerts += r.alertsCreated;
      out.results.push(r);
    } catch (err) {
      out.failed++;
      out.results.push({ clientId: client.id, error: err.message });
    }
  }
  return out;
}

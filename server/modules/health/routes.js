import { Router } from 'express';
import { scoreClient, refreshAll } from './services/orchestrator.js';

function stripClientSecrets(row) {
  if (!row) return row;
  const { ghl_api_key_encrypted, ...safe } = row;
  return { ...safe, has_ghl_api_key: !!ghl_api_key_encrypted };
}

export function createHealthRouter(db) {
  const router = Router();

  // GET /scores — all clients with latest score + name
  router.get('/scores', async (req, res) => {
    try {
      const r = await db.execute(`
        SELECT c.id, c.name, c.industry, c.logo_path, c.location_id,
               CASE WHEN c.ghl_api_key_encrypted IS NOT NULL AND c.ghl_api_key_encrypted != '' THEN 1 ELSE 0 END AS has_ghl_api_key,
               h.score, h.status, h.calculated_at,
               h.metric_new_leads, h.metric_pipeline_movement,
               h.metric_conversation_activity, h.metric_response_time,
               h.metric_appointments, h.metric_reviews
        FROM clients c
        LEFT JOIN (
          SELECT hs.* FROM health_scores hs
          JOIN (
            SELECT client_id, MAX(calculated_at) AS max_ts
            FROM health_scores GROUP BY client_id
          ) latest ON hs.client_id = latest.client_id
                 AND hs.calculated_at = latest.max_ts
        ) h ON h.client_id = c.id
        ORDER BY
          CASE h.status WHEN 'red' THEN 0 WHEN 'yellow' THEN 1 WHEN 'green' THEN 2 ELSE 3 END,
          c.name
      `);
      res.json(r.rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to list scores', details: err.message });
    }
  });

  // GET /scores/:clientId — latest + history + metrics breakdown
  router.get('/scores/:clientId', async (req, res) => {
    const { clientId } = req.params;
    try {
      const client = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [clientId] });
      if (!client.rows[0]) return res.status(404).json({ error: 'Client not found' });

      const latest = await db.execute({
        sql: `SELECT * FROM health_scores WHERE client_id = ?
              ORDER BY calculated_at DESC LIMIT 1`,
        args: [clientId],
      });

      const history = await db.execute({
        sql: `SELECT score, status, calculated_at FROM health_scores
              WHERE client_id = ?
              ORDER BY calculated_at DESC LIMIT 30`,
        args: [clientId],
      });

      const alerts = await db.execute({
        sql: `SELECT * FROM alerts WHERE client_id = ?
              ORDER BY created_at DESC LIMIT 20`,
        args: [clientId],
      });

      let breakdown = null;
      if (latest.rows[0]?.raw_data) {
        try { breakdown = JSON.parse(latest.rows[0].raw_data); } catch {}
      }

      res.json({
        client: stripClientSecrets(client.rows[0]),
        latest: latest.rows[0] || null,
        history: history.rows.reverse(),
        alerts: alerts.rows,
        breakdown,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch client health', details: err.message });
    }
  });

  // POST /refresh — pull, score, store for all clients (or one)
  router.post('/refresh', async (req, res) => {
    const { client_id } = req.body || {};
    try {
      if (client_id) {
        const r = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [client_id] });
        if (!r.rows[0]) return res.status(404).json({ error: 'Client not found' });
        const result = await scoreClient(db, r.rows[0]);
        return res.json({ ok: true, result });
      }
      const summary = await refreshAll(db);
      res.json({ ok: true, summary });
    } catch (err) {
      res.status(500).json({ error: 'Refresh failed', details: err.message });
    }
  });

  // GET /alerts — unacknowledged alerts (optionally filter by client)
  router.get('/alerts', async (req, res) => {
    try {
      const { client_id, include_ack } = req.query;
      const parts = [];
      const args = [];
      if (client_id) { parts.push('a.client_id = ?'); args.push(client_id); }
      if (!include_ack) parts.push('a.acknowledged = 0');
      const where = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
      const r = await db.execute({
        sql: `SELECT a.*, c.name AS client_name FROM alerts a
              LEFT JOIN clients c ON c.id = a.client_id
              ${where}
              ORDER BY a.created_at DESC LIMIT 100`,
        args,
      });
      res.json(r.rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to list alerts', details: err.message });
    }
  });

  // POST /alerts/:id/acknowledge — mark alert handled
  router.post('/alerts/:id/acknowledge', async (req, res) => {
    try {
      await db.execute({
        sql: 'UPDATE alerts SET acknowledged = 1 WHERE id = ?',
        args: [req.params.id],
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to acknowledge alert', details: err.message });
    }
  });

  // GET /diagnostics/:clientId — probe each GHL endpoint for scope + data
  router.get('/diagnostics/:clientId', async (req, res) => {
    try {
      const { decrypt } = await import('../../services/crypto.js');
      const { clientId } = req.params;
      const r = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [clientId] });
      const client = r.rows[0];
      if (!client) return res.status(404).json({ error: 'Client not found' });
      if (!client.location_id || !client.ghl_api_key_encrypted) {
        return res.status(400).json({ error: 'Client is not connected to GHL (missing location_id or API key)' });
      }
      const token = decrypt(client.ghl_api_key_encrypted);
      const loc = client.location_id;
      const base = 'https://services.leadconnectorhq.com';
      const headers = { Authorization: `Bearer ${token}`, Version: '2021-07-28', Accept: 'application/json' };

      const checks = [
        { name: 'contacts', url: `${base}/contacts/?locationId=${loc}&limit=1` },
        { name: 'conversations', url: `${base}/conversations/search?locationId=${loc}&limit=1` },
        { name: 'opportunities', url: `${base}/opportunities/search?location_id=${loc}&limit=1` },
        { name: 'pipelines', url: `${base}/opportunities/pipelines?locationId=${loc}` },
        { name: 'calendars', url: `${base}/calendars/?locationId=${loc}` },
      ];

      const results = await Promise.all(checks.map(async c => {
        try {
          const resp = await fetch(c.url, { headers });
          const data = await resp.text();
          let parsed; try { parsed = JSON.parse(data); } catch { parsed = null; }
          const counts = parsed ? {
            contacts: Array.isArray(parsed.contacts) ? parsed.contacts.length : undefined,
            conversations: Array.isArray(parsed.conversations) ? parsed.conversations.length : undefined,
            opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities.length : undefined,
            pipelines: Array.isArray(parsed.pipelines) ? parsed.pipelines.length : undefined,
            calendars: Array.isArray(parsed.calendars) ? parsed.calendars.length : undefined,
            total: parsed.meta?.total ?? parsed.total ?? undefined,
          } : {};
          return {
            name: c.name,
            status: resp.status,
            ok: resp.ok,
            counts,
            message: !resp.ok ? (parsed?.message || data.slice(0, 200)) : null,
          };
        } catch (err) {
          return { name: c.name, status: 0, ok: false, error: err.message };
        }
      }));

      res.json({
        client_id: Number(clientId),
        location_id: loc,
        checks: results,
      });
    } catch (err) {
      res.status(500).json({ error: 'Diagnostics failed', details: err.message });
    }
  });

  // GET /summary — counts for Dashboard
  router.get('/summary', async (req, res) => {
    try {
      const r = await db.execute(`
        SELECT h.status, COUNT(*) as count
        FROM clients c
        LEFT JOIN (
          SELECT hs.* FROM health_scores hs
          JOIN (
            SELECT client_id, MAX(calculated_at) AS max_ts
            FROM health_scores GROUP BY client_id
          ) latest ON hs.client_id = latest.client_id
                 AND hs.calculated_at = latest.max_ts
        ) h ON h.client_id = c.id
        GROUP BY h.status
      `);
      const out = { green: 0, yellow: 0, red: 0, unscored: 0, total: 0 };
      for (const row of r.rows) {
        const status = row.status || 'unscored';
        if (out[status] != null) out[status] = Number(row.count);
        out.total += Number(row.count);
      }
      const alertsResult = await db.execute(
        'SELECT COUNT(*) as count FROM alerts WHERE acknowledged = 0'
      );
      out.unacknowledged_alerts = Number(alertsResult.rows[0].count);
      res.json(out);
    } catch (err) {
      res.status(500).json({ error: 'Failed to compute summary', details: err.message });
    }
  });

  return router;
}

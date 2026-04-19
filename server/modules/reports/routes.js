import { Router } from 'express';
import { pullMonthlyData } from './services/data-puller.js';
import { generateNarrative } from './services/narrative-generator.js';
import { buildReportPdf } from './services/pdf-builder.js';
import {
  reportPublicId,
  uploadReportPdf,
  signedReportDownloadUrl,
  deleteReportPdf,
} from './services/cloudinary-upload.js';

function defaultMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isValidMonth(m) {
  return typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

async function loadClient(db, clientId) {
  const row = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [clientId] });
  return row.rows[0];
}

async function loadReport(db, id) {
  const row = await db.execute({ sql: 'SELECT * FROM reports WHERE id = ?', args: [id] });
  return row.rows[0] || null;
}

export function createReportsRouter(db) {
  const router = Router();

  // GET /api/reports?client_id=:id
  router.get('/', async (req, res, next) => {
    try {
      const clientId = Number(req.query.client_id);
      if (!clientId) return res.status(400).json({ error: 'client_id required' });
      const rows = await db.execute({
        sql: `SELECT id, client_id, month, status, pdf_url, created_at, updated_at
              FROM reports WHERE client_id = ? ORDER BY month DESC`,
        args: [clientId],
      });
      res.json(rows.rows);
    } catch (e) { next(e); }
  });

  // GET /api/reports/defaults
  router.get('/defaults', (_req, res) => {
    res.json({ month: defaultMonth() });
  });

  // GET /api/reports/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const row = await loadReport(db, Number(req.params.id));
      if (!row) return res.status(404).json({ error: 'not found' });
      res.json(row);
    } catch (e) { next(e); }
  });

  // POST /api/reports/pull  { client_id, month }
  router.post('/pull', async (req, res, next) => {
    try {
      const clientId = Number(req.body?.client_id);
      const month = String(req.body?.month || '');
      if (!clientId || !isValidMonth(month)) {
        return res.status(400).json({ error: 'client_id and month (YYYY-MM) required' });
      }
      const client = await loadClient(db, clientId);
      if (!client) return res.status(404).json({ error: 'client not found' });

      const { source, aggregate } = await pullMonthlyData({ db, client, month });
      const narrative = await generateNarrative({
        clientName: client.name,
        industry: client.industry,
        data: aggregate,
      });

      const existing = await db.execute({
        sql: 'SELECT id FROM reports WHERE client_id = ? AND month = ?',
        args: [clientId, month],
      });
      let id;
      if (existing.rows.length) {
        id = existing.rows[0].id;
        await db.execute({
          sql: `UPDATE reports
                SET data_snapshot_json = ?, narrative_json = ?, status = 'draft', updated_at = datetime('now')
                WHERE id = ?`,
          args: [JSON.stringify(aggregate), JSON.stringify(narrative), id],
        });
      } else {
        const ins = await db.execute({
          sql: `INSERT INTO reports (client_id, month, data_snapshot_json, narrative_json, status)
                VALUES (?, ?, ?, ?, 'draft') RETURNING id`,
          args: [clientId, month, JSON.stringify(aggregate), JSON.stringify(narrative)],
        });
        id = ins.rows[0].id;
      }

      const row = await loadReport(db, id);
      res.status(201).json({ ...row, data_source: source });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      next(e);
    }
  });

  // PUT /api/reports/:id  { narrative: { exec_summary, recommendations } }
  router.put('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await loadReport(db, id);
      if (!existing) return res.status(404).json({ error: 'not found' });
      const narrative = req.body?.narrative;
      if (!narrative || typeof narrative.exec_summary !== 'string' || !Array.isArray(narrative.recommendations)) {
        return res.status(400).json({ error: 'narrative { exec_summary, recommendations } required' });
      }
      await db.execute({
        sql: `UPDATE reports SET narrative_json = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [JSON.stringify(narrative), id],
      });
      res.json(await loadReport(db, id));
    } catch (e) { next(e); }
  });

  // POST /api/reports/:id/build
  router.post('/:id/build', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await loadReport(db, id);
      if (!existing) return res.status(404).json({ error: 'not found' });
      const client = await loadClient(db, existing.client_id);
      if (!client) return res.status(404).json({ error: 'client not found' });

      const data = JSON.parse(existing.data_snapshot_json);
      const narrative = JSON.parse(existing.narrative_json);

      const buf = await buildReportPdf({
        clientName: client.name,
        month: existing.month,
        generatedAt: new Date(),
        data,
        narrative,
      });

      const publicId = reportPublicId({ clientName: client.name, clientId: client.id, month: existing.month });
      const uploaded = await uploadReportPdf(buf, publicId);
      const filename = `${client.name.replace(/[^\w-]+/g, '-')}-${existing.month}.pdf`;
      const downloadUrl = signedReportDownloadUrl(uploaded.public_id, filename);

      await db.execute({
        sql: `UPDATE reports
              SET pdf_url = ?, pdf_cloudinary_id = ?, status = 'built', updated_at = datetime('now')
              WHERE id = ?`,
        args: [downloadUrl, uploaded.public_id, id],
      });

      res.json(await loadReport(db, id));
    } catch (e) { next(e); }
  });

  // DELETE /api/reports/:id
  router.delete('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await loadReport(db, id);
      if (!existing) return res.status(404).json({ error: 'not found' });
      await deleteReportPdf(existing.pdf_cloudinary_id);
      await db.execute({ sql: 'DELETE FROM reports WHERE id = ?', args: [id] });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
}

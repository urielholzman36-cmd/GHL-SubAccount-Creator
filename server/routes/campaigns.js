import { Router } from 'express';
import * as socialQueries from '../db/social-queries.js';
import { SocialRunner } from '../services/social-runner.js';

// ── SSE broadcasting ─────────────────────────────────────────────────────────
const sseClients = new Map(); // campaignId → [res, res, ...]

function broadcastToCampaign(campaignId, data) {
  const clients = sseClients.get(String(campaignId)) || [];
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(message); } catch (_) { /* client disconnected */ }
  }
}

export function createCampaignsRouter(db) {
  const router = Router();

  // GET /client/:clientId — list campaigns for a client
  router.get('/client/:clientId', (req, res) => {
    try {
      const campaigns = socialQueries.listCampaigns(db, req.params.clientId);
      res.json(campaigns);
    } catch (err) {
      res.status(500).json({ error: 'Failed to list campaigns', details: err.message });
    }
  });

  // GET /:id/stream — SSE endpoint for campaign progress
  router.get('/:id/stream', (req, res) => {
    const { id } = req.params;
    const campaign = socialQueries.getCampaign(db, id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Replay current state on connect
    res.write(`data: ${JSON.stringify({
      type: 'state-replay',
      status: campaign.status,
      current_step: campaign.current_step,
    })}\n\n`);

    // If already finished, send final event and close
    if (campaign.status === 'exported') {
      res.write(`data: ${JSON.stringify({ type: 'campaign-complete' })}\n\n`);
      res.end();
      return;
    }

    // Register client for live updates
    const key = String(id);
    if (!sseClients.has(key)) {
      sseClients.set(key, new Set());
    }
    sseClients.get(key).add(res);

    req.on('close', () => {
      const clients = sseClients.get(key);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) sseClients.delete(key);
      }
    });
  });

  // GET /:id/csv — download the generated CSV
  router.get('/:id/csv', (req, res) => {
    const campaign = socialQueries.getCampaign(db, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!campaign.csv_path) return res.status(404).json({ error: 'CSV not ready' });
    res.download(campaign.csv_path);
  });

  // GET /:id — get single campaign with posts
  router.get('/:id', (req, res) => {
    const campaign = socialQueries.getCampaign(db, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const posts = socialQueries.listCampaignPosts(db, campaign.id);
    res.json({ ...campaign, posts });
  });

  // POST / — create a new campaign
  router.post('/', (req, res) => {
    try {
      const id = socialQueries.createCampaign(db, req.body);
      res.status(201).json({ id });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create campaign', details: err.message });
    }
  });

  // POST /:id/start — update brief fields and start the pipeline
  router.post('/:id/start', (req, res) => {
    const { id } = req.params;
    const campaign = socialQueries.getCampaign(db, id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const { month, theme, start_date } = req.body || {};

    // Update brief fields if provided
    if (month) socialQueries.updateCampaignField(db, id, 'month', month);
    if (theme) socialQueries.updateCampaignField(db, id, 'theme', theme);
    if (start_date) socialQueries.updateCampaignField(db, id, 'start_date', start_date);

    // Run pipeline async
    const runner = new SocialRunner(db, (data) => broadcastToCampaign(id, data));
    runner.runFromStep(id, 1).catch((err) => {
      broadcastToCampaign(id, { type: 'campaign-failed', campaignId: id, error: err.message });
    });

    res.json({ ok: true });
  });

  // POST /:id/resume — resume a paused campaign
  router.post('/:id/resume', (req, res) => {
    const { id } = req.params;
    const campaign = socialQueries.getCampaign(db, id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const runner = new SocialRunner(db, (data) => broadcastToCampaign(id, data));
    runner.resume(id, req.body || {}).catch((err) => {
      broadcastToCampaign(id, { type: 'campaign-failed', campaignId: id, error: err.message });
    });

    res.json({ ok: true });
  });

  // POST /:id/manus — update manus_research field
  router.post('/:id/manus', (req, res) => {
    const { id } = req.params;
    const campaign = socialQueries.getCampaign(db, id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    try {
      socialQueries.updateCampaignField(db, id, 'manus_research', req.body.manus_research);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update manus research', details: err.message });
    }
  });

  // POST /:id/retry/:step — retry from a specific step
  router.post('/:id/retry/:step', (req, res) => {
    const { id, step } = req.params;
    const campaign = socialQueries.getCampaign(db, id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const runner = new SocialRunner(db, (data) => broadcastToCampaign(id, data));
    runner.retryFromStep(id, parseInt(step)).catch((err) => {
      broadcastToCampaign(id, { type: 'campaign-failed', campaignId: id, error: err.message });
    });

    res.json({ ok: true });
  });

  // PUT /:id/posts/:postId — update a single post
  router.put('/:id/posts/:postId', (req, res) => {
    try {
      socialQueries.updateCampaignPost(db, req.params.postId, { ...req.body, edited: 1 });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update post', details: err.message });
    }
  });

  // DELETE /:id — delete campaign and its posts
  router.delete('/:id', (req, res) => {
    const { id } = req.params;
    const campaign = socialQueries.getCampaign(db, id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    try {
      socialQueries.deleteCampaign(db, id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete campaign', details: err.message });
    }
  });

  return router;
}

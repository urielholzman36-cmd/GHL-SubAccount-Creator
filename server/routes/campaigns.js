import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as socialQueries from '../db/social-queries.js';
import { SocialRunner } from '../services/social-runner.js';
import { parseManusBundle } from '../services/manus-importer.js';
import { uploadOriginal, buildPublicId } from '../services/social-cloudinary.js';
import { generateMonthlyRecap, recapFilename } from '../services/recap-generator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const UPLOAD_TMP = path.resolve(PROJECT_ROOT, 'data', 'manus-uploads');
fs.mkdirSync(UPLOAD_TMP, { recursive: true });
const uploadBundle = multer({
  dest: UPLOAD_TMP,
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 500 },
}).array('files');

// ── SSE broadcasting ─────────────────────────────────────────────────────────
const sseClients = new Map(); // campaignId → [res, res, ...]
const latestProgress = new Map(); // campaignId → last step-progress event

function broadcastToCampaign(campaignId, data) {
  if (data?.type === 'step-progress') {
    latestProgress.set(String(campaignId), data);
  }
  const clients = sseClients.get(String(campaignId)) || [];
  const message = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(message); } catch (_) { /* client disconnected */ }
  }
}

export function createCampaignsRouter(db) {
  const router = Router();

  // GET /client/:clientId — list campaigns for a client
  router.get('/client/:clientId', async (req, res) => {
    try {
      const campaigns = await socialQueries.listCampaigns(db, req.params.clientId);
      res.json(campaigns);
    } catch (err) {
      res.status(500).json({ error: 'Failed to list campaigns', details: err.message });
    }
  });

  // GET /:id/stream — SSE endpoint for campaign progress
  router.get('/:id/stream', async (req, res) => {
    const { id } = req.params;
    const campaign = await socialQueries.getCampaign(db, id);
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

    // Replay the most recent progress event so the bar shows up on reconnect
    const lastProg = latestProgress.get(String(id));
    if (lastProg) {
      res.write(`data: ${JSON.stringify(lastProg)}\n\n`);
    }

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

  // GET /:id/csv — generate and download CSV on-the-fly (always reflects latest edits)
  router.get('/:id/csv', async (req, res) => {
    const { buildGhlCsv } = await import('../services/social-csv.js');
    const campaign = await socialQueries.getCampaign(db, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const client = await socialQueries.getClient(db, campaign.client_id);
    const posts = await socialQueries.listCampaignPosts(db, campaign.id);
    if (!posts || posts.length === 0) return res.status(404).json({ error: 'No posts to export' });

    const platforms = (() => {
      try { return JSON.parse(client?.platforms || '["facebook","instagram"]'); }
      catch { return ['facebook', 'instagram']; }
    })();

    const csv = buildGhlCsv(posts, client?.posting_time || '09:00:00', platforms);
    const clientName = (client?.name || 'campaign').replace(/[^a-zA-Z0-9]/g, '-');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${clientName}-social-plan.csv"`);
    res.send(csv);
  });

  // GET /:id/images-zip — download all campaign images as ZIP
  router.get('/:id/images-zip', async (req, res) => {
    const { default: archiver } = await import('archiver');
    const fs = await import('fs');
    const path = await import('path');

    const campaign = await socialQueries.getCampaign(db, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const client = await socialQueries.getClient(db, campaign.client_id);
    const posts = await socialQueries.listCampaignPosts(db, campaign.id);
    const imagesFolder = campaign.images_folder;

    if (!imagesFolder || !fs.existsSync(imagesFolder)) {
      return res.status(404).json({ error: 'No images folder found' });
    }

    const clientName = (client?.name || 'campaign').replace(/[^a-zA-Z0-9]/g, '-');
    const zipName = `${clientName}-${campaign.month || 'images'}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);

    // Add each post's images organized by folder
    for (const post of posts) {
      const typeName = post.post_type === 'carousel' ? 'Carousel'
        : post.post_type === 'before_after' ? 'Before_After'
        : 'Single';
      const folderName = `Post_${post.day_number}_${typeName}`;
      const folderPath = path.join(imagesFolder, folderName);

      if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f));
        for (const file of files) {
          archive.file(path.join(folderPath, file), { name: `${folderName}/${file}` });
        }
      }
    }

    await archive.finalize();
  });

  // GET /:id — get single campaign with posts
  router.get('/:id', async (req, res) => {
    const campaign = await socialQueries.getCampaign(db, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const posts = await socialQueries.listCampaignPosts(db, campaign.id);
    res.json({ ...campaign, posts });
  });

  // POST /:id/generate-recap — Mode B end-of-month recap. Pulls current
  // campaign posts + all prior-month recaps for the same client as context
  // so repetition risk is cumulative across months.
  router.post('/:id/generate-recap', async (req, res) => {
    try {
      const { id } = req.params;
      const campaign = await socialQueries.getCampaign(db, id);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      const client = await socialQueries.getClient(db, campaign.client_id);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      const posts = await socialQueries.listCampaignPosts(db, id);
      if (!posts || posts.length === 0) {
        return res.status(400).json({ error: 'Campaign has no posts yet — import Manus delivery first.' });
      }

      // Pull every other campaign for this client that already has a recap on record.
      const priorResult = await db.execute({
        sql: `SELECT id, month, monthly_recap, monthly_recap_generated_at
              FROM campaigns
              WHERE client_id = ? AND id != ? AND monthly_recap IS NOT NULL
              ORDER BY month ASC, id ASC`,
        args: [campaign.client_id, Number(id)],
      });

      const recap = await generateMonthlyRecap({
        client,
        campaign,
        posts,
        priorCampaigns: priorResult.rows,
        apiKey: process.env.ANTHROPIC_API_KEY,
        recapSeed: campaign.recap_seed || null,
      });
      const now = new Date().toISOString();
      await socialQueries.updateCampaignField(db, id, 'monthly_recap', recap);
      await socialQueries.updateCampaignField(db, id, 'monthly_recap_generated_at', now);
      res.json({
        ok: true,
        recap,
        generated_at: now,
        filename: recapFilename(client.name, campaign.month),
        prior_count: priorResult.rows.length,
      });
    } catch (err) {
      console.error('generate-recap failed:', err);
      res.status(500).json({ error: 'Recap generation failed', details: err.message });
    }
  });

  // GET /:id/recap.md — download the Monthly Recap with the correct
  // two-document-model filename: [Client]_monthly_recap_[YYYY_MM].md
  router.get('/:id/recap.md', async (req, res) => {
    const campaign = await socialQueries.getCampaign(db, req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!campaign.monthly_recap) return res.status(404).json({ error: 'No recap generated yet' });
    const client = await socialQueries.getClient(db, campaign.client_id);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${recapFilename(client?.name, campaign.month)}"`);
    res.send(campaign.monthly_recap);
  });

  // POST /:id/import — ingest a Manus bundle (zip or loose files) and create/update posts
  router.post('/:id/import', (req, res) => {
    uploadBundle(req, res, async (uploadErr) => {
      if (uploadErr) {
        return res.status(400).json({ error: 'Upload failed', details: uploadErr.message });
      }
      const { id } = req.params;
      try {
        const campaign = await socialQueries.getCampaign(db, id);
        if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
        const client = await socialQueries.getClient(db, campaign.client_id);

        // 1) Extract bundle into a per-campaign staging dir
        const stagingDir = path.join(PROJECT_ROOT, 'data', 'social', `campaign-${id}`, 'Manus_Import');
        fs.mkdirSync(stagingDir, { recursive: true });
        const files = req.files || [];
        if (files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

        const parsed = parseManusBundle(files, stagingDir);
        if (parsed.posts.length === 0) {
          return res.status(400).json({
            error: 'Could not detect any posts in the upload.',
            unmatched_images: parsed.unmatched_images,
            unmatched_captions: parsed.unmatched_captions,
          });
        }

        // 2) Upload each slide to Cloudinary AS-IS. No watermark, no resize,
        //    no recompression — Manus delivers final assets with the brand
        //    lockup already composed in and at the correct aspect ratio.
        const clientFolder = (client?.cloudinary_folder || client?.name || `client-${campaign.client_id}`)
          .toString().replace(/[^a-zA-Z0-9]/g, '-');

        async function processSlide(filePath, day, slideIdx) {
          const raw = fs.readFileSync(filePath);
          const publicId = buildPublicId(clientFolder, day, slideIdx);
          return uploadOriginal(raw, publicId);
        }

        // 3) Create / update campaign_posts
        // For simplicity, wipe existing posts for this campaign before import
        await db.execute({ sql: 'DELETE FROM campaign_posts WHERE campaign_id = ?', args: [id] });

        const startDate = campaign.start_date ? new Date(campaign.start_date) : new Date();

        for (const p of parsed.posts) {
          const urls = [];
          for (let i = 0; i < p.files.length; i++) {
            const slideIdx = p.files.length === 1 ? 0 : i + 1;
            try {
              const url = await processSlide(p.files[i], p.day_number, slideIdx);
              urls.push(url);
            } catch (err) {
              console.error(`[import] slide upload failed (day ${p.day_number} slide ${i}):`, err.message);
            }
          }

          const postDate = new Date(startDate);
          postDate.setDate(startDate.getDate() + (p.day_number - 1));
          const postDateStr = postDate.toISOString().split('T')[0];

          await socialQueries.createCampaignPost(db, {
            campaign_id: Number(id),
            day_number: p.day_number,
            post_date: postDateStr,
            pillar: p.pillar || null,
            post_type: p.post_type || 'single',
            concept: p.concept || null,
            caption: p.caption || null,
            hashtags: p.hashtags || null,
            cta: p.cta || null,
            visual_prompt: null,
            image_urls: JSON.stringify(urls),
            slide_count: urls.length || p.files.length,
            category: p.category || null,
            edited: 0,
          });
        }

        await socialQueries.updateCampaignField(db, id, 'status', 'review_final');
        await socialQueries.updateCampaignField(db, id, 'current_step', 7);

        // Capture Manus's recap seed notes for later use when generating the Monthly Recap
        if (parsed.recap_seed) {
          await socialQueries.updateCampaignField(db, id, 'recap_seed', parsed.recap_seed);
        }

        res.json({
          ok: true,
          source: parsed.source,
          created: parsed.posts.length,
          unmatched_images: parsed.unmatched_images,
          unmatched_captions: parsed.unmatched_captions,
          missing_files: parsed.missing_files,
          other_files: parsed.other_files,
          recap_seed_captured: !!parsed.recap_seed,
        });
      } catch (err) {
        console.error('import failed:', err);
        res.status(500).json({ error: 'Import failed', details: err.message });
      }
    });
  });

  // POST / — create a new campaign (inherits content strategy defaults from the client)
  router.post('/', async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.client_id) {
        const client = await socialQueries.getClient(db, body.client_id);
        if (client) {
          // Seed campaign-level strategy from client defaults so each campaign
          // can be tuned independently without touching the client profile.
          if (body.content_pillars == null) body.content_pillars = client.content_pillars;
          if (body.hashtag_bank == null)    body.hashtag_bank = client.hashtag_bank;
          if (body.cta_style == null)       body.cta_style = client.cta_style;
          if (body.platforms == null)       body.platforms = client.platforms;
        }
      }
      const id = await socialQueries.createCampaign(db, body);
      res.status(201).json({ id });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create campaign', details: err.message });
    }
  });

  // PATCH /:id — update brief fields without running the pipeline
  router.patch('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const campaign = await socialQueries.getCampaign(db, id);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      const allowed = [
        'month', 'theme', 'start_date', 'post_count',
        'content_pillars', 'hashtag_bank', 'cta_style', 'platforms',
        'manus_research',
      ];
      for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
          await socialQueries.updateCampaignField(db, id, key, req.body[key]);
        }
      }
      const updated = await socialQueries.getCampaign(db, id);
      res.json(updated);
    } catch (err) {
      console.error('patch campaign failed:', err);
      res.status(500).json({ error: 'Update failed', details: err.message });
    }
  });

  // POST /:id/start — update brief fields and start the pipeline
  router.post('/:id/start', async (req, res) => {
    const { id } = req.params;
    const campaign = await socialQueries.getCampaign(db, id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const {
      month, theme, start_date, post_count,
      content_pillars, hashtag_bank, cta_style, platforms,
    } = req.body || {};

    // Update brief fields if provided
    if (month) await socialQueries.updateCampaignField(db, id, 'month', month);
    if (theme) await socialQueries.updateCampaignField(db, id, 'theme', theme);
    if (start_date) await socialQueries.updateCampaignField(db, id, 'start_date', start_date);
    if (post_count) await socialQueries.updateCampaignField(db, id, 'post_count', post_count);
    if (req.body && req.body.manus_research) await socialQueries.updateCampaignField(db, id, 'manus_research', req.body.manus_research);

    // Campaign-level content strategy overrides
    if (content_pillars != null) await socialQueries.updateCampaignField(db, id, 'content_pillars', content_pillars);
    if (hashtag_bank != null)    await socialQueries.updateCampaignField(db, id, 'hashtag_bank', hashtag_bank);
    if (cta_style != null)       await socialQueries.updateCampaignField(db, id, 'cta_style', cta_style);
    if (platforms != null)       await socialQueries.updateCampaignField(db, id, 'platforms', platforms);

    // Run pipeline async
    const runner = new SocialRunner(db, (data) => broadcastToCampaign(id, data));
    runner.runFromStep(id, 1).catch((err) => {
      broadcastToCampaign(id, { type: 'campaign-failed', campaignId: id, error: err.message });
    });

    res.json({ ok: true });
  });

  // POST /:id/resume — resume a paused campaign
  router.post('/:id/resume', async (req, res) => {
    const { id } = req.params;
    const campaign = await socialQueries.getCampaign(db, id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const runner = new SocialRunner(db, (data) => broadcastToCampaign(id, data));
    runner.resume(id, req.body || {}).catch((err) => {
      broadcastToCampaign(id, { type: 'campaign-failed', campaignId: id, error: err.message });
    });

    res.json({ ok: true });
  });

  // POST /:id/manus — update manus_research field
  router.post('/:id/manus', async (req, res) => {
    const { id } = req.params;
    const campaign = await socialQueries.getCampaign(db, id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    try {
      await socialQueries.updateCampaignField(db, id, 'manus_research', req.body.manus_research);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update manus research', details: err.message });
    }
  });

  // POST /:id/retry/:step — retry from a specific step
  router.post('/:id/retry/:step', async (req, res) => {
    const { id, step } = req.params;
    const campaign = await socialQueries.getCampaign(db, id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const runner = new SocialRunner(db, (data) => broadcastToCampaign(id, data));
    runner.retryFromStep(id, parseInt(step)).catch((err) => {
      broadcastToCampaign(id, { type: 'campaign-failed', campaignId: id, error: err.message });
    });

    res.json({ ok: true });
  });

  // PUT /:id/posts/:postId — update a single post
  router.put('/:id/posts/:postId', async (req, res) => {
    try {
      await socialQueries.updateCampaignPost(db, req.params.postId, { ...req.body, edited: 1 });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update post', details: err.message });
    }
  });

  // DELETE /:id — delete campaign and its posts
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const campaign = await socialQueries.getCampaign(db, id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    try {
      await socialQueries.deleteCampaign(db, id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete campaign', details: err.message });
    }
  });

  return router;
}

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as queries from '../db/queries.js';
import { BuildRunner } from '../services/build-runner.js';
import { GhlApi } from '../services/ghl-api.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function slugify(s) {
  return String(s || 'build').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'build';
}

function uploadLogoBufferToCloudinary(buffer, slug) {
  const publicId = `vo360-logos/${slug}-${Date.now()}`;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: 'image', overwrite: true },
      (err, result) => err ? reject(err) : resolve(result.secure_url),
    );
    stream.end(buffer);
  });
}

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported logo type: ${file.mimetype}`));
  },
}).single('logo');

// Map of buildId -> Set of SSE response objects
const sseClients = new Map();

function sendSseEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastToBuild(buildId, event, data) {
  const clients = sseClients.get(buildId);
  if (!clients) return;
  for (const res of clients) {
    try {
      sendSseEvent(res, event, data);
    } catch (_) {
      // client disconnected
    }
  }
}

function runnerEmit(buildId) {
  return (event) => {
    const { type, ...rest } = event;
    if (!type) return;
    broadcastToBuild(buildId, type, rest);
  };
}

const VALID_INDUSTRIES = ['construction', 'plumbing', 'electrical', 'cleaning', 'general'];

function validateBuild(body) {
  const errors = [];
  const required = [
    'business_name', 'business_email', 'business_phone',
    'industry', 'timezone', 'owner_first_name', 'owner_last_name', 'area_code',
  ];

  for (const field of required) {
    if (!body[field] || String(body[field]).trim() === '') {
      errors.push(`${field} is required`);
    }
  }

  if (body.business_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.business_email)) {
    errors.push('business_email is not a valid email address');
  }

  if (body.business_phone) {
    const digits = body.business_phone.replace(/\D/g, '');
    if (digits.length < 10) {
      errors.push('business_phone must contain at least 10 digits');
    }
  }

  if (body.area_code && !/^\d{3}$/.test(String(body.area_code).trim())) {
    errors.push('area_code must be exactly 3 digits');
  }

  if (body.website_url && body.website_url.trim() !== '') {
    try {
      new URL(body.website_url);
    } catch (_) {
      errors.push('website_url must be a valid URL');
    }
  }

  if (body.industry && !VALID_INDUSTRIES.includes(body.industry)) {
    errors.push(`industry must be one of: ${VALID_INDUSTRIES.join(', ')}`);
  }

  return errors;
}

export function createBuildsRouter(db) {
  const router = Router();

  // POST / — create a new build (multipart)
  router.post('/', (req, res) => {
    req.buildId = uuidv4();

    uploadLogo(req, res, async (uploadErr) => {
      if (uploadErr) {
        return res.status(400).json({ error: 'Logo upload failed', details: uploadErr.message });
      }

      const body = req.body || {};

      let brandColorsJson = null;
      if (body.brand_colors) {
        try {
          const parsed = JSON.parse(body.brand_colors);
          if (Array.isArray(parsed)) brandColorsJson = JSON.stringify(parsed);
        } catch (_) {
          return res.status(400).json({ error: 'brand_colors must be a JSON array of hex strings' });
        }
      }

      // Rich brand-analysis fields carried over from the client (optional).
      let brandPaletteJson = null;
      if (body.brand_palette_json) {
        try {
          const parsed = typeof body.brand_palette_json === 'string'
            ? JSON.parse(body.brand_palette_json)
            : body.brand_palette_json;
          if (parsed && typeof parsed === 'object') brandPaletteJson = JSON.stringify(parsed);
        } catch (_) {
          // Non-fatal: drop it silently rather than failing the build submission.
          brandPaletteJson = null;
        }
      }
      let industryCuesJson = null;
      if (body.industry_cues_json) {
        try {
          const parsed = typeof body.industry_cues_json === 'string'
            ? JSON.parse(body.industry_cues_json)
            : body.industry_cues_json;
          if (Array.isArray(parsed)) industryCuesJson = JSON.stringify(parsed);
        } catch (_) {
          industryCuesJson = null;
        }
      }
      const brandPersonality = (body.brand_personality || '').toString().trim() || null;
      const brandMoodDescription = (body.brand_mood_description || '').toString().trim() || null;
      const recommendedSurfaceStyle = (body.recommended_surface_style || '').toString().trim() || null;

      const errors = validateBuild(body);
      if (!body.industry_text || !String(body.industry_text).trim()) {
        errors.push('industry_text is required');
      }
      if (!body.business_description || !String(body.business_description).trim()) {
        errors.push('business_description is required');
      }
      if (!body.target_audience || !String(body.target_audience).trim()) {
        errors.push('target_audience is required');
      }
      if (!req.file) {
        errors.push('logo file is required');
      }
      if (errors.length > 0) {
        return res.status(400).json({ message: errors.join('. ') });
      }

      const id = req.buildId;
      const build = {
        id,
        business_name: body.business_name.trim(),
        business_email: body.business_email.trim(),
        business_phone: body.business_phone.trim(),
        address: body.address?.trim() || '',
        city: body.city?.trim() || '',
        state: body.state?.trim() || '',
        zip: body.zip?.trim() || '',
        country: body.country?.trim() || 'US',
        industry: body.industry || 'general',
        timezone: body.timezone.trim(),
        owner_first_name: body.owner_first_name.trim(),
        owner_last_name: body.owner_last_name.trim(),
        area_code: String(body.area_code).trim(),
        website_url: body.website_url?.trim() || null,
      };

      try {
        await queries.insertBuild(db, build);
        await queries.createBuildSteps(db, id);

        let logoPath = null;
        if (req.file) {
          try {
            logoPath = await uploadLogoBufferToCloudinary(req.file.buffer, slugify(build.business_name));
          } catch (err) {
            console.error(`[build ${id}] cloudinary logo upload failed:`, err.message);
            throw new Error('Logo upload failed — check Cloudinary credentials');
          }
        }
        await db.execute({
          sql: `UPDATE builds SET industry_text = ?, business_description = ?, target_audience = ?, logo_path = ?, brand_colors = ?,
                brand_palette_json = ?, brand_personality = ?, brand_mood_description = ?, industry_cues_json = ?, recommended_surface_style = ?
                WHERE id = ?`,
          args: [
            body.industry_text.trim(),
            (body.business_description || '').trim(),
            body.target_audience.trim(),
            logoPath,
            brandColorsJson,
            brandPaletteJson,
            brandPersonality,
            brandMoodDescription,
            industryCuesJson,
            recommendedSurfaceStyle,
            id,
          ],
        });

        // Auto-extract palette from the uploaded logo if no colors were provided.
        // This makes the 10Web prompt concrete (hex codes) instead of generic.
        if (!brandColorsJson && req.file) {
          try {
            const { extractPalette } = await import('../services/brand-analyzer.js');
            const palette = await extractPalette(req.file.buffer);
            if (Array.isArray(palette) && palette.length > 0) {
              await db.execute({
                sql: 'UPDATE builds SET brand_colors = ? WHERE id = ?',
                args: [JSON.stringify(palette), id],
              });
              console.log(`[build ${id}] auto-extracted palette: ${palette.join(', ')}`);
            }
          } catch (err) {
            console.error(`[build ${id}] palette extraction failed (non-blocking):`, err.message);
          }
        }
      } catch (err) {
        return res.status(500).json({ error: 'Failed to create build record', details: err.message });
      }

      const ghl = new GhlApi(process.env.GHL_AGENCY_API_KEY);
      const runner = new BuildRunner(db, ghl);
      const emit = runnerEmit(id);

      runner.run(id, emit).then(async () => {
        const finalBuild = await queries.getBuildById(db, id);
        if (finalBuild.status === 'completed') {
          broadcastToBuild(id, 'build-complete', { id });
        } else if (finalBuild.status === 'paused') {
          // pause event already broadcast by runner
        } else {
          const steps = await queries.getBuildSteps(db, id);
          const failedStep = steps.find((s) => s.status === 'failed');
          broadcastToBuild(id, 'build-failed', {
            id,
            failedStep: failedStep || null,
          });
        }
      }).catch(async () => {
        const steps = await queries.getBuildSteps(db, id);
        const failedStep = steps.find((s) => s.status === 'failed');
        broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
      });

      res.status(201).json({ id });
    });
  });

  // GET /:id/stream — SSE stream for a build
  router.get('/:id/stream', async (req, res) => {
    const { id } = req.params;
    const build = await queries.getBuildById(db, id);
    if (!build) {
      return res.status(404).json({ error: 'Build not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Replay current state of all steps
    const steps = await queries.getBuildSteps(db, id);
    for (const step of steps) {
      sendSseEvent(res, 'step-update', {
        step: step.step_number,
        status: step.status,
        duration_ms: step.duration_ms,
        error: step.error_message,
      });
    }

    // If already finished, send final event and close
    if (build.status === 'completed') {
      sendSseEvent(res, 'build-complete', { id });
      res.end();
      return;
    }

    if (build.status === 'failed') {
      const failedStep = steps.find((s) => s.status === 'failed');
      sendSseEvent(res, 'build-failed', { id, failedStep: failedStep || null });
      res.end();
      return;
    }

    if (build.status === 'paused') {
      sendSseEvent(res, 'build-paused', {
        step: build.paused_at_step,
        context: build.pause_context ? JSON.parse(build.pause_context) : null,
      });
      // Keep connection open so client receives live updates after resume
    }

    // Register client for live updates
    if (!sseClients.has(id)) {
      sseClients.set(id, new Set());
    }
    sseClients.get(id).add(res);

    req.on('close', () => {
      const clients = sseClients.get(id);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
          sseClients.delete(id);
        }
      }
    });
  });

  // GET /:id — get single build with steps
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const build = await queries.getBuildById(db, id);
    if (!build) {
      return res.status(404).json({ error: 'Build not found' });
    }
    const steps = await queries.getBuildSteps(db, id);
    res.json({ ...build, steps });
  });

  // GET / — list builds (paginated, filterable)
  router.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 20;
    const search = req.query.search || '';
    const industry = req.query.industry || '';
    const status = req.query.status || '';

    const result = await queries.listBuilds(db, { page, perPage, search, industry, status });
    res.json(result);
  });

  // POST /:id/retry/:step — retry a failed build from a specific step
  router.post('/:id/retry/:step', async (req, res) => {
    const { id, step } = req.params;
    const stepNumber = parseInt(step);

    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 10) {
      return res.status(400).json({ error: 'step must be a number between 1 and 10' });
    }

    const build = await queries.getBuildById(db, id);
    if (!build) {
      return res.status(404).json({ error: 'Build not found' });
    }

    if (build.status !== 'failed') {
      return res.status(400).json({ error: 'Build must be in failed status to retry' });
    }

    const ghl = new GhlApi(process.env.GHL_AGENCY_API_KEY);
    const runner = new BuildRunner(db, ghl);
    const emit = runnerEmit(id);

    runner.retryFromStep(id, stepNumber, emit).then(async () => {
      const finalBuild = await queries.getBuildById(db, id);
      if (finalBuild.status === 'completed') {
        broadcastToBuild(id, 'build-complete', { id });
      } else if (finalBuild.status === 'paused') {
        // pause event already broadcast
      } else {
        const steps = await queries.getBuildSteps(db, id);
        const failedStep = steps.find((s) => s.status === 'failed');
        broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
      }
    }).catch(async () => {
      const steps = await queries.getBuildSteps(db, id);
      const failedStep = steps.find((s) => s.status === 'failed');
      broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
    });

    res.json({ ok: true, id, retryingFromStep: stepNumber });
  });

  // POST /:id/resume — resume a paused build
  router.post('/:id/resume', async (req, res) => {
    const { id } = req.params;
    const build = await queries.getBuildById(db, id);
    if (!build) return res.status(404).json({ error: 'Build not found' });
    if (build.status !== 'paused') {
      return res.status(400).json({ error: 'Build is not paused' });
    }

    const ghl = new GhlApi(process.env.GHL_AGENCY_API_KEY);
    const runner = new BuildRunner(db, ghl);
    const emit = runnerEmit(id);

    runner.resume(id, req.body || {}, emit).then(async () => {
      const finalBuild = await queries.getBuildById(db, id);
      if (finalBuild.status === 'completed') {
        broadcastToBuild(id, 'build-complete', { id });
      } else if (finalBuild.status === 'failed') {
        const steps = await queries.getBuildSteps(db, id);
        const failedStep = steps.find((s) => s.status === 'failed');
        broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
      }
    }).catch(async () => {
      const steps = await queries.getBuildSteps(db, id);
      const failedStep = steps.find((s) => s.status === 'failed');
      broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
    });

    res.status(202).json({ ok: true, id });
  });

  // POST /:id/skip-website — skip website setup steps and complete the build
  router.post('/:id/skip-website', async (req, res) => {
    const { id } = req.params;
    const build = await queries.getBuildById(db, id);
    if (!build) return res.status(404).json({ error: 'Build not found' });
    if (build.status !== 'paused') {
      return res.status(400).json({ error: 'Build is not paused' });
    }

    // Mark all remaining steps (3-10) as skipped
    const steps = await queries.getBuildSteps(db, id);
    for (const step of steps) {
      if (step.step_number >= 3 && step.status !== 'completed') {
        await db.execute({
          sql: `UPDATE build_steps SET status = 'skipped', completed_at = datetime('now') WHERE build_id = ? AND step_number = ?`,
          args: [id, step.step_number],
        });
        broadcastToBuild(id, 'step-update', {
          step: step.step_number,
          status: 'skipped',
        });
      }
    }

    // Clear pause state and mark build as completed
    await queries.clearPauseState(db, id);
    await queries.updateBuildStatus(db, id, 'completed', null);
    broadcastToBuild(id, 'build-complete', { id });

    res.json({ ok: true, id, skipped: true });
  });

  // DELETE /:id — delete a build and its steps
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const build = await queries.getBuildById(db, id);
    if (!build) return res.status(404).json({ error: 'Build not found' });

    // Try to delete the GHL sub-account if one was created
    if (build.location_id) {
      try {
        const ghl = new GhlApi(process.env.GHL_AGENCY_API_KEY);
        await ghl.request('DELETE', `/locations/${build.location_id}`);
      } catch (_) {
        // Best-effort — sub-account may already be gone
      }
    }

    // Delete logo file if exists
    if (build.logo_path) {
      const logoFullPath = path.resolve(__dirname, '../..', build.logo_path);
      try { fs.unlinkSync(logoFullPath); } catch (_) {}
    }

    await db.execute({ sql: 'DELETE FROM build_steps WHERE build_id = ?', args: [id] });
    await db.execute({ sql: 'DELETE FROM builds WHERE id = ?', args: [id] });

    res.json({ ok: true, deleted: id });
  });

  return router;
}

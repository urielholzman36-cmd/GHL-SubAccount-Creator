import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as queries from '../db/queries.js';
import { BuildRunner } from '../services/build-runner.js';
import { GhlApi } from '../services/ghl-api.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = path.resolve(__dirname, '../../data/logos');
if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, LOGOS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${req.buildId}${ext}`);
  },
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
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

      const errors = validateBuild(body);
      if (!body.industry_text || !String(body.industry_text).trim()) {
        errors.push('industry_text is required');
      }
      if (!body.target_audience || !String(body.target_audience).trim()) {
        errors.push('target_audience is required');
      }
      if (!req.file) {
        errors.push('logo file is required');
      }
      if (errors.length > 0) {
        return res.status(400).json({ error: 'Validation failed', details: errors });
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
        queries.insertBuild(db, build);
        queries.createBuildSteps(db, id);

        const logoPath = req.file ? path.relative(path.resolve(__dirname, '../..'), req.file.path) : null;
        db.prepare(
          `UPDATE builds SET industry_text = ?, target_audience = ?, logo_path = ?, brand_colors = ? WHERE id = ?`
        ).run(
          body.industry_text.trim(),
          body.target_audience.trim(),
          logoPath,
          brandColorsJson,
          id
        );
      } catch (err) {
        return res.status(500).json({ error: 'Failed to create build record', details: err.message });
      }

      const ghl = new GhlApi(process.env.GHL_AGENCY_API_KEY);
      const runner = new BuildRunner(db, ghl);
      const emit = runnerEmit(id);

      runner.run(id, emit).then(() => {
        const finalBuild = queries.getBuildById(db, id);
        if (finalBuild.status === 'completed') {
          broadcastToBuild(id, 'build-complete', { id });
        } else if (finalBuild.status === 'paused') {
          // pause event already broadcast by runner
        } else {
          const steps = queries.getBuildSteps(db, id);
          const failedStep = steps.find((s) => s.status === 'failed');
          broadcastToBuild(id, 'build-failed', {
            id,
            failedStep: failedStep || null,
          });
        }
      }).catch(() => {
        const steps = queries.getBuildSteps(db, id);
        const failedStep = steps.find((s) => s.status === 'failed');
        broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
      });

      res.status(201).json({ id });
    });
  });

  // GET /:id/stream — SSE stream for a build
  router.get('/:id/stream', (req, res) => {
    const { id } = req.params;
    const build = queries.getBuildById(db, id);
    if (!build) {
      return res.status(404).json({ error: 'Build not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Replay current state of all steps
    const steps = queries.getBuildSteps(db, id);
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
  router.get('/:id', (req, res) => {
    const { id } = req.params;
    const build = queries.getBuildById(db, id);
    if (!build) {
      return res.status(404).json({ error: 'Build not found' });
    }
    const steps = queries.getBuildSteps(db, id);
    res.json({ ...build, steps });
  });

  // GET / — list builds (paginated, filterable)
  router.get('/', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 20;
    const search = req.query.search || '';
    const industry = req.query.industry || '';
    const status = req.query.status || '';

    const result = queries.listBuilds(db, { page, perPage, search, industry, status });
    res.json(result);
  });

  // POST /:id/retry/:step — retry a failed build from a specific step
  router.post('/:id/retry/:step', async (req, res) => {
    const { id, step } = req.params;
    const stepNumber = parseInt(step);

    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 3) {
      return res.status(400).json({ error: 'step must be a number between 1 and 3' });
    }

    const build = queries.getBuildById(db, id);
    if (!build) {
      return res.status(404).json({ error: 'Build not found' });
    }

    if (build.status !== 'failed') {
      return res.status(400).json({ error: 'Build must be in failed status to retry' });
    }

    const ghl = new GhlApi(process.env.GHL_AGENCY_API_KEY);
    const runner = new BuildRunner(db, ghl);
    const emit = runnerEmit(id);

    runner.retryFromStep(id, stepNumber, emit).then(() => {
      const finalBuild = queries.getBuildById(db, id);
      if (finalBuild.status === 'completed') {
        broadcastToBuild(id, 'build-complete', { id });
      } else if (finalBuild.status === 'paused') {
        // pause event already broadcast
      } else {
        const steps = queries.getBuildSteps(db, id);
        const failedStep = steps.find((s) => s.status === 'failed');
        broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
      }
    }).catch(() => {
      const steps = queries.getBuildSteps(db, id);
      const failedStep = steps.find((s) => s.status === 'failed');
      broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
    });

    res.json({ ok: true, id, retryingFromStep: stepNumber });
  });

  // POST /:id/resume — resume a paused build
  router.post('/:id/resume', async (req, res) => {
    const { id } = req.params;
    const build = queries.getBuildById(db, id);
    if (!build) return res.status(404).json({ error: 'Build not found' });
    if (build.status !== 'paused') {
      return res.status(400).json({ error: 'Build is not paused' });
    }

    const ghl = new GhlApi(process.env.GHL_AGENCY_API_KEY);
    const runner = new BuildRunner(db, ghl);
    const emit = runnerEmit(id);

    runner.resume(id, req.body || {}, emit).then(() => {
      const finalBuild = queries.getBuildById(db, id);
      if (finalBuild.status === 'completed') {
        broadcastToBuild(id, 'build-complete', { id });
      } else if (finalBuild.status === 'failed') {
        const steps = queries.getBuildSteps(db, id);
        const failedStep = steps.find((s) => s.status === 'failed');
        broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
      }
    }).catch(() => {
      const steps = queries.getBuildSteps(db, id);
      const failedStep = steps.find((s) => s.status === 'failed');
      broadcastToBuild(id, 'build-failed', { id, failedStep: failedStep || null });
    });

    res.status(202).json({ ok: true, id });
  });

  return router;
}

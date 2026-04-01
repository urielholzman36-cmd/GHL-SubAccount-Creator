import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as queries from '../db/queries.js';
import { BuildRunner } from '../services/build-runner.js';
import { GhlApi } from '../services/ghl-api.js';

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

  // POST / — create a new build
  router.post('/', async (req, res) => {
    const errors = validateBuild(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const id = uuidv4();
    const build = {
      id,
      business_name: req.body.business_name.trim(),
      business_email: req.body.business_email.trim(),
      business_phone: req.body.business_phone.trim(),
      address: req.body.address?.trim() || '',
      city: req.body.city?.trim() || '',
      state: req.body.state?.trim() || '',
      zip: req.body.zip?.trim() || '',
      country: req.body.country?.trim() || 'US',
      industry: req.body.industry,
      timezone: req.body.timezone.trim(),
      owner_first_name: req.body.owner_first_name.trim(),
      owner_last_name: req.body.owner_last_name.trim(),
      area_code: String(req.body.area_code).trim(),
      website_url: req.body.website_url?.trim() || null,
    };

    try {
      queries.insertBuild(db, build);
      queries.createBuildSteps(db, id);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create build record', details: err.message });
    }

    // Start BuildRunner asynchronously
    const ghl = new GhlApi(process.env.GHL_AGENCY_API_KEY);
    const runner = new BuildRunner(db, ghl);

    const emit = (event) => {
      broadcastToBuild(id, 'step-update', event);
    };

    runner.run(id, emit).then(() => {
      const finalBuild = queries.getBuildById(db, id);
      if (finalBuild.status === 'completed') {
        broadcastToBuild(id, 'build-complete', { id });
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
        stepNumber: step.step_number,
        status: step.status,
        durationMs: step.duration_ms,
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

    if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 6) {
      return res.status(400).json({ error: 'step must be a number between 1 and 6' });
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

    const emit = (event) => {
      broadcastToBuild(id, 'step-update', event);
    };

    runner.retryFromStep(id, stepNumber, emit).then(() => {
      const finalBuild = queries.getBuildById(db, id);
      if (finalBuild.status === 'completed') {
        broadcastToBuild(id, 'build-complete', { id });
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

  return router;
}

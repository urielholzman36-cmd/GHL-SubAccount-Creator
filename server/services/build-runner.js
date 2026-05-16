import * as queries from '../db/queries.js';
import { PHASES, getPhaseForStep, isStepOptional } from './phases.config.js';

const DEFAULT_BACKOFF_MS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

const COUNTRY_ISO_MAP = {
  'united states': 'US',
  'united states of america': 'US',
  'usa': 'US',
  'u.s.': 'US',
  'u.s.a.': 'US',
  'america': 'US',
  'canada': 'CA',
  'mexico': 'MX',
  'united kingdom': 'GB',
  'uk': 'GB',
  'great britain': 'GB',
};

function normalizeCountry(value) {
  if (!value) return 'US';
  const trimmed = String(value).trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return COUNTRY_ISO_MAP[trimmed.toLowerCase()] || trimmed;
}

export const SNAPSHOT_ID = 'SnbFmqepikqgzI5tgEZ6';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BuildRunner {
  constructor(db, ghl, options = {}) {
    this.db = db;
    this.ghl = ghl;
    this.backoffMs = options.backoffMs || DEFAULT_BACKOFF_MS;
  }

  async run(buildId, emit) {
    const build = await queries.getBuildById(this.db, buildId);
    if (!build) throw new Error(`Build not found: ${buildId}`);
    await queries.updateBuildStatus(this.db, buildId, 'running');
    const startTime = Date.now();
    await this._runFromStep(build, 1, startTime, emit);
  }

  async retryFromStep(buildId, fromStep, emit) {
    const build = await queries.getBuildById(this.db, buildId);
    if (!build) throw new Error(`Build not found: ${buildId}`);
    await queries.updateBuildStatus(this.db, buildId, 'running');
    const startTime = Date.now();

    const steps = await queries.getBuildSteps(this.db, buildId);
    for (const step of steps) {
      if (step.step_number >= fromStep) {
        await this.db.execute({
          sql: `UPDATE build_steps SET status = 'pending', started_at = NULL, completed_at = NULL,
           duration_ms = NULL, error_message = NULL, api_response = NULL, retry_count = 0
           WHERE build_id = ? AND step_number = ?`,
          args: [buildId, step.step_number],
        });
      }
    }
    await this._runFromStep(build, fromStep, startTime, emit);
  }

  async _runFromStep(build, fromStep, startTime, emit) {
    const state = await this._getStateFromPriorSteps(build.id, fromStep);

    try {
      for (const phase of PHASES) {
        const phaseSteps = phase.steps.filter((s) => s.number >= fromStep);
        if (phaseSteps.length === 0) continue;

        emit({ type: 'phase-start', phase: phase.id, name: phase.name });

        for (const step of phaseSteps) {
          await this._executeStep(build, step.number, state, emit);
        }

        emit({ type: 'phase-complete', phase: phase.id });
      }

      await queries.updateBuildStatus(this.db, build.id, 'completed', Date.now() - startTime);
    } catch (err) {
      await queries.updateBuildStatus(this.db, build.id, 'failed', Date.now() - startTime);
    }
  }

  async _executeStep(build, stepNumber, state, emit) {
    const buildId = build.id;
    const optional = isStepOptional(stepNumber);

    await queries.updateStepStatus(this.db, buildId, stepNumber, 'running');
    emit({ type: 'step-update', step: stepNumber, status: 'running' });

    const stepStart = Date.now();
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await queries.incrementStepRetry(this.db, buildId, stepNumber);
        const delay = this.backoffMs[attempt - 1] ?? this.backoffMs[this.backoffMs.length - 1];
        await sleep(delay);
      }

      try {
        const result = await this._runStepLogic(build, stepNumber, state);
        Object.assign(state, result);
        const durationMs = Date.now() - stepStart;
        await queries.updateStepStatus(
          this.db, buildId, stepNumber, 'completed', durationMs, null, JSON.stringify(result)
        );
        emit({ type: 'step-update', step: stepNumber, status: 'completed', duration_ms: durationMs });
        return;
      } catch (err) {
        lastError = err;
        if (err.skipRetry) break;
      }
    }

    const durationMs = Date.now() - stepStart;
    const errMsg = lastError?.message ?? 'Unknown error';

    if (optional) {
      await queries.updateStepStatus(
        this.db, buildId, stepNumber, 'warning', durationMs, errMsg, null
      );
      emit({
        type: 'step-update',
        step: stepNumber,
        status: 'warning',
        duration_ms: durationMs,
        error: errMsg,
      });
      return;
    }

    await queries.updateStepStatus(
      this.db, buildId, stepNumber, 'failed', durationMs, errMsg, null
    );
    emit({ type: 'step-update', step: stepNumber, status: 'failed', error: errMsg });
    throw lastError;
  }

  async _runStepLogic(build, stepNumber, state) {
    const freshBuild = await queries.getBuildById(this.db, build.id) || build;
    switch (stepNumber) {
      case 1: return await this._step1CreateLocation(freshBuild);
      default: throw new Error(`Unknown step number: ${stepNumber}`);
    }
  }

  async _step1CreateLocation(build) {
    const locationData = {
      name: build.business_name,
      email: build.business_email,
      phone: build.business_phone,
      address: build.address,
      city: build.city,
      state: build.state,
      postalCode: build.zip,
      country: normalizeCountry(build.country),
      timezone: build.timezone,
      website: build.website_url,
      snapshotId: SNAPSHOT_ID,
    };

    const response = await this.ghl.createLocation(locationData);
    const locationId = response.location.id;
    await queries.updateBuildLocationId(this.db, build.id, locationId);
    return { locationId };
  }

  async _getStateFromPriorSteps(buildId, fromStep) {
    const build = await queries.getBuildById(this.db, buildId);
    const state = {};

    if (build.location_id) {
      state.locationId = build.location_id;
    }

    if (fromStep <= 1) return state;

    const steps = await queries.getBuildSteps(this.db, buildId);
    for (const step of steps) {
      if (step.step_number < fromStep && step.status === 'completed' && step.api_response) {
        try {
          const data = JSON.parse(step.api_response);
          Object.assign(state, data);
        } catch (_) {
        }
      }
    }

    return state;
  }
}

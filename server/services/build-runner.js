import * as queries from '../db/queries.js';
import { PHASES, getPhaseForStep, isStepOptional } from './phases.config.js';

const DEFAULT_BACKOFF_MS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

export const SNAPSHOT_ID = '4XHJuEPYsk1xeUKcmrL9';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Signal thrown by a step when it needs to pause for manual input.
 * The runner catches it, persists pause state, and exits cleanly.
 */
export class PauseSignal {
  constructor(stepNumber, context) {
    this.stepNumber = stepNumber;
    this.context = context;
    this.isPauseSignal = true;
  }
}

export class BuildRunner {
  constructor(db, ghl, options = {}) {
    this.db = db;
    this.ghl = ghl;
    this.backoffMs = options.backoffMs || DEFAULT_BACKOFF_MS;
  }

  async run(buildId, emit) {
    const build = queries.getBuildById(this.db, buildId);
    if (!build) throw new Error(`Build not found: ${buildId}`);
    queries.updateBuildStatus(this.db, buildId, 'running');
    const startTime = Date.now();
    await this._runFromStep(build, 1, startTime, emit, { resumePayload: null });
  }

  async resume(buildId, resumePayload, emit) {
    const build = queries.getBuildById(this.db, buildId);
    if (!build) throw new Error(`Build not found: ${buildId}`);
    if (build.status !== 'paused') throw new Error(`Build is not paused: ${buildId}`);

    const fromStep = build.paused_at_step;
    queries.clearPauseState(this.db, buildId);
    queries.updateBuildStatus(this.db, buildId, 'running');
    const startTime = Date.now();
    await this._runFromStep(build, fromStep, startTime, emit, { resumePayload });
  }

  async retryFromStep(buildId, fromStep, emit) {
    const build = queries.getBuildById(this.db, buildId);
    if (!build) throw new Error(`Build not found: ${buildId}`);
    queries.updateBuildStatus(this.db, buildId, 'running');
    const startTime = Date.now();

    const steps = queries.getBuildSteps(this.db, buildId);
    for (const step of steps) {
      if (step.step_number >= fromStep) {
        this.db.prepare(
          `UPDATE build_steps SET status = 'pending', started_at = NULL, completed_at = NULL,
           duration_ms = NULL, error_message = NULL, api_response = NULL, retry_count = 0
           WHERE build_id = ? AND step_number = ?`
        ).run(buildId, step.step_number);
      }
    }
    await this._runFromStep(build, fromStep, startTime, emit, { resumePayload: null });
  }

  // ─── Core loop ────────────────────────────────────────────────────────────

  async _runFromStep(build, fromStep, startTime, emit, ctx) {
    const state = await this._getStateFromPriorSteps(build.id, fromStep);

    try {
      for (const phase of PHASES) {
        const phaseSteps = phase.steps.filter((s) => s.number >= fromStep);
        if (phaseSteps.length === 0) continue;

        emit({ type: 'phase-start', phase: phase.id, name: phase.name });

        for (const step of phaseSteps) {
          await this._executeStep(build, step.number, state, emit, ctx);
        }

        emit({ type: 'phase-complete', phase: phase.id });
      }

      queries.updateBuildStatus(this.db, build.id, 'completed', Date.now() - startTime);
    } catch (err) {
      if (err && err.isPauseSignal) {
        queries.setPauseState(this.db, build.id, err.stepNumber, err.context);
        emit({
          type: 'build-paused',
          step: err.stepNumber,
          phase: getPhaseForStep(err.stepNumber),
          context: err.context,
        });
        return;
      }
      queries.updateBuildStatus(this.db, build.id, 'failed', Date.now() - startTime);
    }
  }

  async _executeStep(build, stepNumber, state, emit, ctx) {
    const buildId = build.id;
    const optional = isStepOptional(stepNumber);

    queries.updateStepStatus(this.db, buildId, stepNumber, 'running');
    emit({ type: 'step-update', step: stepNumber, status: 'running' });

    const stepStart = Date.now();
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        queries.incrementStepRetry(this.db, buildId, stepNumber);
        const delay = this.backoffMs[attempt - 1] ?? this.backoffMs[this.backoffMs.length - 1];
        await sleep(delay);
      }

      try {
        const result = await this._runStepLogic(build, stepNumber, state, ctx);
        Object.assign(state, result);
        const durationMs = Date.now() - stepStart;
        queries.updateStepStatus(
          this.db, buildId, stepNumber, 'completed', durationMs, null, JSON.stringify(result)
        );
        emit({ type: 'step-update', step: stepNumber, status: 'completed', duration_ms: durationMs });
        return;
      } catch (err) {
        if (err && err.isPauseSignal) throw err; // don't retry pauses
        lastError = err;
        if (err.skipRetry) break;
      }
    }

    const durationMs = Date.now() - stepStart;
    const errMsg = lastError?.message ?? 'Unknown error';

    if (optional) {
      queries.updateStepStatus(
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

    queries.updateStepStatus(
      this.db, buildId, stepNumber, 'failed', durationMs, errMsg, null
    );
    emit({ type: 'step-update', step: stepNumber, status: 'failed', error: errMsg });
    throw lastError;
  }

  async _runStepLogic(build, stepNumber, state, ctx) {
    switch (stepNumber) {
      case 1: return await this._step1CreateLocation(build);
      case 2: return await this._step2SendWelcomeComms(build, state);
      case 3: return await this._step3WebsiteCreationStub(build, state, ctx);
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
      country: build.country,
      timezone: build.timezone,
      website: build.website_url,
      snapshotId: SNAPSHOT_ID,
    };

    const response = await this.ghl.createLocation(locationData);
    const locationId = response.location.id;
    queries.updateBuildLocationId(this.db, build.id, locationId);
    return { locationId };
  }

  async _step2SendWelcomeComms(build, state) {
    // Agency Private Integration Tokens (PIT) do not have scope to create
    // contacts or send messages on behalf of sub-accounts. Verified against
    // the live GHL v2 API on 2026-04-09: POST /contacts/ returns 401
    // "The token is not authorized for this scope." and /oauth/locationToken
    // also returns 401.
    //
    // This step is marked optional in phases.config, so throwing here will
    // cause the runner to record status=warning and continue. Welcome comms
    // must be sent manually from inside the sub-account until GHL exposes
    // agency-level messaging scopes or we adopt the Marketplace OAuth flow.
    const err = new Error(
      'Welcome comms not available: agency private integration tokens cannot ' +
      'send messages on behalf of sub-accounts. Send the welcome email and SMS ' +
      'manually from inside the new sub-account.'
    );
    err.skipRetry = true;
    throw err;
  }

  async _step3WebsiteCreationStub(build, state, ctx) {
    if (!ctx.resumePayload) {
      throw new PauseSignal(3, {
        reason: 'stub_pause',
        message: 'Click Continue to proceed (M1 stub).',
      });
    }
    return { resumed: true, payload: ctx.resumePayload };
  }

  // ─── State reconstruction ─────────────────────────────────────────────────

  async _getStateFromPriorSteps(buildId, fromStep) {
    const build = queries.getBuildById(this.db, buildId);
    const state = {};

    if (build.location_id) {
      state.locationId = build.location_id;
    }

    if (fromStep <= 1) return state;

    const steps = queries.getBuildSteps(this.db, buildId);
    for (const step of steps) {
      if (step.step_number < fromStep && step.status === 'completed' && step.api_response) {
        try {
          const data = JSON.parse(step.api_response);
          Object.assign(state, data);
        } catch (_) {
          // ignore malformed JSON
        }
      }
    }

    return state;
  }
}

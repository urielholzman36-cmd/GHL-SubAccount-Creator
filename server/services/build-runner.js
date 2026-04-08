import * as queries from '../db/queries.js';
import { PHASES, getPhaseForStep, isStepOptional } from './phases.config.js';
import { generatePrompt as realGeneratePrompt } from './prompt-generator.js';
import { encrypt } from './crypto.js';

const DEFAULT_BACKOFF_MS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

export const SNAPSHOT_ID = 'SnbFmqepikqgzI5tgEZ6';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
    this.generatePromptImpl =
      options.generatePromptImpl ||
      ((build) => realGeneratePrompt(build, { apiKey: process.env.ANTHROPIC_API_KEY }));
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
        if (err && err.isPauseSignal) throw err;
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
    const freshBuild = queries.getBuildById(this.db, build.id) || build;
    switch (stepNumber) {
      case 1: return await this._step1CreateLocation(freshBuild);
      case 2: return await this._step2SendWelcomeComms(freshBuild, state);
      case 3: return await this._step3GeneratePrompt(freshBuild, state);
      case 4: return await this._step4WebsiteCreationManual(freshBuild, state, ctx);
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
    const err = new Error(
      'Welcome comms not available: agency private integration tokens cannot ' +
      'send messages on behalf of sub-accounts. Send the welcome email and SMS ' +
      'manually from inside the new sub-account.'
    );
    err.skipRetry = true;
    throw err;
  }

  async _step3GeneratePrompt(build, state) {
    const promptText = await this.generatePromptImpl(build);
    if (!promptText || typeof promptText !== 'string') {
      throw new Error('generatePromptImpl returned empty response');
    }
    this.db.prepare('UPDATE builds SET tenweb_prompt = ? WHERE id = ?').run(promptText, build.id);
    return { tenwebPromptGenerated: true };
  }

  async _step4WebsiteCreationManual(build, state, ctx) {
    if (!ctx.resumePayload) {
      const row = queries.getBuildById(this.db, build.id);
      throw new PauseSignal(4, {
        reason: 'awaiting_website',
        prompt: row.tenweb_prompt || '',
        message:
          'Paste the prompt into 10Web, wait for the site to build, then enter ' +
          'the WordPress URL, username, and application password below and click Continue.',
      });
    }

    const { wp_url, wp_username, wp_password } = ctx.resumePayload;
    if (
      !wp_url || typeof wp_url !== 'string' || !wp_url.trim() ||
      !wp_username || typeof wp_username !== 'string' || !wp_username.trim() ||
      !wp_password || typeof wp_password !== 'string' || !wp_password.trim()
    ) {
      const err = new Error('Missing WordPress credentials: wp_url, wp_username, and wp_password are all required');
      err.skipRetry = true;
      throw err;
    }

    const encrypted = encrypt(wp_password);
    this.db.prepare(
      'UPDATE builds SET wp_url = ?, wp_username = ?, wp_password_encrypted = ? WHERE id = ?'
    ).run(wp_url.trim(), wp_username.trim(), encrypted, build.id);

    return { credentialsStored: true };
  }

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
        }
      }
    }

    return state;
  }
}

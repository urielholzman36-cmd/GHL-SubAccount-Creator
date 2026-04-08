import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as queries from '../db/queries.js';
import { getStagesForIndustry } from './pipelines.js';
import { getNearbyAreaCodes } from './phone-fallback.js';
import { PHASES, getPhaseForStep } from './phases.config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const snapshots = JSON.parse(
  (await import('fs')).default.readFileSync(join(__dirname, '../config/snapshots.json'), 'utf8')
);

const DEFAULT_BACKOFF_MS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

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
  /**
   * @param {import('better-sqlite3').Database} db
   * @param {object} ghl - GHL API client (real or mock)
   * @param {object} [options]
   * @param {number[]} [options.backoffMs] - Override backoff delays for testing
   */
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
        if (err && err.isPauseSignal) throw err; // Don't retry pauses
        lastError = err;
        if (err.skipRetry) break;
      }
    }

    const durationMs = Date.now() - stepStart;
    queries.updateStepStatus(
      this.db, buildId, stepNumber, 'failed', durationMs,
      lastError?.message ?? 'Unknown error', null
    );
    emit({ type: 'step-update', step: stepNumber, status: 'failed', error: lastError?.message });
    throw lastError;
  }

  async _runStepLogic(build, stepNumber, state, ctx) {
    switch (stepNumber) {
      case 1: return await this._step1CreateLocation(build);
      case 2: return await this._step2ProvisionPhone(build, state, build.id);
      case 3: return await this._step3SetCustomValues(build, state);
      case 4: return await this._step4CreatePipeline(build, state);
      case 5: return await this._step5CreateUser(build, state);
      case 6: return await this._step6SendWelcomeComms(build, state);
      case 7: return await this._step7WebsiteCreationStub(build, state, ctx);
      default: throw new Error(`Unknown step number: ${stepNumber}`);
    }
  }

  async _step7WebsiteCreationStub(build, state, ctx) {
    if (!ctx.resumePayload) {
      throw new PauseSignal(7, {
        reason: 'stub_pause',
        message: 'Click Continue to proceed (M1 stub).',
      });
    }
    return { resumed: true, payload: ctx.resumePayload };
  }

  // ─── Step 1-6 implementations (unchanged) ─────────────────────────────────

  async _step1CreateLocation(build) {
    const snapshot = snapshots[build.industry] || snapshots['general'];
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
      snapshotId: snapshot.id,
    };

    const response = await this.ghl.createLocation(locationData);
    const locationId = response.location.id;
    queries.updateBuildLocationId(this.db, build.id, locationId);
    return { locationId };
  }

  async _step2ProvisionPhone(build, state, buildId) {
    const locationId = state.locationId;
    const areaCodesToTry = [build.area_code, ...getNearbyAreaCodes(build.area_code)];

    let lastError = null;
    for (let i = 0; i < areaCodesToTry.length; i++) {
      const code = areaCodesToTry[i];
      try {
        const response = await this.ghl.buyPhoneNumber(locationId, code);
        return { phoneNumberId: response.phoneNumber.id, phoneNumber: response.phoneNumber.number };
      } catch (err) {
        lastError = err;
        if (i > 0) {
          queries.incrementStepRetry(this.db, buildId, 2);
        }
      }
    }

    const err = new Error(`Phone provisioning failed for all area codes: ${lastError?.message}`);
    err.skipRetry = true;
    throw err;
  }

  async _step3SetCustomValues(build, state) {
    const locationId = state.locationId;
    const customValues = [
      { key: 'business_name', value: build.business_name },
      { key: 'business_email', value: build.business_email },
      { key: 'business_phone', value: build.business_phone },
      { key: 'owner_first_name', value: build.owner_first_name },
      { key: 'owner_last_name', value: build.owner_last_name },
      { key: 'website_url', value: build.website_url || '' },
    ];

    await this.ghl.setCustomValues(locationId, customValues);
    return { customValuesSet: true };
  }

  async _step4CreatePipeline(build, state) {
    const locationId = state.locationId;
    const stages = getStagesForIndustry(build.industry);
    const pipelineName = `${build.business_name} Pipeline`;

    const response = await this.ghl.createPipeline(locationId, pipelineName, stages);
    return { pipelineId: response.pipeline.id };
  }

  async _step5CreateUser(build, state) {
    const locationId = state.locationId;

    const response = await this.ghl.createUser(
      locationId,
      build.owner_first_name,
      build.owner_last_name,
      build.business_email
    );
    return { userId: response.user.id };
  }

  async _step6SendWelcomeComms(build, state) {
    const locationId = state.locationId;

    const contactResponse = await this.ghl.createContact(
      locationId,
      build.owner_first_name,
      build.owner_last_name,
      build.business_email,
      build.business_phone
    );
    const contactId = contactResponse.contact.id;

    const emailSubject = `Welcome to ${build.business_name} — Your Account is Ready`;
    const emailBody =
      `Hi ${build.owner_first_name},\n\n` +
      `Your GoHighLevel sub-account for ${build.business_name} has been created and is ready to use.\n\n` +
      `Business: ${build.business_name}\n` +
      `Email: ${build.business_email}\n` +
      `Phone: ${build.business_phone}\n\n` +
      `Please check your email inbox for your GoHighLevel login invitation to get started.\n\n` +
      `— VO360`;

    const emailResponse = await this.ghl.sendMessage(
      'Email',
      locationId,
      contactId,
      emailBody,
      emailSubject
    );

    const smsBody =
      `Hi ${build.owner_first_name}! Your ${build.business_name} account is ready. ` +
      `Check your email for the login invitation. — VO360`;

    const smsResponse = await this.ghl.sendMessage('SMS', locationId, contactId, smsBody);

    return {
      contactId,
      welcomeEmailMessageId: emailResponse.messageId,
      welcomeSmsMessageId: smsResponse.messageId,
    };
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

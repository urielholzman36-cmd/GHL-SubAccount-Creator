import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as queries from '../db/queries.js';
import { getStagesForIndustry } from './pipelines.js';
import { getNearbyAreaCodes } from './phone-fallback.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const snapshots = JSON.parse(
  (await import('fs')).default.readFileSync(join(__dirname, '../config/snapshots.json'), 'utf8')
);

const DEFAULT_BACKOFF_MS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  /**
   * Run all 6 build steps from step 1.
   */
  async run(buildId, emit) {
    const build = queries.getBuildById(this.db, buildId);
    if (!build) throw new Error(`Build not found: ${buildId}`);

    queries.updateBuildStatus(this.db, buildId, 'running');
    const startTime = Date.now();

    try {
      await this._executeSteps(build, 1, emit);
      queries.updateBuildStatus(this.db, buildId, 'completed', Date.now() - startTime);
    } catch (err) {
      queries.updateBuildStatus(this.db, buildId, 'failed', Date.now() - startTime);
    }
  }

  /**
   * Retry from a specific step number (1-based), re-running that step and all after.
   */
  async retryFromStep(buildId, fromStep, emit) {
    const build = queries.getBuildById(this.db, buildId);
    if (!build) throw new Error(`Build not found: ${buildId}`);

    queries.updateBuildStatus(this.db, buildId, 'running');
    const startTime = Date.now();

    // Reset steps from fromStep onward back to pending
    const steps = queries.getBuildSteps(this.db, buildId);
    for (const step of steps) {
      if (step.step_number >= fromStep) {
        this.db
          .prepare(
            `UPDATE build_steps SET status = 'pending', started_at = NULL, completed_at = NULL,
             duration_ms = NULL, error_message = NULL, api_response = NULL, retry_count = 0
             WHERE build_id = ? AND step_number = ?`
          )
          .run(buildId, step.step_number);
      }
    }

    try {
      await this._executeSteps(build, fromStep, emit);
      queries.updateBuildStatus(this.db, buildId, 'completed', Date.now() - startTime);
    } catch (err) {
      queries.updateBuildStatus(this.db, buildId, 'failed', Date.now() - startTime);
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  async _executeSteps(build, fromStep, emit) {
    // Reconstruct state from already-completed steps
    const state = await this._getStateFromPriorSteps(build.id, fromStep);

    for (let stepNumber = fromStep; stepNumber <= 6; stepNumber++) {
      await this._executeStep(build, stepNumber, state, emit);
    }
  }

  async _executeStep(build, stepNumber, state, emit) {
    const buildId = build.id;

    // Mark step as running
    queries.updateStepStatus(this.db, buildId, stepNumber, 'running');
    emit({ stepNumber, status: 'running' });

    const stepStart = Date.now();
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        queries.incrementStepRetry(this.db, buildId, stepNumber);
        const delay = this.backoffMs[attempt - 1] ?? this.backoffMs[this.backoffMs.length - 1];
        await sleep(delay);
      }

      try {
        const result = await this._runStepLogic(build, stepNumber, state);
        // Merge result into shared state
        Object.assign(state, result);

        const durationMs = Date.now() - stepStart;
        queries.updateStepStatus(
          this.db,
          buildId,
          stepNumber,
          'completed',
          durationMs,
          null,
          JSON.stringify(result)
        );
        emit({ stepNumber, status: 'completed', durationMs });
        return; // success
      } catch (err) {
        lastError = err;
        // If step set skipRetry (e.g. phone fallback exhausted), don't retry
        if (err.skipRetry) break;
      }
    }

    // All retries exhausted — mark step failed and bubble up
    const durationMs = Date.now() - stepStart;
    queries.updateStepStatus(
      this.db,
      buildId,
      stepNumber,
      'failed',
      durationMs,
      lastError?.message ?? 'Unknown error',
      null
    );
    emit({ stepNumber, status: 'failed', error: lastError?.message });
    throw lastError;
  }

  /**
   * Execute the actual GHL API logic for the given step.
   * Returns a plain object of new state keys to merge.
   */
  async _runStepLogic(build, stepNumber, state) {
    switch (stepNumber) {
      case 1: return await this._step1CreateLocation(build);
      case 2: return await this._step2ProvisionPhone(build, state, build.id);
      case 3: return await this._step3SetCustomValues(build, state);
      case 4: return await this._step4CreatePipeline(build, state);
      case 5: return await this._step5CreateUser(build, state);
      case 6: return await this._step6SendWelcomeComms(build, state);
      default: throw new Error(`Unknown step number: ${stepNumber}`);
    }
  }

  // ─── Step implementations ─────────────────────────────────────────────────

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

    // Persist location_id on the builds row immediately
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
        // Each failed fallback attempt counts as a retry (except the first attempt)
        if (i > 0) {
          queries.incrementStepRetry(this.db, buildId, 2);
        }
      }
    }

    // All area codes exhausted — signal outer retry loop to skip further retries
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

    // Create contact
    const contactResponse = await this.ghl.createContact(
      locationId,
      build.owner_first_name,
      build.owner_last_name,
      build.business_email,
      build.business_phone
    );
    const contactId = contactResponse.contact.id;

    // Send welcome email
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

    // Send welcome SMS
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

  /**
   * Reads api_response JSON from all completed steps before `fromStep`
   * and merges them into a single state object.
   * Also ensures locationId is pulled from the builds table if available.
   */
  async _getStateFromPriorSteps(buildId, fromStep) {
    const build = queries.getBuildById(this.db, buildId);
    const state = {};

    // Seed locationId from the builds table (set during step 1)
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

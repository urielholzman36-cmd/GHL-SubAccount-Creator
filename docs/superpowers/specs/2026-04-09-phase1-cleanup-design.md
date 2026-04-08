# Phase 1 Cleanup — Design

**Date:** 2026-04-09
**Scope:** Replace the currently-broken Phase 1 pipeline (6 steps, 5 bypassed by `DRY_RUN_GHL=1`) with a minimal working pipeline that relies on a single GHL snapshot to handle the work the removed steps were doing.
**App:** `~/ghl-sub-account-builder` (Client Onboarding Hub)
**Parent context:** Milestone 1 of the Client Onboarding Automator shipped 2026-04-08. This is a cleanup pass on Phase 1 before starting Milestone 2.

---

## Motivation

During M1 end-to-end verification we discovered Phase 1 steps 2–6 hit broken GHL v2 API endpoints. To unblock M1 shipping, we introduced a `DRY_RUN_GHL=1` env flag that short-circuits steps 2–6 to fake success. This cleanup removes that workaround.

Review of each step against the actual business need:

| Step | Original purpose | Disposition | Reason |
|------|------------------|-------------|--------|
| 1 | Create Sub-Account | **Keep** | Core operation. Already working. Must apply a real snapshot. |
| 2 | Provision Phone | **Remove** | Not needed — clients use their own phone. |
| 3 | Set Custom Values | **Remove** | Covered by the snapshot. |
| 4 | Create Pipeline | **Remove** | Covered by the snapshot. |
| 5 | Create Admin User | **Remove** | Clients never log into the GHL dashboard — operator (user) handles the account. |
| 6 | Send Welcome Comms | **Keep (best-effort)** | Nice-to-have branded welcome. Must never fail the build. |

Net result: Phase 1 collapses from 6 steps to 2 steps. The snapshot does the heavy lifting.

---

## Scope

### In scope
1. Replace `server/config/snapshots.json` with a single snapshot constant (ID: `4XHJuEPYsk1xeUKcmrL9`) applied to every build regardless of industry.
2. Delete step implementations 2, 3, 4, 5 from `build-runner.js` along with their switch cases.
3. Renumber steps: old step 6 (Welcome Comms) → new step 2; old step 7 (Website Creation Manual stub) → new step 3.
4. Update `phases.config.js` to reflect the new 2-step Phase 1 + 1-step Phase 2 shape.
5. Introduce a **best-effort / `warning` status** for steps that are allowed to fail without failing the build. Welcome Comms uses this.
6. Research the real GHL v2 endpoints for creating a contact and sending email/SMS messages. Update `ghl-api.js` accordingly.
7. Remove the Industry dropdown from the new-build form. Hard-code `industry: 'general'` on submit so the backend validation and DB column continue to work untouched.
8. Delete the `DRY_RUN_GHL` flag and its runner branches. No longer needed.
9. Update existing tests to match the new 2-step Phase 1. Delete tests that only exercised removed steps.
10. Manual end-to-end verification against the user's real GHL agency, including visual confirmation that the snapshot was applied (pipelines, templates, custom values visible inside the newly-created sub-account in GHL).

### Out of scope
- DB schema changes. The `industry` column stays. Any step-2-related columns (none exist today) stay.
- Renaming the `builds` or `build_steps` tables.
- Refactoring the retry/backoff logic.
- Changing the UI progress tracker layout beyond updating step names and count.
- Historic build data migration. The existing rows in `data.db` are test data and will not be cleaned up — they will just render with stale step counts until the operator ignores them or deletes the DB file.
- Milestone 2 (real Website Build replacing the Phase 2 stub).

---

## Architecture

### Step renumbering

Old state (M1 as shipped):

| # | Phase | Name |
|---|-------|------|
| 1 | 1 | Create Sub-Account |
| 2 | 1 | Provision Phone |
| 3 | 1 | Set Custom Values |
| 4 | 1 | Create Pipeline |
| 5 | 1 | Create Admin User |
| 6 | 1 | Send Welcome Comms |
| 7 | 2 | Website Creation (Manual) |

New state:

| # | Phase | Name | Behavior |
|---|-------|------|----------|
| 1 | 1 | Create Sub-Account | Fatal on failure |
| 2 | 1 | Send Welcome Comms | Best-effort, never fatal |
| 3 | 2 | Website Creation (Manual) | M1 stub, pauses for Continue |

Phase IDs are unchanged. Phase 2's stub step is now step 3 instead of step 7.

### Best-effort step mechanism

A step in the phase config can carry an `optional: true` flag. The runner's step executor wraps the existing retry loop: on final failure, if the step is `optional`, the runner marks the step status as `warning` (new status), records the error in the error column, and returns normally instead of throwing. The phase continues.

The `warning` status is treated as "soft success" in all UI surfaces:
- `phaseStatusLabel()` counts warning as completed
- `StepCircle` renders a yellow exclamation mark
- `BuildTable`'s `StatusBadge` renders warning as yellow (for the rare case a whole build ends up in `'warning'` status — not used now, reserved)

Only per-step `warning` is used in this cleanup. The overall build status remains `completed` if step 1 succeeds and step 2 warns.

### GHL snapshot application

`server/config/snapshots.json` is deleted. A single constant `SNAPSHOT_ID = '4XHJuEPYsk1xeUKcmrL9'` is exported from a new or existing config module and imported by `build-runner.js`. `_step1CreateLocation` passes it as `snapshotId` in the POST `/locations/` body. The runner no longer looks anything up by `build.industry`.

### GHL v2 welcome comms endpoints

Current (broken) implementation hits:
- `POST /contacts/` with `{locationId, firstName, lastName, email, phone}`
- `POST /conversations/messages` with `{type, locationId, contactId, message}`

Before writing the plan, we will verify these endpoints against the real GHL v2 API using the user's `pit-` token:
1. Can the PIT create a contact in a freshly-created sub-account?
2. Can the PIT send an email + SMS via `/conversations/messages`?

Three possible outcomes:
- **Both work** → Step 2 is a real best-effort send. Welcome comms get delivered.
- **Endpoints exist but need different shape / additional scopes** → Fix the shape, document missing scopes for the user to add in GHL UI, retry.
- **Endpoints don't exist for private integrations** → Step 2 logs "GHL messaging not available for private integrations" and completes with `warning`. Build still finishes. User sends welcome comms manually.

All three outcomes result in a working end-to-end Phase 1. The research step gates which code path lands.

### `DRY_RUN_GHL` removal

All `if (dryRun)` branches in `_runStepLogic` are deleted. The env flag is removed from `.env` and README. The switch statement reduces to:
```
case 1: step1CreateLocation
case 2: step2SendWelcomeComms
case 3: step3WebsiteCreationStub
```

### Form change

`BuildForm.jsx`:
- Industry dropdown JSX removed
- `industry` stays in the initial state with the hard-coded value `'general'`
- `validate()` no longer checks `industry`
- Submit payload still sends `industry: 'general'` so `server/routes/builds.js` validation and `queries.insertBuild` continue to work unchanged

`BuildTable.jsx`:
- The Industry column is kept as-is — it will just always show "General". Removing it is out of scope; it's cosmetic and doesn't hurt anything.

---

## Data flow

1. Operator fills the form (no industry field).
2. Frontend POSTs to `/api/builds` with `industry: 'general'` hard-coded.
3. Backend validates, inserts build row, inserts 3 `build_steps` rows (phases 1/1/2).
4. `BuildRunner.run()` → Phase 1: step 1 creates location with snapshot → step 2 attempts welcome comms (best-effort) → Phase 2: step 3 stub throws `PauseSignal`.
5. SSE `build-paused` event; operator sees yellow banner.
6. Operator clicks Continue → `POST /api/builds/:id/resume` → runner resumes → step 3 returns success → build marked `completed`.

---

## Error handling

- **Step 1 fails after 3 retries:** build marked `failed`. Operator can retry from step 1 via existing retry UI.
- **Step 2 fails after 3 retries:** runner catches, marks step status `warning`, stores error message, emits `step-update` with `status: 'warning'`, phase continues. Build completes normally if step 3 pauses/resumes successfully.
- **Step 2 fails in a way that corrupts the location** (e.g., contact created but messaging failed mid-send): acceptable. The contact sits in GHL and the operator can delete it. No compensating transaction.
- **Step 3 stub cannot fail** — it either throws `PauseSignal` on first call or returns success on resume.

---

## Testing

### Unit tests to update
- `tests/server/phases.config.test.js` — expect 2 phases, phase 1 has 2 steps (numbers 1 and 2), phase 2 has 1 step (number 3). Update `getStepName(2)` to `'Send Welcome Comms'` and `getStepName(3)` to `'Website Creation (Manual)'`.
- `tests/server/db.test.js` — `createBuildSteps` now inserts 3 rows instead of 7. Phase assignments: steps 1,2 → phase 1; step 3 → phase 2. Update the existing step-count assertion.
- `tests/server/build-runner.test.js` — most tests need rewriting:
  - "runs phase 1 then pauses at stub" now pauses at step 3 instead of step 7.
  - Phase 1 only calls `createLocation` and `createContact` + `sendMessage` (best-effort). Remove assertions on `buyPhoneNumber`, `setCustomValues`, `createPipeline`, `createUser`.
  - New test: step 2 best-effort behavior — when `createContact` throws, build still completes and step 2 ends in `warning` status.
  - New test: snapshot ID is passed to `createLocation`.
- `tests/server/pause-resume.test.js` — update `paused_at_step` assertion from 7 to 3.

### Manual end-to-end verification
1. Delete any existing test sub-accounts from GHL agency (VO360 Test Co, API Test Co).
2. `npm run dev:all`, log in, create a new build against real GHL.
3. **Check that the sub-account in GHL has the snapshot applied**: open the new sub-account, verify that pipelines, opportunities, automations, templates from the master snapshot are present.
4. Verify step 2 outcome in the UI:
   - Green (sent): operator's email inbox received the welcome email.
   - Yellow warning: operator sees the warning state and the error message explaining why messaging was skipped.
5. Click Continue on the Phase 2 stub. Build flips to completed.
6. Delete the test sub-account from GHL.

---

## Key design decisions

1. **Snapshot does the heavy lifting.** Removing 4 redundant API calls is simpler than fixing 4 broken endpoints. The snapshot is the source of truth for everything under a sub-account.
2. **Best-effort welcome comms over fatal welcome comms.** The operator's real need is "sub-account exists with snapshot applied." Welcome comms are a UX nicety. A broken email provider should not break onboarding.
3. **Renumber steps instead of keeping gaps.** Steps are a user-facing concept (they appear in the progress tracker). Gaps (1, 6, 7) would confuse the operator more than a clean 1-2-3.
4. **Keep the `industry` column.** Zero DB migration risk. The column is harmless. Phase 3 (Social Planner) may re-activate industry-specific logic later.
5. **No snapshot-per-industry map.** One snapshot covers every client. If we ever need per-industry snapshots, we reintroduce the map then. YAGNI for now.
6. **GHL endpoint research is gated into implementation, not design.** We don't know yet whether `/contacts/` + `/conversations/messages` work with PIT tokens. The design accommodates all three outcomes (works / needs scopes / not available). The plan will include a research step as the first task.

---

## Deliverables

At the end of this cleanup:
- Phase 1 with 2 real steps (Create Sub-Account with real snapshot, Send Welcome Comms best-effort).
- Phase 2 with 1 stub step (unchanged from M1, just renumbered).
- Real GHL snapshot `4XHJuEPYsk1xeUKcmrL9` applied to every new sub-account.
- `DRY_RUN_GHL` flag and all its branches deleted.
- `snapshots.json` deleted.
- Industry dropdown removed from the form.
- `warning` step status available for best-effort steps.
- All existing tests pass; no tests reference removed steps.
- One verified real-GHL end-to-end run with the snapshot visibly applied in the GHL dashboard.

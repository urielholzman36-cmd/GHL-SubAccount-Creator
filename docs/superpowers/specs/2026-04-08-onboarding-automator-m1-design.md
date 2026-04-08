# Client Onboarding Automator — Milestone 1 Design

**Date:** 2026-04-08
**Scope:** Milestone 1 of the Client Onboarding Automator project
**App:** `~/ghl-sub-account-builder` (runs on port 3003)
**Parent spec:** Client Onboarding Automator — Track 1, Project 1, v1.0 (April 2026)

---

## Purpose

Evolve the existing GHL Sub-Account Builder into the foundation of the Client Onboarding Hub by introducing a **phased execution model** and a **durable pause/resume mechanism**. This milestone ships the structural plumbing that later milestones (M2: Website Build, M3: Social Planner, M4: Confirmation) will build on.

M1 does **not** add any new client-facing steps beyond a temporary stub used to exercise the pause/resume flow end-to-end.

---

## Scope

### In scope
1. Refactor the build runner so its existing 6 GHL steps execute as "Phase 1" of a multi-phase pipeline.
2. Introduce a phase configuration that groups step numbers into named phases.
3. Add a durable pause/resume mechanism: a build can pause mid-pipeline, survive server restarts, and be resumed from the UI.
4. Add a temporary stub "wait" step as Phase 2 so the pause/resume flow can be verified end-to-end.
5. Extend the SQLite schema with only the columns M1 needs.
6. Update the build detail UI to show phase groupings, a paused banner, and a Continue button.
7. Rename the app from "Sub-Account Builder" to "Client Onboarding Hub" in the UI header.

### Out of scope (deferred to later milestones)
- Extended onboarding form (Website & Branding, Content Config sections) — deferred to M2/M3.
- Any real Phase 2/3/4 step implementations.
- Any new external API integrations (WordPress, Claude content generation, Krea, Cloudinary).
- Brand/content/WP/Cloudinary database columns.
- Sub-step progress events (`sub-step-update`) — deferred to the milestone that needs them.
- File download endpoints.
- Build history page changes beyond a paused-status badge.

---

## Architecture

### Approach: minimal wrap, not full refactor

The existing step functions in `server/services/build-runner.js` are left untouched. A new **phase configuration** declares which step numbers belong to which phase, and the runner loop reads it to emit phase-level events around batches of steps.

This approach was chosen over a full `Phase`/`Step` class refactor because it:
- Ships in the fewest sessions.
- Doesn't risk regressing the working 6-step GHL pipeline.
- Leaves the door open to a cleaner refactor later if needed.

### Phase configuration

A new file `server/services/phases.config.js` declares:

- **Phase 1: GHL Sub-Account Setup** — steps 1–6 (existing, unchanged).
- **Phase 2: Website Build** — step 7 only, a temporary stub pause step. This step is removed or replaced when M2 ships.

Later milestones will extend this config with their own phases and steps.

### Runner loop behavior

For each phase in the configuration:
1. Emit `phase-start` SSE event.
2. Run each step in the phase sequentially using the existing per-step logic.
3. If a step signals a pause, stop the loop and persist pause state (see Pause/Resume below).
4. After all steps in the phase complete, emit `phase-complete` SSE event.
5. Proceed to the next phase.

Existing per-step SSE events (`step-update`, `build-complete`, `build-failed`) continue to work unchanged.

---

## Pause/Resume Mechanism

### Durability requirement

A paused build must survive:
- The operator closing the browser tab.
- The SSE connection dropping.
- The Node.js server restarting.

The only way the build is lost is if a human explicitly cancels it or the SQLite database is deleted.

### How it works

1. When the runner executes a step that requires manual input, the step function signals "pause" instead of completing.
2. The runner:
   - Sets `builds.status = 'paused'`.
   - Records `builds.paused_at_step` (the step number that paused).
   - Records `builds.pause_context` (JSON blob describing what the resume needs — for M1's stub, this is just a placeholder object).
   - Emits a `build-paused` SSE event.
   - Exits the runner loop cleanly (no background timers, no in-memory state required).
3. The build detail page, whether freshly loaded or receiving the SSE event live, detects the `paused` status and renders a "Waiting to continue" banner with a Continue button.
4. When the operator clicks Continue, the frontend POSTs to a new resume endpoint with any payload the pause step needs (for M1's stub, an empty JSON object is sufficient).
5. The resume endpoint:
   - Validates the build is in `paused` status.
   - Clears the pause state.
   - Spawns a new runner invocation that skips completed steps and continues from `paused_at_step + 1`.
   - Returns immediately so the frontend can reconnect its SSE stream.
6. The runner finishes the remaining phases as normal.

### Restart survival

Because pause state lives entirely in SQLite, a server restart has no effect on paused builds. When the operator reopens the build detail page after a restart, the page queries the build row, sees `status = 'paused'`, and renders the resume UI exactly as before.

Builds that were **running** (not paused) at the moment of a crash are out of scope for this milestone. M1 does not attempt to auto-resume crashed-mid-step builds. If a build was mid-step when the server died, it shows as failed/stuck and the operator uses the existing retry-from-step flow.

---

## Database Schema Changes

Only the columns M1 actually uses are added. All other spec'd columns (brand, content, WP, Cloudinary, etc.) are deferred to the milestones that use them.

### `builds` table — new columns

- `paused_at_step` INTEGER NULL — the step number at which the build paused.
- `pause_context` TEXT NULL — JSON blob with any data the resume step needs.

The existing `status` column gains a new permitted value: `'paused'`, alongside the existing values.

### `build_steps` table — new column

- `phase` INTEGER NOT NULL DEFAULT 1 — which phase a step belongs to.

Backfill: existing rows get `phase = 1` (all historical builds only ran the 6 GHL steps, which are Phase 1).

### Migration

A single additive migration applied at server startup. No destructive changes. Existing builds continue to load and display correctly.

---

## API Changes

### New endpoint

- `POST /api/builds/:id/resume` — resume a paused build. Accepts an optional JSON body (ignored by M1's stub, used by real pause steps in later milestones). Returns `202 Accepted` immediately; progress continues over SSE.

### Extended SSE events

Existing events unchanged. New events emitted by the runner:

- `phase-start` — `{ phase: 1, name: "GHL Sub-Account Setup" }`
- `phase-complete` — `{ phase: 1 }`
- `build-paused` — `{ step: 7, reason: "stub_pause", message: "Click Continue to proceed" }`

### Unchanged endpoints

All existing endpoints (`POST /api/builds`, `GET /api/builds/:id/stream`, `GET /api/builds/:id`, `GET /api/builds`, `POST /api/builds/:id/retry/:step`, `GET /api/stats`) keep their current shapes. The `GET /api/builds/:id` response simply includes the new fields (`paused_at_step`, `pause_context`, `status` may now be `'paused'`).

---

## UI Changes

### Header
- Rename "Sub-Account Builder" → "Client Onboarding Hub".

### Form
- No changes in M1. Extended onboarding form sections are deferred.

### Build detail page
- Progress list groups steps under phase headers:
  - **Phase 1: GHL Sub-Account Setup** — the existing 6 steps underneath.
  - **Phase 2: Website Build** — the stub step underneath.
- When `status = 'paused'`, render a yellow "Waiting to continue" banner above the progress list with:
  - A brief explanation.
  - A **Continue** button that POSTs to the resume endpoint.
- Phase headers show their own status indicator: pending / running / completed.

### Build list
- Builds with `status = 'paused'` show a "Paused" badge alongside the existing status badges.

---

## Verification

M1 is considered complete only when **all three** of the following pass.

### 1. Unit tests
Cover the mechanism in isolation:
- Phase configuration correctly groups step numbers.
- Runner emits `phase-start` / `phase-complete` around the right step batches.
- Pause persists `status`, `paused_at_step`, and `pause_context` to the database.
- Resume endpoint rejects non-paused builds and accepts paused ones.
- Resume restarts the runner from `paused_at_step + 1` without re-running completed steps.

### 2. End-to-end run against a real GHL test sub-account
1. Start a build from the form with real test data.
2. Phase 1 executes all 6 real GHL steps and creates a real sub-account, phone, pipeline, admin user, and welcome comms.
3. Build hits the Phase 2 stub step and pauses.
4. Operator closes the browser tab, then reopens the build detail page — the paused banner is still rendered correctly.
5. Operator clicks Continue — the build resumes and completes.

### 3. Restart survival check
1. Start a build and let it reach the paused state.
2. Kill the Node.js server.
3. Restart the server.
4. Reopen the build detail page — pause state is still intact and the Continue button still works.

---

## Key Design Decisions

1. **Minimal wrap over full refactor** — existing step functions are untouched; phases are a configuration layer on top.
2. **Lean schema** — only columns M1 actually uses. Brand/content/WP/Cloudinary columns come with the milestones that use them.
3. **Durable pause via SQLite** — pause state lives entirely in the database. No in-memory state, no background worker, no external queue. A build can sit paused indefinitely and survive any server restart.
4. **Stub pause step for verification** — a temporary Step 7 exists solely to exercise the pause/resume flow end-to-end. It is removed or replaced when M2 lands its real website-build steps.
5. **No form changes in M1** — the extended onboarding form is deferred to the milestones that need the data it collects.
6. **Crashed-mid-step builds out of scope** — M1 only guarantees durability for *paused* builds, not for builds killed mid-execution. The existing retry-from-step flow handles crashes.

---

## Deliverables

At the end of M1:
- Phased build runner with Phase 1 (real) and Phase 2 (stub).
- Durable pause/resume mechanism backed by SQLite.
- `POST /api/builds/:id/resume` endpoint.
- New SSE events: `phase-start`, `phase-complete`, `build-paused`.
- Build detail UI with phase grouping, paused banner, and Continue button.
- Build list UI with Paused badge.
- Renamed header: "Client Onboarding Hub".
- Unit tests + one verified end-to-end run + verified restart-survival check.

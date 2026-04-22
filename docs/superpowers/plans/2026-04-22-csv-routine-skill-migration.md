# CSV Routine Skill Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the silent 08:00 launchd CSV routine with an on-demand Claude Code skill that streams live progress to chat.

**Architecture:** A new global skill at `~/.claude/skills/csv-routine/` contains a `SKILL.md` (instructions + trigger phrases) and a thin `scripts/run.mjs` wrapper. The wrapper imports the existing `detectPendingBundles` and `processBundle` from `~/ghl-sub-account-builder/scripts/daily-csv-routine/` by absolute path and emits one JSON event per line on stdout. Claude renders those events as phase updates and a final summary table. The launchd job, plist, and `.command` trigger are removed.

**Tech Stack:** Node.js ESM, Claude Code skill format (markdown frontmatter), macOS launchd, the existing processBundle library (Cloudinary SDK, csv-stringify, etc.).

---

## File Structure

**Create:**
- `/Users/urielholzman/.claude/skills/csv-routine/SKILL.md` — skill description, trigger phrases, instructions for Claude
- `/Users/urielholzman/.claude/skills/csv-routine/scripts/run.mjs` — wrapper: detect → process → emit JSON-line events

**Delete (as cleanup):**
- `/Users/urielholzman/Library/LaunchAgents/com.vo360.csv-routine.plist`
- `/Users/urielholzman/Desktop/Routine Runs/Run CSV Routine.command`
- `/Users/urielholzman/Desktop/Routine Runs/` (if empty after the above)

**Untouched:**
- Everything under `/Users/urielholzman/ghl-sub-account-builder/scripts/daily-csv-routine/` (config, process-bundle.mjs, all libs, tests)

---

## Task 1: Create the skill directory and SKILL.md

**Files:**
- Create: `/Users/urielholzman/.claude/skills/csv-routine/SKILL.md`

- [ ] **Step 1: Make the skill directory**

```bash
mkdir -p /Users/urielholzman/.claude/skills/csv-routine/scripts
```

- [ ] **Step 2: Write SKILL.md**

Write `/Users/urielholzman/.claude/skills/csv-routine/SKILL.md` with this exact content:

```markdown
---
name: csv-routine
description: Process Manus social content bundles in ~/Desktop/Manus-Social Planner / into GHL-ready CSVs. Use when the user says "make the csv", "make csvs", "process the bundles", "run the csv routine", "process new bundles", "I dropped a zip", or invokes /csv-routine. Streams live phase updates and a final summary table.
---

# CSV Routine

## Purpose
Replace the previously scheduled daily CSV routine with an on-demand, in-chat flow. Detect all pending Manus bundles, process each end-to-end (normalize → Cloudinary upload → GHL CSV + summary), and report progress + results to the user.

## How to run

Run the wrapper script via Bash and stream its stdout:

```bash
node /Users/urielholzman/.claude/skills/csv-routine/scripts/run.mjs
```

The script emits one JSON object per line on stdout. Parse each line and render it.

## Event types

- `{"type":"detected","bundles":[{"client":"Restoration Pros","year":2026,"month":4,"sourcePath":"..."}]}` — emitted once after scanning. If `bundles` is empty, tell the user "Nothing pending" and stop.
- `{"type":"start","client":"...","year":2026,"month":4}` — emitted before each bundle. Render as `▸ {client} · {year}-{month} — normalizing bundle…`.
- `{"type":"progress","phase":"upload","client":"...","year":2026,"month":4,"done":12,"total":47}` — emitted during Cloudinary upload. Render as an indented line `  uploading {done}/{total} images to Cloudinary…`.
- `{"type":"built","client":"...","year":2026,"month":4,"csvFile":"...","summaryFile":"...","postCount":47,"uploadCount":47,"warnings":[]}` — emitted after each bundle completes. Render as `  ✓ {postCount} posts · {uploadCount} images · {warnings.length} warnings` followed by any warning lines indented deeper.
- `{"type":"failed","client":"...","year":2026,"month":4,"error":"..."}` — emitted when a bundle throws. Render as `  ✗ Failed: {error}`.
- `{"type":"summary","results":[...],"failures":[...]}` — emitted last. Render a markdown table:
  `| Client | Month | Posts | Images | Warnings | CSV |`

## Behavior rules

- Zero confirmation before running — the user asked by invoking the skill.
- If `{"type":"detected"}` shows zero bundles, output a single line: `Nothing pending in ~/Desktop/Manus-Social Planner /.` and stop.
- If any `failed` events appear, still render the final summary with the failures section.
- Do not retry failures automatically.
- The script loads its own `.env` from `/Users/urielholzman/ghl-sub-account-builder/.env`. Do not export environment variables yourself.

## When NOT to use

- The user wants to re-run a bundle whose CSV already exists. (Detector skips bundles whose output CSV exists — they'd need to delete the CSV first. Tell them and stop.)
- The user wants to process a zip outside the `Manus-Social Planner` folder. This skill only scans that folder.
```

- [ ] **Step 3: Verify the file**

```bash
cat /Users/urielholzman/.claude/skills/csv-routine/SKILL.md | head -5
```

Expected: shows the frontmatter `---`, `name: csv-routine`, and the description line.

- [ ] **Step 4: Commit**

Nothing to commit — `~/.claude/skills/` is not a git repo. Skip this step.

---

## Task 2: Write the wrapper script (run.mjs)

**Files:**
- Create: `/Users/urielholzman/.claude/skills/csv-routine/scripts/run.mjs`

- [ ] **Step 1: Write run.mjs**

Write `/Users/urielholzman/.claude/skills/csv-routine/scripts/run.mjs` with this exact content:

```javascript
#!/usr/bin/env node
// CSV Routine skill wrapper.
// Emits one JSON event per line on stdout. Consumed by the csv-routine skill.

import fs from 'fs';
import path from 'path';

const ROUTINE_DIR = '/Users/urielholzman/ghl-sub-account-builder/scripts/daily-csv-routine';
const ENV_PATH = '/Users/urielholzman/ghl-sub-account-builder/.env';

function loadEnvFrom(dotenvPath) {
  if (!fs.existsSync(dotenvPath)) return;
  for (const line of fs.readFileSync(dotenvPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function firstDayOfMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

async function main() {
  loadEnvFrom(ENV_PATH);

  const { WATCH_ROOT, OUTPUT_ROOT } = await import(path.join(ROUTINE_DIR, 'config.mjs'));
  const { detectPendingBundles } = await import(path.join(ROUTINE_DIR, 'lib/detector.mjs'));
  const { processBundle } = await import(path.join(ROUTINE_DIR, 'process-bundle.mjs'));

  const pending = detectPendingBundles(WATCH_ROOT, OUTPUT_ROOT);
  emit({ type: 'detected', bundles: pending.map(p => ({
    client: p.client, year: p.year, month: p.month, sourcePath: p.sourcePath,
  })) });

  if (pending.length === 0) return;

  const results = [];
  const failures = [];

  for (const p of pending) {
    emit({ type: 'start', client: p.client, year: p.year, month: p.month });
    try {
      const res = await processBundle({
        clientName: p.client,
        sourcePath: p.sourcePath,
        year: p.year,
        month: p.month,
        startDate: firstDayOfMonth(p.year, p.month),
        onProgress: ev => {
          if (ev.phase === 'upload') {
            emit({ type: 'progress', phase: 'upload', client: p.client, year: p.year, month: p.month, done: ev.done, total: ev.total });
          }
        },
      });
      emit({
        type: 'built',
        client: p.client,
        year: p.year,
        month: p.month,
        csvFile: res.csvFile,
        summaryFile: res.summaryFile,
        postCount: res.postCount,
        uploadCount: res.uploadCount,
        warnings: res.warnings,
      });
      results.push({ client: p.client, year: p.year, month: p.month, ...res });
    } catch (err) {
      emit({ type: 'failed', client: p.client, year: p.year, month: p.month, error: err.message });
      failures.push({ client: p.client, year: p.year, month: p.month, error: err.message });
    }
  }

  emit({ type: 'summary', results, failures });
}

main().catch(err => {
  emit({ type: 'fatal', error: err.message, stack: err.stack });
  process.exit(1);
});
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x /Users/urielholzman/.claude/skills/csv-routine/scripts/run.mjs
```

- [ ] **Step 3: Verify syntax by importing it**

```bash
node --check /Users/urielholzman/.claude/skills/csv-routine/scripts/run.mjs
```

Expected: no output, exit code 0. Syntax errors would print here.

- [ ] **Step 4: Commit**

Nothing to commit — `~/.claude/skills/` is not a git repo. Skip.

---

## Task 3: Smoke-test the wrapper with the current empty state

**Files:**
- Test: run `run.mjs` against the existing watch folder. With no pending bundles (per latest logs), we should see only a `detected` event with empty bundles.

- [ ] **Step 1: Run the wrapper**

```bash
node /Users/urielholzman/.claude/skills/csv-routine/scripts/run.mjs
```

Expected output (exactly one line):
```
{"type":"detected","bundles":[]}
```

If `bundles` is non-empty, a real bundle is pending. That's fine — continue observing the run; it should emit `start`, one or more `progress` events, a `built` event, and finally a `summary` event. All output must be valid JSON per line.

- [ ] **Step 2: Validate JSON parseability**

```bash
node /Users/urielholzman/.claude/skills/csv-routine/scripts/run.mjs | while IFS= read -r line; do echo "$line" | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))" && echo OK || echo BAD; done
```

Expected: every line prints `OK`. Any `BAD` means the wrapper is writing non-JSON to stdout (e.g. a `console.log` leaked from an imported module). Fix by redirecting that module's log to stderr or silencing it.

- [ ] **Step 3: Commit**

Nothing to commit.

---

## Task 4: Decommission the launchd job

**Files:**
- Remove: `/Users/urielholzman/Library/LaunchAgents/com.vo360.csv-routine.plist`

- [ ] **Step 1: Unload the running launchd job**

```bash
launchctl bootout gui/$(id -u) /Users/urielholzman/Library/LaunchAgents/com.vo360.csv-routine.plist
```

Expected: no output, or a line saying the service was unloaded. If it says "Could not find service", the job was already unloaded — continue.

- [ ] **Step 2: Verify launchctl no longer lists it**

```bash
launchctl list | grep com.vo360.csv-routine || echo "Not loaded"
```

Expected: `Not loaded`.

- [ ] **Step 3: Delete the plist**

```bash
rm /Users/urielholzman/Library/LaunchAgents/com.vo360.csv-routine.plist
```

- [ ] **Step 4: Confirm removal**

```bash
test -f /Users/urielholzman/Library/LaunchAgents/com.vo360.csv-routine.plist && echo STILL_THERE || echo GONE
```

Expected: `GONE`.

- [ ] **Step 5: Commit**

Nothing to commit — this file was never in the repo.

---

## Task 5: Remove the manual .command trigger

**Files:**
- Remove: `/Users/urielholzman/Desktop/Routine Runs/Run CSV Routine.command`
- Remove if empty: `/Users/urielholzman/Desktop/Routine Runs/`

- [ ] **Step 1: Delete the .command file**

```bash
rm "/Users/urielholzman/Desktop/Routine Runs/Run CSV Routine.command"
```

- [ ] **Step 2: Check what's left in the folder**

```bash
ls -la "/Users/urielholzman/Desktop/Routine Runs/"
```

Expected: only `.` and `..` entries. If anything else is present, stop and ask the user what it is before deleting.

- [ ] **Step 3: Remove the empty folder**

```bash
rmdir "/Users/urielholzman/Desktop/Routine Runs/"
```

- [ ] **Step 4: Confirm removal**

```bash
test -d "/Users/urielholzman/Desktop/Routine Runs" && echo STILL_THERE || echo GONE
```

Expected: `GONE`.

- [ ] **Step 5: Commit**

Nothing to commit — these files were never in the repo.

---

## Task 6: End-to-end verification with a dropped bundle

**Files:**
- No code changes. This task verifies the skill's full path works in a real Claude Code session.

- [ ] **Step 1: Ask the user to drop a test bundle**

Tell the user:
> To verify the skill works end-to-end, drop a bundle into `~/Desktop/Manus-Social Planner /{Client}/` using the normal `YYYY_MM_...` naming. Then tell me "make the csv".

Wait for the user to confirm they've dropped something. If they don't have a spare bundle right now, skip to Step 4.

- [ ] **Step 2: Invoke the skill**

When the user asks, run the skill by executing:

```bash
node /Users/urielholzman/.claude/skills/csv-routine/scripts/run.mjs
```

Parse each stdout line as JSON and render per the event-type rules in `SKILL.md`.

- [ ] **Step 3: Confirm the CSV landed**

```bash
ls -la "/Users/urielholzman/Desktop/CSV Ready Zips/{Client}/"
```

Replace `{Client}` with the client name the user dropped. Expected: the new `{Client}_{Month}_{Year}_GHL_Schedule.csv` is present with a current modification time.

- [ ] **Step 4: Record the outcome**

If verification succeeded, mark this plan complete.
If it failed, capture the failure mode (stderr, JSON parse error, missing env var, etc.) and decide whether to amend Task 2 or write a follow-up plan.

- [ ] **Step 5: Commit**

Nothing to commit.

---

## Self-review checklist (for the implementer to run before declaring done)

- [ ] `launchctl list | grep com.vo360.csv-routine` returns nothing.
- [ ] `/Users/urielholzman/Library/LaunchAgents/com.vo360.csv-routine.plist` does not exist.
- [ ] `/Users/urielholzman/Desktop/Routine Runs/` does not exist.
- [ ] `/Users/urielholzman/.claude/skills/csv-routine/SKILL.md` exists and starts with a `---` frontmatter block containing `name: csv-routine`.
- [ ] `/Users/urielholzman/.claude/skills/csv-routine/scripts/run.mjs` exists and is executable.
- [ ] Running `node /Users/urielholzman/.claude/skills/csv-routine/scripts/run.mjs` with an empty watch folder emits exactly `{"type":"detected","bundles":[]}` and nothing else.
- [ ] Running it with a real bundle emits `detected` → `start` → one or more `progress` → `built` → `summary` in that order, all valid JSON.

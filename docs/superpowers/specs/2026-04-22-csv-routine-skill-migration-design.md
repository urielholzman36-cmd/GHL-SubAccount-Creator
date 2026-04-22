# CSV Routine — Skill Migration Design

## Problem

The Manus Daily CSV Routine (shipped 2026-04-19 — see `2026-04-19-manus-daily-csv-routine-design.md`) runs silently at 08:00 daily via launchd. When the user drops a bundle mid-day, there is no visible feedback: no indicator that processing will happen, no way to observe progress, no immediate output. The user can only confirm it worked by checking `~/Desktop/CSV Ready Zips/{Client}/` the next morning.

The original trade-off — daily automation vs. observability — favored the wrong side. The user drops bundles rarely (monthly per client, ad-hoc), but when they do, they want immediate confirmation and visibility.

## Solution

Replace the scheduled routine with a **Claude Code skill** (`csv-routine`) invoked on-demand from the chat. Drop a bundle, ask Claude to process it, watch the work happen live, see a summary when done.

## Scope

**In scope**
- New skill at `~/.claude/skills/csv-routine/` (global, available in any Claude Code session)
- Skill invokes existing `processBundle` and detector logic — no rewrites
- Live per-phase progress updates in chat (normalize / Cloudinary upload / CSV build)
- Final summary card with client, month, post count, image count, warnings, CSV path
- Decommission the launchd job and the manual `.command` trigger

**Out of scope**
- Rewriting the bundle normalizer, Cloudinary uploader, CSV builder, summary builder, or detector
- Changing the watch folder structure (`~/Desktop/Manus-Social Planner /{Client}/`)
- Changing the output folder structure (`~/Desktop/CSV Ready Zips/{Client}/`)
- macOS notifications (in-chat progress replaces them)
- Any Onboarding Hub UI changes

## Architecture

```
~/.claude/skills/csv-routine/
  SKILL.md                    # skill description + trigger phrases + instructions
  scripts/
    run.mjs                   # thin wrapper: detect → process → stream events to stdout

~/ghl-sub-account-builder/scripts/daily-csv-routine/   # unchanged
  config.mjs
  process-bundle.mjs
  lib/
    detector.mjs
    bundle-normalizer.mjs
    cloudinary-uploader.mjs
    csv-builder.mjs
    summary-builder.mjs
    ...
```

The skill's `run.mjs` imports from the existing `ghl-sub-account-builder/scripts/daily-csv-routine` directory by absolute path. This keeps the tested library code in its current home and git history intact.

`SKILL.md` instructs Claude to execute `run.mjs` via the Bash tool and to parse its stdout. `run.mjs` emits one JSON object per line (`{"phase": "normalize", "client": "...", "month": "2026-04"}`, `{"phase": "cloudinary", "done": 12, "total": 47}`, etc.), plus a final `{"type": "summary", "results": [...]}` line. Claude renders these as chat updates and the final summary card.

## Invocation

Trigger phrases (declared in `SKILL.md` description):
- `/csv-routine`
- "make the csv", "make csvs", "process the bundles", "run the csv routine", "process new bundles", "I dropped a zip"

Behavior: zero confirmation. Detects all pending bundles in `~/Desktop/Manus-Social Planner /`, processes each one, reports back.

## Flow

1. User drops a client bundle into `~/Desktop/Manus-Social Planner /{Client}/YYYY_MM_*` (same as today).
2. User tells Claude something like "make the csv" or `/csv-routine`.
3. Skill runs `run.mjs`, which:
   - Loads `.env` from the `ghl-sub-account-builder` project root.
   - Calls `detectPendingBundles` to list pending work.
   - If nothing pending → exits with a single line reported to chat.
   - For each bundle, calls `processBundle` with an `onProgress` callback that streams phase events.
4. Claude renders each phase event as a chat line:
   ```
   ▸ Restoration Pros · 2026-04 — normalizing bundle…
     uploading 12/47 images to Cloudinary…
     building CSV…
     ✓ 47 posts · 47 images · 0 warnings
   ```
5. After all bundles, Claude shows a final summary card:
   ```
   | Client             | Month   | Posts | Images | Warnings | CSV                              |
   | Restoration Pros   | 2026-04 | 47    | 47     | 0        | .../Restoration Pros/...GHL...csv |
   ```

## Cleanup (part of this migration)

- `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.vo360.csv-routine.plist`
- Delete `~/Library/LaunchAgents/com.vo360.csv-routine.plist`
- Delete `~/Desktop/Routine Runs/Run CSV Routine.command`
- Delete `~/Desktop/Routine Runs/` if empty
- Keep `~/Desktop/CSV Ready Zips/_logs/` intact for history

## What stays untouched

- `processBundle` and all libs under `scripts/daily-csv-routine/lib/`
- Output folder structure
- Cloudinary upload behavior, CSV format, summary card format
- `.env` in the `ghl-sub-account-builder` project root
- The existing log files

## Success criteria

- Dropping a bundle and asking Claude to process it produces a CSV in the correct folder within the same session.
- User sees live phase updates and a final summary without leaving the chat.
- No launchd job remains, no `.command` file remains, no scheduled background behavior remains.
- Existing processed bundles (VO360, Lyrie.AI, etc.) are not re-processed — detector idempotency preserved.

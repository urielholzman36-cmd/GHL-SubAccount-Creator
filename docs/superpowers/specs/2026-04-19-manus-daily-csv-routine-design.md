# Manus Daily CSV Routine — Design

## Problem

Every month, Manus delivers a social content bundle per client (30 posts, images, captions, hashtags, CTAs). Today the user manually:

1. Extracts the zip
2. Uploads 47 images to Cloudinary
3. Builds a GHL-ready CSV
4. Uploads the CSV to GHL Social Planner

Tonight we confirmed this pipeline works when Claude runs it ad-hoc (5 min, fully automatic end-to-end). The Onboarding Hub's import flow is unreliable (227 MB upload buffering, sequential Cloudinary uploads, regex bugs on non-Lyrie post IDs), and the user has lost trust in it for this workflow.

The user wants to replace the manual flow with a **Claude Routine** (scheduled agent) that runs once per day, detects new bundles dropped into the knowledge-base folder, and produces ready-to-upload CSVs in a dedicated output folder.

## Scope

**In scope**
- Daily scan of `~/Desktop/Manus-Social Planner/{Client}/` for new monthly bundles
- Automatic extraction, Cloudinary upload, CSV + summary generation
- Output to `~/Desktop/CSV Ready Zips/{Client}/`
- macOS notification when a new CSV is ready
- Graceful handling of Manus format drift (April VO360 format ≠ May VO360 ≠ May Lyrie)
- Per-client config pulled from the Onboarding Hub's Turso `clients` table

**Out of scope**
- Auto-publishing to GHL (user reviews + uploads manually)
- Real-time (sub-daily) triggers — monthly/ad-hoc cadence doesn't need it
- Hub UI changes — automation runs independent of the hub
- Email / Slack notifications — macOS system notification is enough
- Fixing the hub's own import flow (separate track)

## Folder Contract

```
~/Desktop/
├── Manus-Social Planner/          ← INPUT (knowledge base, never modified)
│   ├── VO360/
│   │   ├── april/                 (historical — already processed)
│   │   ├── may /                  (historical — already processed, has trailing space)
│   │   └── 2026_06_VO360.zip      (new drop → triggers processing)
│   ├── Lyrie.AI/
│   │   └── 2026_06_Lyrie.zip
│   ├── Calispark Electric/
│   ├── HSP/
│   ├── 411 Plumber/
│   └── Restoration Pros/
│
└── CSV Ready Zips/                ← OUTPUT (state lives here)
    ├── VO360/
    │   ├── VO360_April_2026_GHL_Schedule.csv  (manual pre-existing)
    │   ├── VO360_May_2026_GHL_Schedule.csv    (produced tonight)
    │   ├── VO360_May_2026_Summary.md          (future runs will produce this too)
    │   └── VO360_June_2026_GHL_Schedule.csv   (future — dropped here after automation run)
    ├── Lyrie.AI/
    ├── Calispark Electric/
    ├── HSP/
    ├── 411 Plumber/
    └── Restoration Pros/
```

**Detection rule (what counts as "pending"):** a bundle at `Manus-Social Planner/{Client}/...` whose corresponding `{Client}_{Month}_{Year}_GHL_Schedule.csv` does **not** exist in `CSV Ready Zips/{Client}/`.

**State is implicit in the output folder.** No separate state file. Rerunning a month = delete its CSV from output → next daily run rebuilds it.

## Client Registry

Client metadata comes from the Onboarding Hub's Turso `clients` table:

| Field | Used for |
|---|---|
| `name` | Folder-name match (case-insensitive, whitespace-tolerant) |
| `cloudinary_folder` | Namespace for uploaded images (e.g. `vo360/2026-06/day-01.png`) |
| `posting_time` | Time component of CSV `postAtSpecificTime` |
| (nothing else) | Captions, CTAs, hashtags all come from the bundle itself |

**A client folder in `CSV Ready Zips/` without a matching row in the Hub's `clients` table** → routine logs a warning, skips that client, continues. (Fix: user adds the client to the Hub, rerun tomorrow or ad-hoc.)

## Bundle Processing Pipeline

For each pending bundle Claude finds:

1. **Normalize input** — bundle might be a loose folder, a zip, or nested zips (April VO360 had `images.zip` inside). Extract to a temp working dir, flatten.
2. **Locate manifest + post_kits** — `*manifest.md`, `*post_kits.md` if present; otherwise fall back to the `parseManusBundle` filename-heuristic path. If .docx-only (as May VO360 was initially), convert to .md using the same logic we used tonight.
3. **Upload images to Cloudinary** — parallel batches of 8, named `{client.cloudinary_folder}/{YYYY-MM}/day-NN[-sMM].png`. Idempotent: same filename → Cloudinary `overwrite: true` silently replaces.
4. **Build GHL CSV** — same Basic-format schema we produced tonight:
   - `postAtSpecificTime (YYYY-MM-DD HH:mm:ss), content, link (OGmetaUrl), imageUrls, gifUrl, videoUrls`
   - `content` = caption + CTA + hashtags (blank lines between)
   - `imageUrls` = comma-separated Cloudinary URLs in slide order
   - Start date rule: **1st of the detected month** (from bundle naming like `2026_06_VO360_*`)
5. **Build summary** — human-readable `{Client}_{Month}_{Year}_Summary.md` listing each post (day, type, carousel slide count, first 80 chars of caption, warnings). Heavy on spot-checkability.
6. **Write outputs** — CSV + summary into `CSV Ready Zips/{Client}/`
7. **Notify** — macOS `osascript` notification: *"VO360 June 2026 ready — 30 posts. See Desktop/CSV Ready Zips/VO360/."*

## Mid-month New Client

A brand new client onboarded mid-month:

- User adds them to the Hub via the existing flow (creates `clients` row with `cloudinary_folder` + `posting_time`)
- User creates `CSV Ready Zips/NewClient/` folder
- User drops their first Manus bundle at `Manus-Social Planner/NewClient/2026_06_NewClient.zip`
- Next daily run → routine detects the drop, processes it
- **Start date rule for new clients**: if bundle delivered mid-month and the "target month" of its content matches the current month, start date = today's date + 1. If it targets a future month (e.g. bundle arrives June 20 but content is for July), start date = 1st of target month. (Target month parsed from filename prefix like `2026_07_...`)

## Trigger Mechanism

- **Claude's scheduled agent (routine)** — a one-line cron schedule expression
- **Cadence:** once per day, 08:00 local (before user's workday starts)
- **Runtime:** on the user's Mac (Claude Code CLI)
- **State:** none in the routine itself; all state is filesystem-derived (see Detection rule above)
- **Failure:** on error in any single client, log to a `.log` file in `CSV Ready Zips/_logs/` with timestamp; continue with the next client. macOS notification surfaces failures: *"Lyrie June ran into an issue — see logs."*

## What the Routine Prompt Looks Like

Plain-English instructions the user can edit:

> Every day at 8 AM, scan `~/Desktop/Manus-Social Planner/` for each client subfolder. For any month whose CSV is not already in `~/Desktop/CSV Ready Zips/{Client}/`, process the source bundle into a GHL-ready CSV and summary. Use the Onboarding Hub's Turso DB for per-client config. If something fails, log it and keep going with the next client. Notify me via macOS when there are new CSVs ready or errors to review.

## Error Handling

| Failure | Behavior |
|---|---|
| Client folder in Hub doesn't match any folder in `CSV Ready Zips/` | Silent — that client just isn't automated yet |
| Client folder exists in `CSV Ready Zips/` but not in Hub | Warning log, skip, notify user |
| Bundle format unrecognizable (no images found) | Log to `_logs/`, notify |
| Cloudinary upload fails for 1+ slide | Retry 3×; if still failing, log, produce CSV with placeholder URL, flag in summary |
| Turso DB unreachable | Log, skip entire run, notify |
| Filesystem permission issue on output folder | Log, notify |

## Components / Units

- `routine-prompt.md` — the Claude Routine definition (cron + natural-language prompt)
- `scripts/process-bundle.mjs` — the actual pipeline (extract → Cloudinary → CSV). Reusable standalone: you can point it at any bundle path for ad-hoc re-runs. This is a cleaned-up version of tonight's `generate_may_csv.mjs` + `regen_csv_only.mjs`.
- `scripts/build-summary.mjs` — takes a parsed bundle + CSV path and emits the summary MD
- `scripts/notify.sh` — wrapper around `osascript` for macOS notifications
- Files live under `~/ghl-sub-account-builder/scripts/daily-csv-routine/` (new dir) so they share env + dependencies with the hub

## Testing Plan

- **Dry-run mode** — routine prompt accepts a `--dry-run` flag → scans + prints pending work without processing. Use to sanity-check the detection logic before first real run.
- **Replay a past month** — delete `VO360_May_2026_GHL_Schedule.csv` from output folder and trigger the routine manually. Expected: rebuilds the exact same CSV (idempotent Cloudinary overwrite).
- **Missing client** — temporarily rename a Hub `clients` row → run routine → expect warning log, no crash.
- **Malformed bundle** — point the script at a random zip of photos (no manifest) → expect fallback to filename-heuristic path; if that also fails, expect a logged error, not a silent drop.

## Future (explicitly deferred)

- Auto-publish CSV to GHL via their API (skipped: review gate is a feature, not a bug)
- Generating missing manifest/post_kits from docx (we did this ad-hoc tonight; formalize only if Manus keeps shipping docx-only bundles)
- Slack / email notifications
- Content preview rendering (carousel flipbook) — the summary MD is enough for spot-check
- Re-use the hub's Manus Import UI as a fallback entry point — the routine renders it redundant

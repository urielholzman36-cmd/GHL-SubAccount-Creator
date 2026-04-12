# M3 Social Planner — Design Spec

**Date:** 2026-04-12
**Module:** M3 — Social Planner
**App:** Client Onboarding Hub (`~/ghl-sub-account-builder`)
**Stack:** Node.js + Express + better-sqlite3 + React 19 + Vite + Tailwind

---

## 1. Overview

M3 adds a **Social Planner** module to the Onboarding Hub. The Hub evolves from a one-time website setup tool into the single home for all client operations — account creation, website builds, AND recurring monthly social content.

The Social Planner generates a full 30-day social media content package for a client: strategy, captions, AI-generated images, watermarking, Cloudinary hosting, and a GHL-ready CSV. It runs monthly per client.

### Key Decisions

- **Integrated into the Hub** (not a separate app). Reuses existing Express + React stack.
- **Separate tab** via hamburger nav (not part of the build-runner pipeline). Social is recurring, not one-time.
- **Hybrid brief model** — stable Brand Profile per client + lightweight monthly theme per cycle.
- **Manus AI is optional** — per-client setting, default OFF. When ON, pauses for manual research paste-in.
- **Image generation automated** — triggers existing `krea-image-generation` Python skill as subprocess.
- **Watermark + Cloudinary upload** — ported from krea-agent (`postprocess.ts`, `upload.ts`).
- **Output** — GHL Social Planner CSV (39-column format). User uploads to GHL manually.

---

## 2. Pipeline — 7 Steps

Each campaign (one month for one client) runs through a 7-step pipeline. Steps 4 and 7 are manual checkpoints; the rest auto-run.

| # | Step | Type | What Happens |
|---|------|------|--------------|
| 1 | **Monthly Brief** | User input | Pick client, pick month, enter theme/focus, set start date and posting time |
| 2 | **Research** | Auto (+optional manual) | Claude web search (industry, seasonal, holidays, competitors) → Research Brief. If client has `uses_manus=true`, pauses for Manus paste-in with pre-filled prompt |
| 3 | **Strategy Pack** | Auto | Claude Sonnet generates 5-pillar 30-day pack: pillar, type, hook, caption, hashtags, CTA, visual prompt per day |
| 4 | **Review Strategy** | Manual checkpoint | User reviews/edits all 30 posts. Captions, hashtags, visual prompts all editable. "Approve & Generate Images" button advances |
| 5 | **Generate Images** | Auto | Hub writes a prompts CSV from visual prompts, spawns `krea-image-generation` Python script, monitors stdout for progress |
| 6 | **Watermark + Upload** | Auto | Sharp applies client logo watermark, Cloudinary uploads to `krea-agent/<Client-Name>/`. Each successful upload writes URL to DB immediately |
| 7 | **Review Final + Export CSV** | Manual checkpoint | Full post cards with images, inline caption/hashtag editing, schedule picker, "Download GHL CSV" button |

Step flow mirrors the existing `build-runner.js` pattern: glowing status cards, SSE progress streaming, pause/resume semantics.

---

## 3. Data Model

Three new tables in `better-sqlite3`. Added via `db/social-schema.js` (same pattern as existing `db/schema.js`).

### `clients`

Persistent client registry. The Brand Profile — set once, editable anytime.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | ULID |
| name | TEXT NOT NULL | "Calispark Electric", "VO360" |
| industry | TEXT | "Electrician", "SaaS" |
| location | TEXT | "San Diego, CA" |
| website | TEXT | nullable |
| logo_path | TEXT | local path to logo file (used for watermark) |
| cloudinary_folder | TEXT | e.g., `krea-agent/Calispark-Electric` |
| platforms | TEXT | JSON array: `["facebook","instagram"]` |
| posting_time | TEXT | default `09:00:00` |
| brand_tone | TEXT | "official, luxury, authoritative" |
| brand_description | TEXT | elevator pitch / value prop |
| target_audience | TEXT | who the content speaks to |
| services | TEXT | JSON array of offerings |
| content_pillars | TEXT | JSON array of 5 pillars (customizable names per client) |
| hashtag_bank | TEXT | JSON array of always-use hashtags |
| cta_style | TEXT | "DM us KEYWORD", "Link in bio", etc. |
| uses_manus | INTEGER | 0 or 1, default 0 |
| watermark_position | TEXT | default `bottom-right` |
| watermark_opacity | REAL | default 0.7 |
| created_at | TEXT | ISO timestamp |

### `campaigns`

One row per monthly cycle per client.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | ULID |
| client_id | TEXT FK | → clients.id |
| month | TEXT | `2026-04` (year-month) |
| theme | TEXT | "Spring cleaning + panel upgrades" |
| start_date | TEXT | first posting date `2026-04-12` |
| status | TEXT | `draft` → `researching` → `generating_strategy` → `review_strategy` → `generating_images` → `watermarking` → `review_final` → `exported` |
| research_brief | TEXT | Claude web search output |
| manus_research | TEXT | nullable — pasted Manus output |
| strategy_pack | TEXT | JSON — the full 30-day structured pack |
| prompts_csv_path | TEXT | path to generated Krea prompts CSV |
| images_folder | TEXT | path to generated images folder |
| csv_path | TEXT | path to final GHL CSV |
| current_step | INTEGER | 1-7 |
| created_at | TEXT | ISO timestamp |

### `campaign_posts`

One row per post. 30 per campaign.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | ULID |
| campaign_id | TEXT FK | → campaigns.id |
| day_number | INTEGER | 1-30 |
| post_date | TEXT | `2026-04-12` |
| pillar | TEXT | PAIN / SOLUTION / AUTHORITY / PROOF / CTA |
| post_type | TEXT | single / carousel / before_after |
| concept | TEXT | short title |
| caption | TEXT | full caption text |
| hashtags | TEXT | space-separated with # |
| cta | TEXT | call to action line |
| visual_prompt | TEXT | Krea AI prompt |
| image_urls | TEXT | JSON array of Cloudinary URLs (filled after step 6) |
| slide_count | INTEGER | 1 for single, 2-5 for carousel/before_after |
| category | TEXT | default "Product Showcase" |
| edited | INTEGER | 0 or 1 — tracks if user modified during review |

No separate images table. Carousel URLs are a JSON array on `image_urls`. Simpler to query and export.

---

## 4. Module Boundaries

### Server-side (new files in `server/`)

| File | Purpose | Source |
|------|---------|--------|
| `services/social-runner.js` | 7-step pipeline orchestrator | New — mirrors build-runner.js pattern |
| `services/social-research.js` | Claude web search + Manus merge | New |
| `services/social-strategy.js` | Claude Sonnet → Strategy Pack JSON → campaign_posts rows | New |
| `services/social-images.js` | Spawns krea Python script, tracks stdout progress, writes prompts CSV | New |
| `services/social-watermark.js` | Sharp watermark + Cloudinary upload | Ported from krea-agent `postprocess.ts` + `upload.ts` |
| `services/social-csv.js` | Builds GHL 39-column CSV from campaign_posts | New — Calispark CSV as template |
| `routes/clients.js` | CRUD for clients table + logo upload | New |
| `routes/campaigns.js` | CRUD for campaigns + SSE progress + step actions | New |
| `db/social-schema.js` | Table creation for clients, campaigns, campaign_posts | New |

### Client-side (new files in `client/src/`)

| File | Purpose |
|------|---------|
| `pages/SocialPlanner.jsx` | Client list grid + "New Client" button |
| `pages/ClientProfile.jsx` | Brand Profile form (add/edit client) |
| `pages/CampaignDashboard.jsx` | 7-step progress view with glowing step cards |
| `components/StrategyReview.jsx` | Step 4 — editable 30-post table, pillar badges, caption editing |
| `components/FinalReview.jsx` | Step 7 — post cards with images, inline edit, schedule picker, CSV download |
| `components/ManusPasteModal.jsx` | Modal for Manus research paste-in |

### Untouched
- `build-runner.js` and all Phase 1-3 code — zero changes
- Login/auth system — same `vo360` password
- Existing Build functionality — no visual or functional changes

### New dependencies
- `sharp` — image processing (watermark)
- `cloudinary` — image hosting
- No new frameworks. Pure Express + better-sqlite3 + React.

---

## 5. Navigation + UI

### Hamburger Menu

Replaces the current single-page layout with a hamburger nav:

- **Hamburger icon** (three lines) in the top-left of the header bar
- Click → slides open a dark glassmorphic drawer from the left
- Menu items: **Build** | **Social Planner** (room for future modules)
- Active page gets a glowing accent indicator
- Click outside or click icon again → closes drawer
- Build is default-selected so existing behavior is unchanged on launch

### Social Planner Screens (5 screens)

**Screen 1 — Client List** (landing page of Social Planner tab)
- Grid of client cards: name, industry, logo thumbnail, last campaign month, status badge
- "+ New Client" button → Screen 2
- Click client card → Screen 3

**Screen 2 — Client Profile (Brand Brief form)**
- Grouped sections: Business Info | Brand Identity | Content Strategy | Image Settings | Advanced
- Maps directly to `clients` table columns
- Save creates/updates client record
- Back arrow returns to Client List

**Screen 3 — Client Campaigns**
- Client name + logo header
- Table of past campaigns: month, theme, status badge, "Download CSV" for exported ones
- "+ New Campaign" button → creates draft campaign, opens Screen 4
- Click any row → Screen 4

**Screen 4 — Campaign Dashboard (7-step runner)**
- Same visual pattern as Build progress: full-width, 7 step cards in vertical column, glowing status
- Step 1 card: inline form (month, theme, start date). "Start" button kicks off pipeline
- Steps 2-3: auto-run with spinners + SSE progress
- Step 2 Manus pause (if enabled): card expands with research brief + prompt + paste textarea + "Continue" button
- Step 4: expands into Screen 5 (Strategy Review) inline
- Steps 5-6: auto-run with progress bar ("Generating image 14/30...")
- Step 7: expands into Final Review with images + CSV download

**Screen 5 — Strategy Review** (embedded in step 4)
- 30-post scrollable list, each row:
  - Day number + date badge
  - Pillar badge (color-coded: PAIN=red, SOLUTION=blue, AUTHORITY=gold, PROOF=green, CTA=purple)
  - Post type badge (single/carousel/before_after)
  - Concept title
  - Caption (editable textarea, click to expand)
  - Hashtags (editable)
  - Visual prompt (editable — what Krea generates from)
- "Approve & Generate Images" button at bottom → advances to step 5

Step 7 Final Review is similar but adds image thumbnails, date/time schedule column, and "Download GHL CSV" button.

---

## 6. Error Handling + Resume

**Principle:** Every step writes output to DB/disk incrementally. The runner reads current state on resume and picks up where it left off. Same pattern as `build-runner.js`.

| Step | If it fails... | Resume behavior |
|------|----------------|-----------------|
| 1 Monthly Brief | Form validation error | User fixes and resubmits — no state to lose |
| 2 Research | Claude API error | Retry button. Research brief saved to DB as soon as it completes. Partial success (web search done, Manus pending) preserved |
| 3 Strategy Pack | Claude API error or malformed JSON | Retry button. Retries up to 2x with stricter prompt. After 3 fails, pauses for manual intervention |
| 4 Review Strategy | N/A (manual) | Edits auto-save on field blur |
| 5 Generate Images | Krea timeout/402/429 | Krea script has built-in skip logic for existing images. Resume = re-run script, it generates only missing images. Progress bar shows "23/30 complete, generating remaining 7..." |
| 6 Watermark + Upload | Sharp crash or Cloudinary error | Processes one image at a time. Each successful upload writes Cloudinary URL to `campaign_posts.image_urls` immediately. Resume skips posts that already have URLs |
| 7 Final Review + CSV | N/A (manual) | CSV generation is instant (pure string building). No failure risk |

Each step card shows a **"Reset Step"** button when status = failed. Wipes that step's output and re-runs from scratch.

---

## 7. Testing Strategy

**Principle:** Every step testable in isolation, every API mockable, full pipeline runnable in dry-run mode.

### Unit Tests (Vitest)

| Module | Key test cases |
|--------|---------------|
| `social-csv.js` | Correct 39-column GHL format. Carousels produce comma-separated URLs. Dates increment correctly. Hashtag formatting. Edge: 28-day Feb, month boundary |
| `social-strategy.js` | Prompt builder valid. JSON parser handles Claude quirks (markdown wrapping). Pillar distribution balanced (6 each). 30 posts produced |
| `social-watermark.js` | All 4 positions correct. Opacity applied. Logo = 15% image width. Output = valid PNG |
| `social-research.js` | Manus merge combines correctly. Empty Manus = web search only |
| `social-images.js` | Prompts CSV correct columns. Skip logic detects existing images. Stdout progress parsing |
| `social-runner.js` | Step transitions correct order. Resume from any step. Failed step doesn't advance. Status written to DB |
| DB schema | Tables created. Foreign keys enforced. Status transitions validated |
| Clients CRUD | Create, read, update, delete. Required field validation. JSON fields parse correctly |

### Dry-Run Mode

Env var `DRY_RUN=true` lets you run the **full 7-step pipeline** without hitting any external API:

| Step | Dry-run behavior |
|------|-----------------|
| 2 Research | Returns canned research brief from `test/fixtures/sample-research.json` |
| 3 Strategy Pack | Returns VO360 April strategy pack from `test/fixtures/sample-strategy.json` |
| 5 Generate Images | Copies 30 placeholder PNGs from `test/fixtures/sample-images/` (same folder structure as real output) |
| 6 Watermark + Upload | Watermark runs for real (Sharp is local). Cloudinary upload skipped — writes fake URLs `https://res.cloudinary.com/holztech/dry-run/1.jpg` |

Full pipeline clickable end-to-end in under 30 seconds, zero API credits.

### 1-Post Integration Test

A "test mode" runs the full pipeline with **1 post instead of 30**:
- Claude generates 1-day strategy
- Krea generates 1 image
- Cloudinary uploads 1 image
- CSV has 1 data row

Total cost: ~$0.01 Claude + 1 Krea credit + 1 Cloudinary upload. Proves the full chain end-to-end before committing to a 30-post run.

### Test Fixtures (from real client files)

| Fixture | Source |
|---------|--------|
| `sample-strategy.json` | Derived from VO360 April Strategy Pack (docx) |
| `sample-content.json` | VO360 `content.json` (30 posts) |
| `sample-brief.json` | Derived from VO360 Client Brief Master (docx) |
| `sample-csv-output.csv` | Calispark Electric CSV (expected output format) |
| `sample-images/` | 30 small placeholder PNGs in correct folder structure |

---

## 8. Reference Files

| What | Path |
|------|------|
| Krea skill | `~/.claude/skills/krea-image-generation/SKILL.md` |
| Krea Python script | `~/.claude/skills/krea-image-generation/generate_images.py` |
| krea-agent watermark | `~/krea-agent/src/lib/postprocess.ts` |
| krea-agent upload | `~/krea-agent/src/lib/upload.ts` |
| krea-agent schema | `~/krea-agent/src/lib/schema.ts` |
| krea-agent platforms | `~/krea-agent/src/lib/platforms.ts` |
| Current build-runner | `~/ghl-sub-account-builder/server/services/build-runner.js` |
| Calispark CSV (GHL format) | `~/Desktop/Calispark Electric-schedule (5).csv` |
| VO360 content.json | `~/Desktop/Social Planner Project Cowork/.../VO360/april/content.json` |
| VO360 Strategy Pack | `~/Desktop/Social Planner Project Cowork/.../VO360/april/VO360_Strategy_Pack_April_2026.docx` |
| VO360 Client Brief | `~/Desktop/Social Planner Project Cowork/.../VO360/VO360_Client_Brief_Master.docx` |

---

## 9. Environment Variables (new)

Added to existing `.env`:

```
CLOUDINARY_CLOUD_NAME=holztech
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>
```

Krea API key is pre-configured in the skill — no env var needed in the Hub.

Claude / Anthropic API key already exists in `.env` (`ANTHROPIC_API_KEY`).

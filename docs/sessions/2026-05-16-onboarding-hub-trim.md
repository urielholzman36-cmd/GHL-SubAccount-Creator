# 2026-05-16 — Trim Onboarding Hub to its core

Major scope reduction + GHL 403 fix. Deployed to prod.

## Outcome

- App reduced from full Command Center to focused **Onboarding Hub**.
- Build pipeline went from 10 steps → 1 step (Create GHL Sub-Account).
- Production: https://vo360-onboarding-hub.vercel.app (deployment `i3yca75vk`).
- Net diff: 70 files changed, **+83 / -8295** lines.

## GHL 403 bug

**Symptom:** Sub-account creation for "Good Home Remodeling" failed in prod with
`GHL API error: 403 Forbidden resource`.

**Root cause:** Client #9 had `country: "United States"` stored on the row.
GHL's `POST /locations/` rejects non-ISO country codes. Locally the same payload
returned 422 ("country must be a valid enum value"); prod returned 403 — either
way the data was wrong.

**Fix:**
- `server/services/build-runner.js` — `normalizeCountry()` at the GHL API
  boundary. Maps `"United States"`, `"USA"`, etc. → `"US"`. Handles 2-letter
  codes pass-through; unknown values fall back to `'US'`.
- `src/components/BuildForm.jsx` — `normalizeCountryCode()` on client prefill,
  so the dropdown shows the right value when loading existing clients.

Existing client rows with `country: "United States"` were left as-is in Turso
(the boundary normalizer handles them at runtime). A test sub-account
`__ghr_test_*` was created during debugging and deleted after.

## Removed features

### 10Web + WordPress pipeline (steps 2-10)

The whole "generate prompt → user pastes into 10Web → WordPress provisioned →
plugins/logo/legal/FAQ published" flow was deleted. The user said they're no
longer using 10Web.

Deleted:
- `server/services/prompt-generator.js`
- `server/services/page-prompt-generator.js`
- `server/services/wordpress.js`
- `server/services/content-generator.js`
- `server/routes/page-prompts.js`
- `src/pages/PageGenerator.jsx`
- `src/components/AwaitingWebsiteBanner.jsx`
- `src/components/PagePromptHistory.jsx`
- The `/resume` and `/skip-website` build routes
- The "Page Generator" sidebar entry

Trimmed:
- `server/services/phases.config.js` — phases list now contains only step 1.
- `server/services/build-runner.js` — rewritten as a minimal step-1-only runner.
- `src/hooks/useSSE.js` — phases reduced to match.
- `src/components/ProgressTracker.jsx` — pause/resume UI removed; "complete"
  state now reads "Sub-Account Created!".
- `src/components/BuildDetailRow.jsx` — pause banner + WP links removed.

### Social Planner

Separate project handles this now. Deleted:
- `src/pages/SocialPlanner.jsx`, `ClientCampaigns.jsx`, `CampaignDashboard.jsx`,
  `CampaignPreview.jsx`, `ManusImport.jsx`, `ClientProfile.jsx` (social-flavored
  editor).
- `src/components/social/` (whole directory).
- `src/hooks/useCampaignSSE.js`.
- `server/routes/campaigns.js`.
- `server/services/social-runner.js`, `social-research.js`, `social-strategy.js`,
  `social-images.js`, `social-csv.js`.
- `server/services/manus-importer.js`, `recap-generator.js`, `pipelines.js`,
  `phone-fallback.js`.
- The public `/api/preview/:id` endpoint.

Kept (still useful):
- `server/services/social-cloudinary.js` — `initCloudinary()` is used by the
  clients route for logo uploads. Despite the name, it's not Social-specific.
- `server/db/social-queries.js` — the file name is misleading; the client CRUD
  functions used by `routes/clients.js` live here. Campaign/post functions
  inside are now dead but harmless.

### Proposals

User said Manus handles this now. Deleted:
- `src/pages/proposals/` (list + new).
- `server/modules/proposals/` (whole module, including `schema.js`,
  `routes.js`, and PDF/DOCX services).
- Proposals DB tables are no longer initialized.

`server/modules/proposals/services/brand.js` was relocated to
`server/modules/reports/services/brand.js` because `reports/pdf-builder.js`
depended on it (`BRAND` constants + `getLogoBuffer`).

## Mobile responsiveness sweep

Tailwind v4. Sidebar already had a working mobile drawer with hamburger toggle
— kept as-is. Page-level fixes:

- `p-8 pl-16` → `p-4 sm:p-8 sm:pl-16` across 12 pages (ManusImport,
  ImportClientResearch, ClientCampaigns, CampaignDashboard, SocialPlanner,
  ClientProfile, kb/*, proposals/* — many later deleted, but the pattern
  applied to surviving pages too).
- `p-6 max-w-*` → `p-4 sm:p-6 max-w-*` across 10 surviving pages (Users,
  ClientDetail, ClientList, Settings, NewBuild, Dashboard, health/*,
  reports/*).
- `BuildTable` table: wrapped in `overflow-x-auto` + `min-w-[640px]` so the
  6-column table scrolls horizontally on phones.
- `BuildForm` rigid `grid-cols-2` (3 instances) → `grid-cols-1 sm:grid-cols-2`.
- `CampaignDashboard` rigid `grid-cols-2 gap-3` → responsive (file later
  deleted).
- `ProgressTracker` step cards: `grid-cols-3 lg:grid-cols-4` →
  `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

## Sidebar after trim

- **Overview**: Dashboard, Clients
- **Operations**: Onboarding, Health Monitor, Reports
- **Internal**: Knowledge Base, Settings, Users

(Removed: Page Generator, Social Planner, the entire Sales section with
Proposals.)

## ClientDetail buttons after trim

- Header: Delete only (was: Edit Full Profile + Delete).
- Quick Actions: Health + Generate Report (was: Social Planner + Health +
  Generate Report + Create Proposal).

## Things to know going forward

- New client creation now goes through **Onboarding** (NewBuild form) or
  **Clients → Import from Research** only. The dedicated client-profile
  editor at `/social/client/new` is gone.
- `ImportClientResearch` final navigate target was changed from
  `/social/client/${id}` → `/clients/${id}`.
- The `builds` table still has `tenweb_prompt`, `wp_url`, `wp_username`,
  `wp_password_encrypted`, `privacy_policy_url`, `terms_url`, `faq_url`,
  `paused_at_step`, `pause_context` columns. They're unused but kept to
  avoid a destructive schema migration on existing rows.
- The `page_prompts` table is still created (idempotent `CREATE TABLE IF
  NOT EXISTS`) but unused.
- Local dev tests for `build-runner` need `better-sqlite3`, which isn't
  installed; existing infra issue, not caused by this session.

## Commit

`2c70c5c` on `main`. Co-authored: Claude Opus 4.7.

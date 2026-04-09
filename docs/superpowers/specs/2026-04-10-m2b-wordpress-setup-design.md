# M2b: Automated WordPress Post-Setup

**Date:** 2026-04-10
**Status:** Approved
**Depends on:** M2a (verified 2026-04-10)

## Overview

After the user builds a site on 10web and enters WordPress credentials (M2a step 3), the pipeline continues with 8 automated steps that install plugins, upload the logo, generate professional legal/FAQ content, publish pages, and apply a full-site CSS overhaul. No manual intervention required after entering credentials.

## Pipeline (11 steps, 3 phases)

| Step | Phase | Name | Type |
|------|-------|------|------|
| 1 | 1 — GHL Setup | Create Sub-Account | GHL API |
| 2 | 2 — Website Build | Generate 10web Prompt | Claude API |
| 3 | 2 — Website Build | Website Creation (Manual) | Pause — user builds on 10web, enters WP creds |
| 4 | 3 — WordPress Setup | Validate WordPress | WP REST API — test connection |
| 5 | 3 — WordPress Setup | Install Plugins | WP REST API — install + activate 3 plugins |
| 6 | 3 — WordPress Setup | Upload Logo | WP REST API — upload media, set site_logo + site_icon |
| 7 | 3 — WordPress Setup | Fix Header | WP REST API — delete header-home template (best-effort) |
| 8 | 3 — WordPress Setup | Generate Legal Pages | Claude API — Privacy Policy + Terms of Service |
| 9 | 3 — WordPress Setup | Generate FAQ | Claude API — 100 business-specific FAQs |
| 10 | 3 — WordPress Setup | Publish Pages | WP REST API — create 3 pages with clean HTML |
| 11 | 3 — WordPress Setup | Apply Site CSS | Claude API — full-site CSS overhaul, apply via WP custom CSS |

Steps 4-11 run automatically after step 3 resumes. No additional pauses.

## New module: `server/services/wordpress.js`

Single `WordPressClient` class. Constructed with `{ url, username, appPassword }`. Credentials decrypted from DB at runtime using existing `crypto.js`.

### Methods

- **`validateConnection()`** — `GET /wp/v2/settings`. Confirms credentials work. Throws if auth fails.
- **`installPlugin(slug)`** — `POST /wp/v2/plugins` with `{ slug, status: 'active' }`. Installs and activates in one call.
- **`uploadMedia(filePath, filename)`** — `POST /wp/v2/media` with binary file body and `Content-Disposition` header. Returns `{ id, source_url }`.
- **`setSiteLogo(mediaId)`** — `POST /wp/v2/settings` with `{ site_logo: mediaId, site_icon: mediaId }`.
- **`deleteTemplate(slug)`** — `DELETE /wp/v2/templates/{slug}?force=true`. Swallows all errors (404, 403, etc.) — never throws.
- **`createPage(title, htmlContent)`** — `POST /wp/v2/pages` with `{ title, content, status: 'publish' }`. Returns `{ id, link }`.
- **`getCustomCSS()`** — `GET /wp/v2/custom_css`. Returns existing CSS string or empty string.
- **`setCustomCSS(css)`** — Fetches existing CSS via `getCustomCSS()`, appends new CSS after marker `/* === VO360 Onboarding — Auto-generated === */`, then `POST /wp/v2/custom_css` (or `PUT` if one already exists).

### Auth

All requests use Basic Auth: `Authorization: Basic base64(username:appPassword)`.

### Error handling

Every method (except `deleteTemplate`) throws descriptive errors: `WP API {status}: {responseText}`. The build runner's existing retry logic (3 retries with exponential backoff) handles transient failures.

## New module: `server/services/content-generator.js`

Three functions that call Claude API. Each uses the user's battle-tested expert prompts, adapted to skip the interactive Q&A phase by feeding business details directly.

### `generateLegalDocs(build)`

- **Model:** `claude-sonnet-4-6`
- **System prompt:** User's Privacy Policy + ToS expert prompt (stored as constant)
- **User message:** Pre-answers all questions with data from the build record: `business_name`, `business_description`, `business_email`, `business_phone`
- **Output:** Two HTML documents separated by `<!-- SPLIT -->` marker
- **Returns:** `{ privacyPolicy: string, termsOfService: string }`

### `generateFAQ(build)`

- **Model:** `claude-sonnet-4-6`
- **System prompt:** User's FAQ expert prompt (stored as constant)
- **User message:** Pre-answers with: company name, description, industry, location, target audience, services offered. Instructs Claude to skip Phase 1 and go directly to generation.
- **Output:** Clean HTML with 100 FAQ items across 8-12 categories
- **Returns:** `string` (HTML)

### `generateSiteCSS(build)`

- **Model:** `claude-opus-4-6` (needs stronger design reasoning)
- **System prompt:** Expert CSS generation instructions
- **User message includes:**
  - Brand colors (from `build.brand_colors`, extracted from logo)
  - Business type and industry (`build.industry_text`, `build.business_description`)
  - The 10web prompt (`build.tenweb_prompt`) — so Claude knows exactly what the site looks like
  - The site's existing CSS (fetched via `WordPressClient.getCustomCSS()`)
  - Instructions: generate a premium full-site CSS overhaul covering typography, color scheme, buttons, header/footer, cards, forms, hover states, spacing, and polished styling for the legal/FAQ pages
- **Output:** Raw CSS only (no markdown code fences)
- **Returns:** `string` (CSS)

## Build runner changes

### `_runStepLogic` switch cases

Expand from 3 cases to 11. Steps 4-11 use `WordPressClient` and `content-generator`:

- **Step 4 (`_step4ValidateWP`):** Decrypt credentials, construct `WordPressClient`, call `validateConnection()`. Store client details in `state` for subsequent steps.
- **Step 5 (`_step5InstallPlugins`):** Loop through `['allaccessible', 'leadconnector', 'wp-call-button']`, call `installPlugin()` for each. Continue if one fails (log warning).
- **Step 6 (`_step6UploadLogo`):** Read logo file from `build.logo_path`, call `uploadMedia()`, then `setSiteLogo()`.
- **Step 7 (`_step7FixHeader`):** Call `deleteTemplate('header-home')`. This step is **optional** — marked in phases config so failures produce warnings, not build failures.
- **Step 8 (`_step8GenerateLegal`):** Call `generateLegalDocs(build)`. Store result in `state.privacyPolicy` and `state.termsOfService`.
- **Step 9 (`_step9GenerateFAQ`):** Call `generateFAQ(build)`. Store result in `state.faqHtml`.
- **Step 10 (`_step10PublishPages`):** Call `createPage()` three times: Privacy Policy, Terms of Service, FAQ. Store page URLs in DB.
- **Step 11 (`_step11ApplySiteCSS`):** Call `generateSiteCSS(build)` (which internally fetches existing CSS), then `setCustomCSS()` to apply.

### Credential handling

Step 3 (resume) already stores encrypted WP credentials in the DB (`wp_url`, `wp_username`, `wp_password_encrypted`). Steps 4-11 decrypt `wp_password_encrypted` using existing `crypto.js` `decrypt()` function to construct the `WordPressClient`.

## Phases config update

```
Phase 1: GHL Sub-Account Setup
  Step 1: Create Sub-Account

Phase 2: Website Build
  Step 2: Generate 10web Prompt
  Step 3: Website Creation (Manual) [pausesForManualInput]

Phase 3: WordPress Setup
  Step 4: Validate WordPress
  Step 5: Install Plugins
  Step 6: Upload Logo
  Step 7: Fix Header [optional]
  Step 8: Generate Legal Pages
  Step 9: Generate FAQ
  Step 10: Publish Pages
  Step 11: Apply Site CSS
```

## UI changes

Minimal changes to existing components:

- **`useSSE.js`** — Update `DEFAULT_PHASES` to include Phase 3 with steps 4-11
- **`ProgressTracker.jsx`** — Change step cards grid from `grid-cols-3` to responsive: `grid-cols-3 lg:grid-cols-4` to handle 11 steps across multiple rows
- **`phases.config.js`** — Add Phase 3 with 8 steps, mark step 7 as `optional: true`
- **No new UI components needed** — existing step cards, progress bar, and status indicators handle everything

## DB changes

Additive migration — 3 new optional columns on `builds`:

- `privacy_policy_url TEXT` — URL of published Privacy Policy page
- `terms_url TEXT` — URL of published Terms of Service page
- `faq_url TEXT` — URL of published FAQ page

## Default plugins

Hardcoded constant array:
```
['allaccessible', 'leadconnector', 'wp-call-button']
```

## Expert prompts

The FAQ and Privacy Policy + ToS prompts are stored as string constants in `content-generator.js`. These are the user's refined, battle-tested prompts — not generated from scratch.

## Error handling

- Steps 4-11 use the same retry logic as steps 1-3 (3 retries, exponential backoff)
- Step 7 (Fix Header) is marked `optional: true` — failures produce warnings, not build failures
- Step 5 (Install Plugins) continues through individual plugin failures — logs which ones failed
- All WordPress API errors include status code and response text for debugging
- If Claude returns malformed content (no SPLIT marker, empty response), the step fails with a descriptive error and can be retried

## Testing

- Unit tests for `WordPressClient` methods (mock fetch)
- Unit tests for `content-generator` functions (mock Claude API)
- Unit tests for build runner steps 4-11 (mock both WP client and content generator)
- Integration test: full pipeline with mocked external APIs

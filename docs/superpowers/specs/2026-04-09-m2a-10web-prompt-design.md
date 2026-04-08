# M2a: 10web Prompt Generation + Manual Pause Design

**Date:** 2026-04-09
**Scope:** Milestone 2, sub-milestone A (M2a) of the Client Onboarding Automator. Replaces the Phase 2 stub step with two real steps: generate a ready-to-paste 10web prompt via Claude, then pause for the operator to create the site in 10web and hand back WordPress credentials.
**App:** `~/ghl-sub-account-builder` (Client Onboarding Hub)
**Parent context:** M1 (phased runner + pause/resume) shipped 2026-04-08. Phase 1 cleanup shipped 2026-04-09. This is the first real Phase 2 milestone.

---

## Motivation

After Phase 1 cleanup, Phase 2 contains a single stub step that only exists to exercise the pause mechanism. M2a replaces it with the first real onboarding work: using Claude to turn client data into a production-quality 10web prompt, then handing off to the operator to create the site manually (10web has no API). When the operator finishes, they paste WordPress credentials into the pause UI so M2b can pick up automated post-setup later.

This milestone gets the Client Onboarding Hub to the point where **most of the human work of setting up a new client website is eliminated**: the operator fills one form, the tool produces a paste-ready prompt tailored to the client, the operator pastes it into 10web, waits ~2 minutes, and types credentials.

---

## Scope

### In scope
1. Add three new form fields: free-text Industry, free-text Target Audience, Logo file upload with client-side color extraction.
2. Store logo on local filesystem, store extracted brand color palette and the text fields on the build row.
3. Add new DB columns on `builds`: `industry_text`, `target_audience`, `logo_path`, `brand_colors` (JSON), `tenweb_prompt`, `wp_url`, `wp_username`, `wp_password_encrypted`.
4. Accept multipart form data on `POST /api/builds` (for the logo file).
5. Replace Phase 2's single stub step with two real steps:
   - Step 3: Generate 10web Prompt (Claude API call)
   - Step 4: Website Creation (Manual) (pauses for manual website creation + credential capture)
6. Integrate Claude API via direct REST (no SDK) using the user's provided system prompt.
7. Enhance the paused-state UI so the pause banner renders the generated prompt with a copy button, an Open 10web link, and three credential input fields (URL / Username / App Password) plus a Continue button. Applies to both the ProgressTracker (fresh build page) and the expanded BuildDetailRow (history page).
8. Encrypt WP credentials with AES-256-GCM at rest using a new `CREDENTIALS_KEY` env var.
9. All existing tests keep passing. New unit tests cover the prompt-generator module, the resume-with-credentials flow, and the multipart upload flow.
10. Manual end-to-end verification against real GHL + real 10web: create a build, copy the generated prompt into 10web, wait for the site, paste credentials back, confirm the build completes.

### Out of scope (deferred to M2b)
- Validating WP credentials by hitting `/wp-json/wp/v2/`.
- Installing plugins (Allaccessible, LeadConnector, WP Call Button).
- Uploading the logo to WordPress and setting it as site logo.
- Fixing the 10web duplicate header-home template quirk.
- Generating + publishing Privacy Policy, Terms of Service, FAQ pages.
- Generating and applying custom CSS for legal pages.
- Any WordPress REST API integration at all.

### Out of scope (not planned)
- Industry + audience + design style getting passed to GHL sub-account creation. The GHL payload still hard-codes `industry: 'general'` as set up yesterday.
- Uploading the logo to Cloudinary or any cloud storage. Local filesystem only.
- Brand color editing beyond add/remove (no complex color theory UI).
- Design style as a form field. Claude will infer an appropriate design style from the industry and audience text.

---

## Architecture

### Form change

A new **Website & Branding** section between the existing Configuration and Account Owner sections of the build form.

| Field | Type | Required | Used for |
|-------|------|----------|----------|
| Industry | text input | yes | Claude prompt only |
| Target Audience | textarea | yes | Claude prompt only |
| Logo | file input (.png .jpg .jpeg .svg, max 5MB) | yes | Claude prompt + M2b WordPress upload |

**Color extraction:** when the operator picks a file, the browser loads the file into an `<img>` element, then uses the `colorthief` library to pull 3-5 dominant colors. The palette is rendered as a row of swatches under the logo preview. Each swatch has an X to remove it. A "+ Add color" button opens an `<input type="color">`. The final array of hex strings goes into the form state as `brandColors`.

**Form submit:** `multipart/form-data` POST to `/api/builds`. The logo file rides along as a file part; all other fields (including `brandColors` as a JSON string) are text parts. The submit mapping that currently translates camelCase → snake_case extends to the new fields.

### Backend storage

**New columns on `builds`:**
- `industry_text` TEXT — free-text industry from the form.
- `target_audience` TEXT — free-text audience from the form.
- `logo_path` TEXT — relative path like `data/logos/{buildId}.png`.
- `brand_colors` TEXT — JSON array of hex strings e.g. `["#123456","#abcdef"]`.
- `tenweb_prompt` TEXT — the full Claude response text, stored after step 3 succeeds.
- `wp_url` TEXT — WordPress site URL, set during resume from step 4.
- `wp_username` TEXT — WordPress username, set during resume.
- `wp_password_encrypted` TEXT — AES-256-GCM encrypted application password, set during resume.

Migration: additive, applied at server startup the same way the M1 migrations are. No destructive changes.

**Logo storage:** `data/logos/` directory, created at startup if missing. Files named `{buildId}.{extension}`. `data/` is gitignored.

### Multipart upload

Add `multer` as a dependency. Configure with disk storage, destination `data/logos/`, filename derived from a pre-generated UUID (generated in the route handler before multer sees the request, so the uuid can be used for both the build id and the logo filename). Max file size 5 MB. File type filter to allow only `image/png`, `image/jpeg`, `image/svg+xml`.

The existing `POST /api/builds` handler gets wrapped in the multer middleware. JSON parsing stays for the existing endpoints. The route body goes through the existing validation but with two additions: `brand_colors` is JSON-parsed if present, `industry_text` / `target_audience` / `logo_path` are trimmed-and-stored.

### Phase 2 step structure

`phases.config.js` is updated so Phase 2 has two steps:

```
Phase 2: Website Build
  3. Generate 10web Prompt  (fatal)
  4. Website Creation (Manual)  (pauses for manual input)
```

The existing Phase 1 is unchanged. The stub step 3 from M1 is renumbered and replaced.

### Step 3: Generate 10web Prompt

New module: `server/services/prompt-generator.js`. Exports:
- `SYSTEM_PROMPT` — the exact multi-line system prompt the user supplied, stored as a template literal.
- `buildUserMessage(build)` — returns a single-string user message containing the structured answers to the 10 discovery questions, pre-filled from the build row. Phase 1 of the system prompt (the 10 questions) is effectively satisfied by this message, so Claude jumps directly to Phase 2 (prompt generation).
- `async generatePrompt(build, { apiKey })` — calls `https://api.anthropic.com/v1/messages` with `model: 'claude-opus-4-6'`, `max_tokens: 4096`, the system prompt and the user message. Returns the full text of the assistant's first content block.

Direct REST call with `fetch`. No SDK dependency. Required headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`.

**The build runner's step 3 implementation:**
1. Reads the build row from the DB.
2. Calls `generatePrompt(build, { apiKey: process.env.ANTHROPIC_API_KEY })`.
3. Stores the result in `builds.tenweb_prompt`.
4. Returns `{ tenwebPromptGenerated: true }` from the step so it lands in `api_response`.

Fatal on failure after 3 retries. Retry applies because Claude API can hiccup.

### Step 4: Website Creation (Manual)

Works like the M1 stub step but the pause context is richer.

On first invocation:
1. Read `tenweb_prompt` from the build row.
2. Throw `PauseSignal(4, { reason: 'awaiting_website', prompt: <tenweb_prompt>, message: 'Paste the prompt in 10web, wait for the site, then enter your WordPress credentials below.' })`.

On resume:
1. Read `resumePayload` which must contain `{ wp_url, wp_username, wp_password }`.
2. Validate all three are non-empty strings. If not, throw (build marked failed, operator retries).
3. Encrypt `wp_password` with AES-256-GCM using `CREDENTIALS_KEY`.
4. Update the build row: `wp_url`, `wp_username`, `wp_password_encrypted`.
5. Return `{ credentialsStored: true }`.

### Encryption module

New module: `server/services/crypto.js`. Exports:
- `encrypt(plaintext)` — AES-256-GCM with a 16-byte random IV. Returns base64 string `{iv}:{ciphertext}:{authTag}`.
- `decrypt(encoded)` — reverses the above.

Key loaded from `process.env.CREDENTIALS_KEY` (32-byte hex string). At startup, if the key is missing the server logs a warning but still boots — M2a only writes encrypted creds, it never needs to decrypt them. M2b will require the key and fail at startup without it.

### UI: richer paused state

The existing paused banner in both `ProgressTracker.jsx` and `BuildDetailRow.jsx` gets a conditional block: if `pauseInfo.context.reason === 'awaiting_website'`, render the richer layout. Otherwise render the existing simple banner (for any future stub pauses).

**Richer layout:**
1. Title: "Website creation in progress"
2. Short instructions: "Copy this prompt and paste it into the 10web AI Website Builder. When your site is live, enter your WordPress credentials below and click Continue."
3. Monospace code block showing `pauseInfo.context.prompt`, with a "Copy Prompt" button that uses `navigator.clipboard.writeText`.
4. "Open 10web" button that opens `https://10web.io/ai-website-builder/` in a new tab.
5. Three input fields in a grid: WordPress URL, Username, Application Password.
6. "Continue" button, disabled until all three are non-empty.

Clicking Continue POSTs to `/api/builds/:id/resume` with body `{ wp_url, wp_username, wp_password }`.

### SSE

No new event types. Existing `build-paused` event already carries `context`, which now includes the prompt text and the `reason: 'awaiting_website'` discriminator. The frontend already stores `pauseInfo` from this event — we just render it differently when the reason is `awaiting_website`.

---

## Data flow

1. Operator fills form (including industry text, audience text, logo file).
2. Browser extracts colors via `colorthief` → operator confirms palette.
3. Form submits multipart → multer saves logo to `data/logos/{buildId}.{ext}` → route handler validates + inserts build row with the new columns populated + inserts step rows.
4. Runner executes Phase 1 (Create Sub-Account, Welcome Comms warning) — unchanged.
5. Runner enters Phase 2. Step 3 calls Claude with the system prompt + user message built from the build row. Claude returns the prompt text. Runner stores it in `builds.tenweb_prompt`.
6. Runner enters step 4. Reads the stored prompt. Throws `PauseSignal` with the prompt in the context.
7. SSE `build-paused` event delivered to the browser with the prompt in `context`.
8. Browser renders the richer paused UI. Operator copies prompt, switches to 10web, creates the site, waits, copies the WP credentials out of 10web's post-build screen.
9. Operator pastes URL / username / password into the form, clicks Continue.
10. Browser POSTs `/api/builds/:id/resume` with the credentials.
11. Runner resumes step 4 with the `resumePayload`. Encrypts password, writes all three columns, returns success. Phase 2 completes. Build marked completed.

---

## Error handling

- **Logo upload too large / wrong type:** multer rejects with 400. Frontend shows field error.
- **Missing env vars:**
  - `ANTHROPIC_API_KEY` missing → step 3 fails with a clear error message. Build marked failed. Retry won't work until key is added and server restarted.
  - `CREDENTIALS_KEY` missing at resume → step 4 resume fails with a clear error message. Build stays paused, operator can retry after server restart.
- **Claude API failure (500, rate limit, timeout):** step 3 retries with backoff (3 attempts). On final failure, build marked failed, existing retry-from-step UI lets operator retry step 3.
- **Claude returns empty / malformed content:** step 3 fails with "Empty Claude response" error, treated as normal failure.
- **Resume with incomplete credentials:** resume endpoint returns 400 with a field-level error. Build stays paused, operator fixes input and clicks Continue again.

---

## Testing

### Unit tests

**`tests/server/prompt-generator.test.js` (new):**
- `buildUserMessage` produces a string containing all 10 answers from a fully-populated build row.
- `buildUserMessage` handles optional fields (e.g. no existing website) with a sensible placeholder.
- `SYSTEM_PROMPT` is a non-empty string containing the literal "Ready-to-Paste Prompt for 10Web:".
- `generatePrompt` is not unit-tested against the real API (would be an integration test and burns tokens). Instead: a mock `fetch` verifies the request shape (URL, headers, model, message structure) and a fake response body gets parsed into the expected return value.

**`tests/server/crypto.test.js` (new):**
- `encrypt` → `decrypt` roundtrip returns the original plaintext.
- `encrypt` with the same plaintext produces different ciphertext (IV is random).
- `decrypt` of tampered ciphertext throws.

**`tests/server/build-runner.test.js` (update):**
- New test: step 3 calls the injected prompt generator with the build row and stores the result in the build row.
- New test: step 4 first call pauses with `context.reason === 'awaiting_website'` and `context.prompt` populated from the build row.
- New test: step 4 resume with valid credentials encrypts the password and stores all three columns.
- New test: step 4 resume with missing credentials throws and leaves the build paused / fails the step.
- Update existing "pauses at stub step" test: the stub is now step 4, not step 3. Everything downstream of `paused_at_step === 3` updates to `=== 4`.
- Update pause-resume durability test similarly.

**`tests/server/db.test.js` (update):**
- Assert that `builds` table has the new columns.
- Assert that `createBuildSteps` inserts 4 rows (steps 1, 2 in phase 1; steps 3, 4 in phase 2).

**`tests/server/phases.config.test.js` (update):**
- Phase 2 now has 2 steps (numbers 3 and 4). Step 3 name is "Generate 10web Prompt". Step 4 name is "Website Creation (Manual)" and is `pausesForManualInput: true`.

### Integration / E2E

**Manual end-to-end run:**
1. Set `ANTHROPIC_API_KEY` and `CREDENTIALS_KEY` in `.env`. Restart server.
2. Delete any leftover test sub-accounts from GHL.
3. Log into the Onboarding Hub. Fill the form with a real-ish test business. Upload a real logo (any PNG from your Desktop). Verify the color swatches appear.
4. Submit. Watch steps 1 and 2 complete (Phase 1). Watch step 3 generate a prompt — should take 5-15 seconds. Verify the prompt text appears in the pause banner.
5. Click "Copy Prompt". Paste into a scratchpad to verify copy worked.
6. Optional: actually paste into 10web and create a site. Otherwise: enter fake WordPress credentials (`https://fake.example.com`, `admin`, `app pass here`). Click Continue.
7. Verify the build flips to completed. Check the DB row to confirm `tenweb_prompt`, `wp_url`, `wp_username`, `wp_password_encrypted` are all populated. Confirm `wp_password_encrypted` is not plaintext.
8. Delete the created GHL sub-account.

---

## Key design decisions

1. **Free-text Industry and Audience instead of a dropdown.** The user wants flexibility; Claude handles free text fine; no one maintains an industry taxonomy.
2. **Design style is Claude's call.** Reduces form friction. The operator can edit the generated prompt before pasting it into 10web if they want to steer the style.
3. **Logo on local filesystem, not Cloudinary.** The app is a single-tenant local tool. Local FS is simpler, free, and M2b reads the same file from disk when uploading to WordPress.
4. **Client-side color extraction with `colorthief`.** The library is ~20KB, pure browser, and gives a palette instantly. Extracting on the server would require round-trip uploads and an image-processing dep like `sharp`.
5. **Claude API via direct REST, not the SDK.** The `@anthropic-ai/sdk` is heavy and we only need one endpoint. A `fetch` call with three headers is 20 lines of code.
6. **`claude-opus-4-6` for prompt generation.** This is a quality-critical step that runs once per onboarding. Opus gives the best quality. Tokens are cheap vs operator time saved.
7. **Pre-fill the 10 discovery questions in the user message.** The system prompt says "ask 10 questions first, then generate." We satisfy that requirement programmatically by feeding pre-computed answers and letting Claude proceed straight to prompt generation. This is an intentional adaptation of the system prompt for non-chat use.
8. **AES-256-GCM for WP credentials.** Same approach as the existing WP Agent project the user has at `~/10web-superagent`. Not industry-best-practice for a production SaaS, but appropriate for a local single-tenant tool that stores creds only to avoid re-entry in M2b.
9. **New `industry_text` column instead of reusing `industry`.** The existing `industry` column stays pinned to `'general'` for GHL. Renaming or re-purposing would break the hard-coded value the runner sends to GHL. Two columns, clear separation of concerns.
10. **Step 4 only stores credentials; doesn't validate them.** Validation is an API call to the WordPress site; M2b handles it. M2a focuses on capture, not correctness.
11. **No schema migration for the brand colors column.** JSON in a TEXT column is fine for a ~100-byte array. Proper relational modeling is overkill.

---

## Deliverables

At the end of M2a:
- Form has Industry + Target Audience + Logo fields with working color extraction.
- Phase 2 has 2 real steps.
- Claude API integration via `prompt-generator.js` module, `claude-opus-4-6` model.
- New DB columns populated end-to-end.
- Logo files saved to local FS.
- Richer paused UI with prompt display, copy button, 10web link, and WP credential capture.
- WP credentials encrypted at rest with AES-256-GCM.
- All unit tests pass. New tests cover prompt-generator, crypto, and the new runner behavior.
- One verified manual run against real GHL + (optionally) real 10web.

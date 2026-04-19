# Page Prompt Generator — Design Spec

**Date:** 2026-04-19
**Module:** M3.5 (sits between M3 Proposals and M4 Reports)
**Route:** `/pages` — new sidebar entry under **Operations**

## Purpose

Generate a high-fidelity, 10Web-ready prompt for adding a single new page to an existing WordPress site. The prompt is designed to be pasted into 10Web's "add a page" AI feature on a site that already exists (whether built by us or elsewhere).

Reuses the client's existing brand data (palette, personality, mood, surface style, industry cues) so every generated page matches the original site's visual and tonal identity.

## User Flow

1. User clicks **Operations → Page Generator** in sidebar.
2. User picks a client from a dropdown. Clients missing brand data are disabled (tooltip: "Run Analyze Brand on this client first").
3. User picks a **Page Type** from 7 presets:
   - Services Detail
   - Pricing / Packages
   - About / Our Story
   - Testimonials / Reviews
   - Service Areas / Locations
   - Landing / Lead Magnet
   - Custom
4. User enters **Page Name** (free text) and **URL Slug** (auto-suggested from page name, editable).
5. User optionally adds **Notes** (free-form box — e.g. "3 tiers at $99/$199/$399", "focus on emergency water damage").
6. User clicks **Generate Prompt**.
7. Generated prompt appears in a preview card with a live character counter (amber at 1800, red at 2000). User clicks **Copy** to clipboard, or **Regenerate** / **Save**.
8. Prompt auto-saves to `page_prompts` table. Client Profile page shows a collapsible **Generated Pages** section listing all of that client's prompts; clicking one re-opens it pre-filled.

## Data Source Priority

1. If client has a linked build → use build's brand fields + original `tenweb_prompt` as tone reference.
2. Else → use the client's own `brand_personality`, `brand_mood_description`, `industry_cues_json`, `recommended_surface_style`, `brand_colors_json`.
3. If neither → client is disabled in the dropdown.

No URL scraping in V1.

## Prompt Structure

Final prompt format (≤ 2000 chars, pasted into 10Web):

```
PAGE TYPE: {preset}
PAGE NAME: {name}
TARGET URL SLUG: {slug}

BRAND CONTEXT:
- Company: {name} — {industry}
- Palette: {5 hex codes in role slots primary/secondary/accent/neutral/background}
- Personality: {brand_personality}
- Mood: {brand_mood_description}
- Surface style: {recommended_surface_style}  ← verbatim
- Industry cues: {industry_cues summary}
- Service areas: {service_areas}
- CTAs: {primary_cta, secondary_cta}

PAGE NARRATIVE: [LLM-written — preset-specific sections]
TONE: [LLM-written — synthesised from personality + mood]
DESIGN NOTES: [LLM-written — palette role use + surface style + industry cues → layout hints]

MUST-HAVES:
- Match existing site's header/footer/nav styling
- Use palette roles consistently
- Mobile-first responsive
- CTA placement top + mid + bottom
```

### Preset → LLM Sections

| Preset | Sections LLM writes |
|---|---|
| Services Detail | Hero + problem/solution + benefits (3-5) + process steps + trust block + CTA |
| Pricing | Hero + tier cards (count from notes, default 3) + feature comparison + FAQ snippet + CTA |
| About | Origin story + mission + values (3-5) + team/credentials + CTA |
| Testimonials | Hero + review cards (5-8, industry-specific) + stats/proof + CTA |
| Service Areas | Hero + city list (from DB) + local trust signals + map/coverage + CTA |
| Landing / Lead Magnet | Single hero + offer + 3 benefits + social proof + single CTA |
| Custom | Whatever the user's notes describe; LLM picks structure |

### Character Budget

- Deterministic brand-context block: ~500 chars
- Headers + MUST-HAVES: ~300 chars
- LLM creative output: ~1200 chars (budget passed to LLM in meta-prompt)
- **Hard server-side cap enforced at 2000 chars.** If LLM overshoots, trim in order: MUST-HAVES → CTAs block → tertiary narrative sections. Hero, brand-context, and primary narrative preserved.

## LLM Call

- **Model:** `claude-opus-4-7`
- **Single call per generate.** Prompt caching applied to the deterministic brand-context preamble (cache hits across regens of the same client).
- **System prompt:** enforces ≤ 2000 char output, bullet/phrase style not prose, no invented facts.
- **User prompt:** deterministic brand block + (optional) original 10Web site prompt from build + page_type/page_name/user_notes + creative-section list + character budget.

### Fidelity Guarantees (server-side verification)

- All 5 palette hex codes present in final output
- `recommended_surface_style` phrase appears verbatim
- At least 2 of 4 personality traits appear
- If verification fails twice, fall back to template-only (no LLM) version

**Cost estimate:** ~1-2k input tokens + ~500 output tokens per call → ~$0.01-0.02.

## Data Model

New table `page_prompts`:

| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| client_id | INTEGER FK → clients | |
| build_id | INTEGER FK → builds (nullable) | which build's brand was used |
| page_type | TEXT | enum: `services_detail`, `pricing`, `about`, `testimonials`, `service_areas`, `landing`, `custom` |
| page_name | TEXT | |
| page_slug | TEXT | |
| user_notes | TEXT | free-form input |
| generated_prompt | TEXT | final ≤ 2000-char prompt |
| brand_snapshot_json | TEXT | frozen copy of brand fields used at generation time |
| created_at | DATETIME | |
| updated_at | DATETIME | |

## API

```
GET    /api/page-prompts?client_id=:id   → list for a client
POST   /api/page-prompts                 → generate new { client_id, page_type, page_name, page_slug, user_notes }
GET    /api/page-prompts/:id             → fetch one
PUT    /api/page-prompts/:id             → regenerate (fresh LLM call, same inputs) or update notes
DELETE /api/page-prompts/:id             → remove
```

## Frontend

**New files:**
- `src/pages/PageGenerator.jsx` — main tool page
- `src/components/PagePromptHistory.jsx` — list section embedded on ClientProfile

**Modified files:**
- `src/components/Sidebar.jsx` — add **Page Generator** under Operations, below Onboarding
- `src/pages/ClientProfile.jsx` — embed `<PagePromptHistory />` as collapsible section
- `src/App.jsx` — register `/pages` route

**Styling:** existing VO360 dark theme (glassmorphic cards, brand gradient accents, same pattern as Client Profile and Onboarding pages).

**UX details:**
- Live character counter (amber ≥1800, red ≥2000)
- Generate button disabled while LLM call in flight; spinner + "Generating…" label
- Regenerate button reuses same inputs with fresh LLM call; new row overwrites in place
- Empty state before client pick: friendly placeholder card

## Backend

**New files:**
- `server/services/page-prompt-generator.js` — mirrors existing `prompt-generator.js` hybrid pattern
- `server/routes/page-prompts.js` — Express router

**Modified files:**
- `server/db/index.js` — add `page_prompts` table migration (idempotent — same pattern as other tables)
- `server/db/queries.js` — CRUD helpers for `page_prompts`
- `server/app.js` — mount `/api/page-prompts` router

## Out of Scope (V1)

- URL scraping fallback (everyone has brand data via Analyze Brand)
- Direct WordPress REST API injection (stays manual copy/paste)
- Status tracking (draft / used / published)
- Cross-client prompt cloning
- PDF export of prompts
- Scheduled / bulk generation
- FAQ, Contact, and Legal presets (explicitly deferred — 10Web's built-in versions are adequate for FAQ/Contact; Legal will be handled separately later)

## Vercel-Parity

Zero filesystem writes. Pure LLM call + Turso write + response. Safe on prod from day one — unlike M3 Proposals, which still reads from disk.

## Effort Estimate

One focused session. Most logic cleanly mirrors the existing `prompt-generator.js` and `proposals` module shapes.

## Open Questions

None. All decisions captured above.

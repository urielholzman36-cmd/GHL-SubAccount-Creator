# Company Master Brief — Format Redesign Spec

**Date:** 2026-04-20
**Module:** Client Brief generator (`server/services/brief-generator.js`) and the Client Detail brief UI.

## Purpose

Rework the Company Master Brief output to match the format Uriel uses manually (per VO360 and Calispark Electric examples). Make the brief scannable, structured, and deliverable as `.docx` for clients, while keeping `.md` as the canonical source stored in Turso.

The brief is Mode A of the Manus pipeline — run once per client, feeds monthly content planning.

## User Flow (two-pass)

1. Operator opens **Client Detail** page.
2. Clicks **Generate Brief** (or **Replace** if one exists).
3. Claude Sonnet 4.6 drafts the full brief using all client DB data + inferences for missing fields (inferred fields get a `[inferred]` tag inline).
4. Draft loads into an **inline textarea editor** on Client Detail.
5. Operator polishes the draft (fixes tagline, corrects inferences, edits USP, etc.) and clicks **Save** — `client_brief_status` flips from `draft` to `final`.
6. Operator downloads **.md** or **.docx** as needed. **Copy MD** button still available.
7. A **Preview** toggle re-renders the markdown as formatted HTML for visual inspection.

## Brief Structure (new format)

Cover block first, then 4 groups / 13 numbered sections.

```
# {Client Name}
## CLIENT BRIEF MASTER
> "{tagline if known}"
Internal Strategic Document · Version 1.0 · {Month Year} · CONFIDENTIAL

---

## ABOUT THE BUSINESS

### 1. Company Overview
- **Name:** ...
- **Industry:** ...
- **Business Type:** ...
- **Founded:** ... (or [inferred])
- **Location:** ...
- **Website:** ...
- **Phone:** ...
- **Address:** ...

### 2. Mission & Value Proposition
2-3 paragraphs: mission + core value prop.

### 3. Services & Offerings
- Service name — short description
- Service name — short description
- …

### 4. Competitive Positioning
- **Unique Selling Proposition:** 1 paragraph
- **Key Competitors:** comma-separated (3-5 names, mark [inferred] if guessed)
- **Key Differentiators:** bullet list

---

## ABOUT THE AUDIENCE

### 5. Target Audience
- **Primary Segment:** ...
- **Special Focus:** ...
- **Demographics:** ...
- **Pain Points:** ...
- **Decision Maker:** ...
- **Tech Comfort:** low / mid / high

### 6. Common Objections & Concerns

| Objection | Response Strategy |
|---|---|
| ... | ... |
| ... | ... |

(3-5 rows. Mark row `[inferred]` if not sourced.)

---

## ABOUT THE BRAND

### 7. Brand Identity & Tone of Voice
- **Brand Personality:** ...
- **Tone of Voice:** ...
- **Communication Style:** ...
- **Visual Feel:** ...
- **What We Avoid:** ...

### 8. Visual Palette

| Color Name | Hex Code | Usage |
|---|---|---|
| ... | #XXXXXX | ... |

(Must use the client's extracted palette. Never invent colors. If none, mark all rows [inferred] and extract from brand description.)

### 9. Typography & Style Rules
- **Headings:** font name
- **Body Text:** font name
- **Brand Messaging DO:** bullet list
- **Brand Messaging DON'T:** bullet list

---

## ABOUT THE MARKETING

### 10. Digital Presence & Platforms
- **Primary Platforms:** ...
- **Secondary Platforms:** ...
- **Content Frequency:** ...
- **Content Strategy:** ...
- **Previous Efforts:** ... (or [inferred])

### 11. Business Goals
- **Primary Goal:** ...
- **Content Target:** ...
- **Growth Strategy:** ...
- **Success Metrics:** ...

### 12. Content Production Workflow
Short paragraph describing the Claude Cowork (strategy) → Manus AI (execution) pipeline. Same standard language for every client.

### 13. Additional Notes
Any client-specific notes, caveats, or inferred assumptions to flag for Manus.

---

## Summary
- What was created
- What was inferred vs. sourced
- How Manus should use this document next
```

Every field not sourced from the client record must be suffixed `[inferred]`. Palette rows must come from `brand_palette_json` or `brand_colors_json` — never invented.

## LLM Settings

- **Model:** `claude-sonnet-4-6` (upgrading from `claude-sonnet-4-20250514`)
- **Max tokens:** 8000
- **Temperature:** default
- **System prompt** replaces the current 10-section instructions with:
  - The new 4-group / 13-section structure above
  - Cover template specification
  - Markdown table format for Objections + Palette
  - `[inferred]` tagging rule
  - Quality bar (brand-specific, never generic, preserve real palette)
  - Output shape: pure markdown, no code fences, single H1 title
- **User prompt:** same raw-client-data block shape as today (name, industry, website, services, palette, personality, mood, surface style, industry cues, contact, audience, tone).

## Data Model Change

Add one column to `clients` table:

```sql
ALTER TABLE clients ADD COLUMN client_brief_status TEXT DEFAULT 'draft';
```

- `draft` — generator just produced it, not yet reviewed/saved by operator
- `final` — operator clicked Save after reviewing

## API

```
POST   /api/clients/:id/generate-brief        (existing, new prompt) — draft + save to client_brief, status='draft'
PUT    /api/clients/:id/brief                 (NEW) — body: { client_brief: "..." } — save operator edits, status='final'
GET    /api/clients/:id/brief.md              (existing, unchanged)
GET    /api/clients/:id/brief.docx            (NEW) — stream .docx rendered from current client_brief
```

`?replace=true` guard on `POST /generate-brief` stays.

## Markdown → DOCX Converter

**New file:** `server/services/brief-docx.js`

**Parser support (scoped to brief format):**
- `#` / `##` / `###` → Word headings (sizes 32 / 22 / 16pt)
- `> "text"` → italic centered paragraph (tagline)
- `**bold**` inline → bold runs
- Bullet lists (`- ` or `* `) → Word bullet lists
- Markdown tables → Word tables with header row
- Horizontal rules (`---`) → thin divider line
- Plain paragraphs → plain paragraphs

**Styling:**
- Navy (`#1B2B6B`) for H1 / H2
- Orange (`#F47B20`) for dividers and H2 underlines
- Calibri font throughout (Word default, no custom font bundling)
- Cover block centered; body left-aligned

**Not supported (intentional YAGNI):**
- Images, links, code blocks, nested lists
- Custom cover graphics or logo images
- Non-Calibri fonts
- Headers/footers with page numbers

**Library:** existing `docx` npm dependency (already used by Proposals module).

## UI Changes (`src/pages/ClientDetail.jsx`)

Replace the current read-only brief preview with an editable textarea + action bar.

**Layout:**
- Status line: `Last generated: {date} · Status: {Draft|Final}`
- Filename hint: `{slug}_company_master_brief.md`
- Generate / Replace button (existing)
- Textarea (pre-filled with current `client_brief` markdown)
- Save button — calls `PUT /api/clients/:id/brief`
- Preview toggle — renders the markdown via `react-markdown` (already installed)
- Copy MD · Download .md · Download .docx buttons
- Unsaved-changes confirm: if textarea differs from server value and user hits Generate/Replace or navigates away, confirm before discarding

**Status badge:** small colored pill (gray = Draft, green = Final). No full redesign — same brand theme.

## Out of Scope for V1

- Backfilling existing briefs to the new format (regenerate to update)
- Version history / undo
- Cover graphics / logo image in DOCX
- Non-Calibri fonts
- Images or nested structures in the brief
- Non-English briefs

## Vercel-Parity

Zero filesystem writes. DOCX built to a buffer via the `docx` npm package and streamed directly. Markdown already stored in Turso. Safe on prod day one.

## Effort Estimate

One focused session. Smaller than M4 Reports — reuses existing route + UI skeleton and the `docx` dependency already set up for Proposals.

## Files Touched / Created

- Modify: `server/services/brief-generator.js` (new prompt + structure + model upgrade)
- Create: `server/services/brief-docx.js` (markdown → DOCX converter)
- Create: `tests/server/brief-docx.test.js` (parser + rendering unit tests)
- Create: `tests/server/brief-generator-format.test.js` (prompt builder + filename tests)
- Modify: `server/routes/clients.js` (add `PUT /:id/brief` + `GET /:id/brief.docx`)
- Modify: `server/db/index.js` (add `client_brief_status` column migration)
- Modify: `src/pages/ClientDetail.jsx` (editable textarea · Save · Preview · docx download · status badge · unsaved-changes guard)

## Open Questions

None. All decisions captured above.

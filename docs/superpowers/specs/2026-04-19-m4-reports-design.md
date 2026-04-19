# M4 Reports — Client Report Generator Design Spec

**Date:** 2026-04-19
**Module:** M4 (replaces ComingSoon at `/reports`)
**Sidebar:** Operations → Reports (existing slot)

## Purpose

Generate monthly AI-narrated PDF reports for VO360's GHL clients. Each report pulls GHL activity data for a selected month, has Claude write a positive client-facing narrative + actionable recommendations, lets the operator edit the narrative, then builds a branded PDF that the operator downloads and delivers manually.

Lives inside the Onboarding Hub (not as a standalone app) — reuses the hub's existing GHL data puller (from Health Monitor), brand constants, Cloudinary infra, and Turso DB.

## User Flow

1. User clicks **Operations → Reports**.
2. User picks a **client** from a dropdown (clients without a GHL `location_id` are disabled).
3. User picks a **month** (default: last completed month, e.g. if today is Oct, default to September).
4. User clicks **Pull Data**. Hybrid fetch:
   - If Health Monitor has a cached snapshot for this (client, month) written today → use it.
   - Otherwise → pull fresh from GHL.
5. Data snapshot renders inline. Below it, an editable **Narrative** section shows Claude's draft Executive Summary + Recommendations.
6. User edits narrative freely. Optional **Regenerate Narrative** button for a fresh LLM pass.
7. User clicks **Build PDF**. Server renders PDF with PDFKit, uploads to Cloudinary, stores URL in `reports.pdf_url`.
8. PDF preview appears inline (iframe). User clicks **Download PDF**.
9. Report auto-saves to the client's history. Past reports for this client list below the tool with Re-download / Delete actions.

**Per-client shortcut:** `ClientProfile.jsx` gets a collapsible **Reports** section showing the most recent 3 reports + a **Generate new report** button that navigates to `/reports?client_id=X&month=YYYY-MM` pre-filled.

## PDF Structure (5 Sections, ≈ 4 pages)

1. **Cover page** — VO360 logo + client logo (if available), `{Client Name} — Monthly Performance Report`, `{Month Year}`, "Prepared by VO360 · Generated {date}" footer.
2. **Executive Summary** — LLM-written 150-200 words in 2-3 paragraphs. Positive, client-facing, references specific numbers, ends on momentum. Operator-editable before build.
3. **Lead Performance** — headline number (total leads this month + MoM % delta), horizontal bar chart of top 5 lead sources, "Best performing source" callout.
4. **Appointments & Conversion** — three metric cards: Appointments Booked, Show Rate %, Converted %. Each card shows MoM arrow (↑ green / ↓ red).
5. **Recommendations** — LLM-written 3-4 one-sentence actionable bullets in VO360 voice. Operator-editable.

**Styling:** VO360 dark navy palette, cyan/purple gradient accents, white typography. Matches the Proposals PDF style that already ships.

**Charts:** SVG drawn directly in PDFKit (no native canvas). Simple horizontal bars + metric cards. Avoids Vercel native-module compatibility issues.

## LLM Narrative

**Model:** `claude-sonnet-4-6` — plenty of quality for structured narrative, cheaper than Opus.

**Single call** per generate, producing Executive Summary + Recommendations together as JSON.

**System prompt rules:**
- Voice: positive, confident, client-facing. No hedging words.
- Exec Summary: 150-200 words, 2-3 paragraphs, plain prose (no markdown).
- Recommendations: 3-4 one-sentence actionable bullets.
- Reference specific numbers from the data. Don't generalize.
- Never use raw DB terms ("lead objects") — use business English.

**User prompt contents:**
- Client name, industry, month
- Data snapshot (leads, sources, appointments, show rate, conversion rate — both current and prior month)
- Optional prior month narrative for trend framing

**Output format:** strict JSON: `{ "exec_summary": "...", "recommendations": ["...", "...", "..."] }`. Parse failures fall back to regex extraction.

**Fidelity rails (server-side):**
- Every number mentioned in exec_summary must appear in the data snapshot — if LLM invented a number, regenerate once with stricter instructions.
- Exec summary paragraph count 2-3, each paragraph 100-300 chars.
- Recommendations has 3-4 items, each under 200 chars.

**Cost:** ~$0.005 per call.

## Data Pull (Hybrid)

For the selected (client, month):

1. Check `health_scores` or equivalent cache table for a snapshot matching this (client_id, month) written today.
2. If found → use it.
3. Otherwise → call `fetchMonthlyAggregate(location_id, 'YYYY-MM')` on the hub's existing GHL data puller (extended with this new method). Save the result into `reports.data_snapshot_json` as a frozen copy.

**Why frozen:** Re-building the PDF later doesn't drift from the numbers originally narrated. Clients can trust the numbers match what was sent.

**No-data month:** Snapshot still saves with zeros. Narrative generator writes around zeros positively (e.g., "September was a quieter month — here's what we can do to reignite momentum in October…").

**Error handling:**
- GHL unreachable → 502 with "GHL is unreachable. Try again in a minute."
- Client missing `location_id` → 400 with "Connect this client's GHL location first."

## Data Model

New table `reports`:

| column | type | notes |
|---|---|---|
| id | INTEGER PK | |
| client_id | INTEGER FK → clients | ON DELETE CASCADE |
| month | TEXT | `YYYY-MM` format, e.g. `'2026-09'` |
| data_snapshot_json | TEXT | frozen GHL numbers at pull time |
| narrative_json | TEXT | `{ exec_summary, recommendations }` (operator-editable) |
| pdf_url | TEXT | Cloudinary secure URL |
| pdf_cloudinary_id | TEXT | public_id for delete / regen |
| status | TEXT | `'draft'` \| `'built'` |
| created_at | DATETIME | |
| updated_at | DATETIME | |
| UNIQUE | (client_id, month) | — one report per client per month; regenerating overwrites |

## API

```
GET    /api/reports?client_id=:id        list past reports for a client (most recent first)
POST   /api/reports/pull                 { client_id, month } — hybrid data pull + draft narrative
PUT    /api/reports/:id                  update narrative_json (operator edits before build)
POST   /api/reports/:id/build            build PDF → upload Cloudinary → status='built'
GET    /api/reports/:id                  fetch one (narrative + data_snapshot + pdf_url)
DELETE /api/reports/:id                  remove row + delete Cloudinary asset
```

## Module Layout

```
server/modules/reports/
  routes.js                       Express router factory
  schema.js                       idempotent reports table migration
  services/
    data-puller.js                hybrid cached/fresh pull
    narrative-generator.js        Claude Sonnet 4.6 call + fidelity rails
    pdf-builder.js                PDFKit rendering of the 5 sections
    cloudinary-upload.js          upload helper + delete helper

src/pages/reports/
  ReportsList.jsx                 main tool page (replaces ComingSoon route)

src/components/
  ReportHistory.jsx               per-client history list (embedded on ClientProfile)
  NarrativeEditor.jsx             textarea-based editor for exec_summary + recommendations
```

## Modified Files

- `server/db/index.js` — mount `reports` table migration
- `server/app.js` — mount `/api/reports` router
- `src/App.jsx` — replace `<Route path="/reports" element={<ComingSoon />} />` with the new page
- `src/pages/ClientProfile.jsx` — embed `<ReportHistory clientId={id} />`
- `server/shared/ghl-data-puller/` — add `fetchMonthlyAggregate(locationId, yearMonth)` method

## Out of Scope for V1

- Built-in email send (operator downloads + sends manually)
- Automated monthly scheduling / cron jobs
- Pipeline & Revenue section (deferred from original 8-section spec)
- SMS / Email Engagement section (deferred)
- Silver/Gold/Platinum competitive scoring
- Multi-month trend reports (quarterly / annual)
- White-labeled reports for agency sub-clients
- Client-facing portal for online viewing

## Vercel-Parity

Zero filesystem writes. PDFKit writes to a buffer → buffer streamed to Cloudinary → URL stored in Turso. No `/tmp` dependency, no disk reads for assets (logo pulled from client record's Cloudinary URL, VO360 logo either inlined base64 or fetched via HTTPS from its Cloudinary URL). Safe on prod from day one.

## Effort Estimate

One focused session, slightly larger than Page Generator (Task 10) due to PDFKit rendering + chart drawing.

## Open Questions

None. All decisions captured above.

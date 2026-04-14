# VO360 Unified Command Center — Design Spec

**Date:** 2026-04-14
**Base repo:** `~/ghl-sub-account-builder`
**Strategy:** Evolve the existing Onboarding Hub into the Command Center by adding modules incrementally.

---

## 1. Approach

Migrate all 5 standalone VO360 apps into the existing `ghl-sub-account-builder` repo. Keep the current stack: Express + React + Vite + Turso + cookie-session. Port each Next.js/TypeScript module by converting to Express routes + React/JSX pages. Each milestone is independently deployable.

### Why evolve instead of rebuild

- The hub already has Express + React + Vite + Turso + Vercel deployment working
- Auth, sidebar, toast system, social planner are production-tested
- Turso migration just completed — persistent cloud DB on Vercel
- Starting fresh would discard weeks of working code for zero user value

### What gets converted

The 4 Next.js apps (Health, KB, Proposals, Reports) need:
- TypeScript → JavaScript
- Next.js API routes → Express routes
- Next.js App Router pages → React Router pages
- `use server` / server components → standard client-side React + fetch
- Core business logic (scoring, AI prompts, PDF layouts) ports directly with minimal changes

---

## 2. Migration Order

| Milestone | Module | Source Repo | Effort |
|-----------|--------|-------------|--------|
| M0 | Foundation | — | Dashboard, Client Detail, sidebar restructure, clients table upgrade, shared services scaffold |
| M1 | Health Monitor | `~/client-health-dashboard` | Score calculator, GHL data puller, alerts, churn detection |
| M2 | Knowledge Base | `~/vo360-knowledge-base` | AI doc structurer, versioning, PDF export, categories |
| M3 | Proposals | `~/vo360-proposal-generator` | Proposal + contract PDF/DOCX, ClientSelector, email |
| M4 | Reports | `~/vo360-client-reports` | AI narrative, monthly PDF, GHL data reuse, email |
| M5 | Enhanced Onboarding | (existing code) | Build-runner creates shared client record, progressive enrichment |

---

## 3. Sidebar Navigation

```
OVERVIEW
  Dashboard            /
  Clients              /clients

OPERATIONS
  Onboarding           /onboarding
  Social Planner       /social
  Health Monitor       /health
  Reports              /reports

SALES
  Proposals            /proposals

INTERNAL
  Knowledge Base       /kb
  Settings             /settings
```

---

## 4. Milestone 0: Foundation

### 4.1 Sidebar restructure

Update the existing sidebar component to match the navigation structure above. All new routes initially show a "Coming Soon" placeholder page so the sidebar is functional immediately.

### 4.2 Clients table upgrade

Add columns to the existing `clients` table to serve as the shared "client passport":

```sql
ALTER TABLE clients ADD COLUMN contact_name TEXT;
ALTER TABLE clients ADD COLUMN email TEXT;
ALTER TABLE clients ADD COLUMN phone TEXT;
ALTER TABLE clients ADD COLUMN address TEXT;
ALTER TABLE clients ADD COLUMN city TEXT;
ALTER TABLE clients ADD COLUMN state TEXT;
ALTER TABLE clients ADD COLUMN zip TEXT;
ALTER TABLE clients ADD COLUMN country TEXT DEFAULT 'US';
ALTER TABLE clients ADD COLUMN location_id TEXT;
ALTER TABLE clients ADD COLUMN brand_colors_json TEXT;
ALTER TABLE clients ADD COLUMN design_style TEXT;
ALTER TABLE clients ADD COLUMN brand_tone_v2 TEXT;
ALTER TABLE clients ADD COLUMN timezone TEXT DEFAULT 'America/New_York';
ALTER TABLE clients ADD COLUMN start_date TEXT;
ALTER TABLE clients ADD COLUMN active INTEGER DEFAULT 1;
ALTER TABLE clients ADD COLUMN onboarding_status TEXT DEFAULT 'pending';
ALTER TABLE clients ADD COLUMN updated_at DATETIME DEFAULT (datetime('now'));
```

Note: Some columns overlap with existing ones (e.g., `brand_tone` already exists, `location` exists). The migration handles dedup by keeping existing columns and only adding truly new ones.

### 4.3 Dashboard page (/)

- **Summary cards** (top row): Total Clients, Health Overview (green/yellow/red counts — placeholder until M1), Proposals This Month, Reports This Month
- **Clients Needing Attention**: filtered list of yellow/red health clients (placeholder until M1)
- **Recent Activity Feed**: last 10 actions across all modules
- **Active Alerts**: unacknowledged churn alerts (placeholder until M1)

### 4.4 Client Detail page (/clients/:id)

- **Profile card**: business name, niche, contact info, location_id, website, brand colors, start date
- **Quick actions**: Generate Report, Create Proposal, View Health, Run Onboarding (buttons link to respective modules with client pre-selected)
- **Health score badge**: current score with color (placeholder until M1)
- **Recent activity**: last report, last proposal, onboarding status
- **Edit button**: update client details inline

### 4.5 Shared services scaffold

```
server/shared/
  brand.js              — VO360 colors (#0f172a, #6366f1, #8b5cf6, #06b6d4), fonts, logo path
  ghl-data-puller/      — placeholder, built in M1
  pdf-generator/        — placeholder, built in M3
  email-sender/         — placeholder, built in M3
```

---

## 5. Milestone 1: Health Monitor

### 5.1 Backend

**Location:** `server/modules/health/`

**Routes** (`/api/health/*`):
- `GET /scores` — all client scores with latest snapshot
- `GET /scores/:clientId` — single client score + history
- `POST /refresh` — trigger GHL data pull + recalculate all scores
- `GET /alerts` — unacknowledged churn alerts
- `POST /alerts/:id/acknowledge` — mark alert handled

**Services:**
- `score-calculator.js` — ported from `~/client-health-dashboard/src/lib/scoring.ts`. Calculates 0-100 score from 6 GHL metrics: new_leads, pipeline_movement, conversation_activity, response_time, appointments, reviews. Status thresholds: green (70+), yellow (40-69), red (0-39).
- `churn-alerts.js` — generates alerts when score drops below threshold or trends downward for N days.

### 5.2 Database tables

```sql
CREATE TABLE IF NOT EXISTS health_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  score INTEGER NOT NULL,
  status TEXT NOT NULL,
  new_leads INTEGER DEFAULT 0,
  pipeline_movement INTEGER DEFAULT 0,
  conversation_activity INTEGER DEFAULT 0,
  response_time INTEGER DEFAULT 0,
  appointments INTEGER DEFAULT 0,
  reviews INTEGER DEFAULT 0,
  raw_data TEXT,
  scored_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  rule TEXT NOT NULL,
  message TEXT NOT NULL,
  score_at_alert INTEGER,
  delivered_via TEXT,
  acknowledged INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now'))
);
```

### 5.3 Shared service: ghl-data-puller

**Location:** `server/shared/ghl-data-puller/`

Ported from `~/client-health-dashboard/src/lib/ghl-client.ts`. Pulls contacts, leads, conversations, opportunities, and appointments from GHL API for a given `location_id`. Reads location_id from the shared clients table.

Supports `GHL_MOCK_MODE=true` for development (returns realistic fake data).

### 5.4 Frontend pages

**Location:** `src/pages/health/`

- `HealthDashboard.jsx` — score cards grid with green/yellow/red coloring, trend indicators, alert banner at top. Click a card to view client health detail.
- `ClientHealth.jsx` — single client deep-dive: score history chart, metric breakdown bars, alert history.

### 5.5 Integration

- Dashboard summary cards show health overview (green/yellow/red counts)
- "Clients Needing Attention" section populated with yellow/red clients
- Client Detail page shows health score badge
- Active Alerts section on Dashboard shows unacknowledged alerts

---

## 6. Milestone 2: Knowledge Base

### 6.1 Backend

**Location:** `server/modules/knowledge-base/`

**Routes** (`/api/kb/*`):
- `GET /documents` — list with search/filter by category
- `POST /documents` — create (raw input → AI structurer → structured doc)
- `GET /documents/:id` — single doc with versions
- `PUT /documents/:id` — update
- `DELETE /documents/:id` — soft delete
- `GET /documents/:id/versions` — version history
- `GET /documents/:id/export/pdf` — PDF export
- `GET /documents/:id/export/md` — Markdown export
- `GET /categories` — list categories
- `POST /categories` — create category
- `GET /search` — full-text search across documents

**Services:**
- `doc-structurer.js` — ported from `~/vo360-knowledge-base/lib/ai-structurer.ts`. Uses Claude to transform raw voice/text input into structured, formatted documents with sections, headings, and key points.

### 6.2 Database tables

```sql
CREATE TABLE IF NOT EXISTS kb_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kb_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category_id INTEGER REFERENCES kb_categories(id),
  content_raw TEXT,
  content_structured TEXT,
  language TEXT DEFAULT 'en',
  is_deleted INTEGER DEFAULT 0,
  created_by TEXT,
  updated_by TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kb_document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES kb_documents(id),
  content_structured TEXT,
  title TEXT,
  edited_by TEXT,
  edited_at DATETIME DEFAULT (datetime('now')),
  change_summary TEXT
);

CREATE TABLE IF NOT EXISTS kb_document_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES kb_documents(id),
  cloudinary_public_id TEXT,
  original_filename TEXT,
  position_marker TEXT,
  uploaded_at DATETIME DEFAULT (datetime('now'))
);
```

### 6.3 Frontend pages

**Location:** `src/pages/knowledge-base/`

- `KBList.jsx` — document list with category sidebar filter, search bar, create button
- `KBDocument.jsx` — document viewer/editor with markdown rendering, version history panel
- `KBCreate.jsx` — voice/text input area → AI structurer → review structured output → save

### 6.4 Integration

- No client dependency — standalone module
- Accessible from sidebar under INTERNAL
- Category seed data from `config/categories.json`

---

## 7. Milestone 3: Proposals

### 7.1 Backend

**Location:** `server/modules/proposals/`

**Routes** (`/api/proposals/*`):
- `POST /generate` — generate proposal + contract PDFs and DOCX
- `GET /history` — list past proposals
- `GET /template` — get package/pricing config
- `GET /:id/download` — download generated files
- `POST /:id/send` — email proposal to client

**Services:**
- `proposal-builder.js` — ported from `~/vo360-proposal-generator`. Builds branded proposal PDF with cover page, scope, pricing, timeline.
- `contract-builder.js` — builds branded contract PDF/DOCX with terms, payment schedule, signatures.

### 7.2 Database tables

```sql
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id),
  client_name TEXT,
  business_name TEXT,
  email TEXT,
  phone TEXT,
  niche TEXT,
  notes TEXT,
  proposal_url TEXT,
  contract_url TEXT,
  created_at DATETIME DEFAULT (datetime('now'))
);
```

`client_id` is optional — proposals can be created for prospects not yet in the system (manual entry).

### 7.3 Shared services built

**pdf-generator** (`server/shared/pdf-generator/`):
- `brand.js` — VO360 brand constants (colors, fonts, logo buffer, company info)
- Used by both proposal-builder and report-pdf-builder

**email-sender** (`server/shared/email-sender/`):
- Nodemailer wrapper with shared SMTP config
- Used by Proposals (send proposal) and Reports (send report)

**config/package-config.json** — VO360 pricing tiers, services list, company info.

### 7.4 Frontend pages

**Location:** `src/pages/proposals/`

- `ProposalForm.jsx` — ClientSelector dropdown at top (reads from `GET /api/clients`). Selecting a client auto-fills business name, email, phone, niche. Can also type manually for prospects. Package selection, notes, generate button.
- `ProposalHistory.jsx` — list of past proposals with download/resend actions
- `ProposalPreview.jsx` — preview generated PDF in-browser before sending

### 7.5 Integration

- ClientSelector component shared with Reports module
- Proposal count on Dashboard summary cards
- Proposal history accessible from Client Detail page

---

## 8. Milestone 4: Reports

### 8.1 Backend

**Location:** `server/modules/reports/`

**Routes** (`/api/reports/*`):
- `GET /` — list all reports
- `GET /:id` — single report detail
- `POST /generate` — pull GHL data, AI narrative, build PDF
- `POST /:id/regenerate` — regenerate with fresh data
- `POST /:id/send` — email report to client
- `GET /:id/download` — download PDF
- `GET /history` — reports filtered by client

**Services:**
- `narrative-writer.js` — ported from `~/vo360-client-reports`. Uses Claude to generate monthly performance narrative from GHL metrics (leads, conversions, reviews, response time). Produces structured JSON with sections: executive summary, highlights, areas for improvement, recommendations.
- `report-pdf-builder.js` — builds branded monthly report PDF. Imports brand constants from shared `pdf-generator/brand.js`.

### 8.2 Database tables

```sql
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  report_month TEXT NOT NULL,
  blob_url TEXT,
  narrative_json TEXT,
  raw_data_json TEXT,
  sent INTEGER DEFAULT 0,
  sent_at DATETIME,
  sent_to TEXT,
  created_at DATETIME DEFAULT (datetime('now'))
);
```

### 8.3 Frontend pages

**Location:** `src/pages/reports/`

- `ReportsDashboard.jsx` — list of generated reports, generate new button with ClientSelector
- `ReportDetail.jsx` — preview narrative sections + metrics, send/download actions
- `ReportGenerate.jsx` — select client, pick month, generate. Shows progress while Claude writes narrative + PDF builds.

### 8.4 Integration

- Reuses `ghl-data-puller` (shared with Health module)
- Reuses `pdf-generator/brand.js` (shared with Proposals)
- Reuses `email-sender` (shared with Proposals)
- Report count on Dashboard summary cards
- Report history accessible from Client Detail page
- Same `GHL_MOCK_MODE` toggle as Health

---

## 9. Milestone 5: Enhanced Onboarding

### 9.1 Changes to existing code

**build-runner.js** — modify to create a shared client record as the first action:

1. Before GHL API calls, INSERT into `clients` table with data from the onboarding form
2. Store `client_id` on the `builds` record
3. After Phase 1 (GHL sub-account): UPDATE client with `location_id`
4. After Phase 2 (WordPress): UPDATE client with `wp_url`, `wp_username`, `wp_password`
5. After completion: UPDATE client with `onboarding_status = 'completed'`

**Onboarding form** — the existing BuildForm.jsx already collects all needed data. No UI changes needed beyond ensuring the form fields map to the shared client columns.

**Social Planner** — gets its own sidebar entry (`/social`) instead of being nested under clients. The existing client/campaign relationship stays the same.

### 9.2 No new database tables

The `builds` table gets one new column:
```sql
ALTER TABLE builds ADD COLUMN client_id INTEGER REFERENCES clients(id);
```

### 9.3 Result

After this milestone, creating a new client via onboarding automatically makes them available in Health, Reports, and Proposals — no manual data entry needed.

---

## 10. Shared Components

### ClientSelector

A React component used by Proposals, Reports, and the Dashboard. Reads from `GET /api/clients` and presents a searchable dropdown with business name and niche badge.

### ActivityFeed

Shared component for Dashboard and Client Detail page. Queries recent actions across all modules (reports generated, proposals sent, health alerts, onboarding completions).

### Shared route registration pattern

Each module exports a function that takes `db` and returns an Express router:
```js
// server/modules/health/routes.js
export function createHealthRouter(db) {
  const router = Router();
  // ... routes
  return router;
}
```

Registered in app.js:
```js
app.use('/api/health', requireAuth, createHealthRouter(db));
```

---

## 11. Environment Variables

All existing env vars stay. New ones added:

```
# GHL Mock Mode (development)
GHL_MOCK_MODE=false

# Email (Nodemailer) — for Proposals + Reports
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SENDER_NAME=VO360
SENDER_EMAIL=hello@vo360.net

# Alerts
ALERT_EMAIL=
CRON_SCHEDULE=0 6 * * *
```

---

## 12. File Structure (final state)

```
ghl-sub-account-builder/
  server/
    app.js
    index.js
    middleware/auth.js
    db/
      index.js              (schema init — all tables)
      queries.js            (shared client queries)
      social-queries.js     (existing social planner)
      social-schema.js      (existing social tables)
    shared/
      brand.js
      ghl-data-puller/
      pdf-generator/
      email-sender/
    modules/
      health/
        routes.js
        services/score-calculator.js
        services/churn-alerts.js
      knowledge-base/
        routes.js
        services/doc-structurer.js
      proposals/
        routes.js
        services/proposal-builder.js
        services/contract-builder.js
      reports/
        routes.js
        services/narrative-writer.js
        services/report-pdf-builder.js
    routes/              (existing — auth, builds, clients, campaigns, settings, stats)
    services/            (existing — build-runner, social-runner, etc.)
  src/
    pages/
      Dashboard.jsx
      clients/
        ClientList.jsx
        ClientDetail.jsx
      health/
        HealthDashboard.jsx
        ClientHealth.jsx
      knowledge-base/
        KBList.jsx
        KBDocument.jsx
        KBCreate.jsx
      proposals/
        ProposalForm.jsx
        ProposalHistory.jsx
        ProposalPreview.jsx
      reports/
        ReportsDashboard.jsx
        ReportDetail.jsx
        ReportGenerate.jsx
      onboarding/        (existing BuildForm, BuildDetail)
      social/            (existing campaign pages)
      settings/          (existing)
    components/
      shared/
        ClientSelector.jsx
        ActivityFeed.jsx
        Sidebar.jsx       (updated)
      ...existing components
  config/
    package-config.json
    scoring.json
    categories.json
  api/index.js           (Vercel serverless entry)
  vercel.json
```

# GHL Sub-Account Builder — Design Spec

## Overview

A Node.js web app for creating GoHighLevel sub-accounts. One-page builder UI with a form and real-time progress tracker that runs 6 sequential GHL API steps. Includes build history, basic auth, and full error logging.

**Users:** Uriel + 1-2 VO360 team members (basic shared-password auth).
**Runs:** Locally on macOS first, deployable to a VPS later.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express (port 3003) |
| Database | SQLite (via better-sqlite3) |
| Real-time | Server-Sent Events (SSE) |
| GHL API | v2, base URL `https://services.leadconnectorhq.com`, Bearer token auth, Version header per-endpoint (see Build Steps section) |

**Branding:** VO360 theme — magenta `#ff00ff`, navy `#000080`, dark sidebar `#1a2133`, background `#f2f7fa`, white cards, Poppins font.

---

## Pages & Navigation

Dark sidebar with 3 nav items:

1. **New Build** — form + progress tracker (main page)
2. **Build History** — searchable table with stats
3. **Settings** — snapshot ID management (future)

Top-right: simple user indicator + logout link.

---

## New Build Page

### Form (left side)

Three grouped sections in a white card:

**Business Information:**
- Business Name (text, required)
- Business Phone (text, required)
- Business Email (email, required)
- Business Address, City, State, Zip, Country (text)

**Configuration:**
- Industry (dropdown: Construction, Plumbing, Electrical, Cleaning, General — required)
- Timezone (dropdown, required)
- Phone Area Code (text, required)
- Website URL (text, optional)

**Account Owner:**
- First Name (text, required)
- Last Name (text, required)

Submit button: magenta gradient, full-width — "Create Sub-Account"

**Validation rules:**
- Business Email: valid email format
- Business Phone: 10+ digits (stripped of formatting)
- Phone Area Code: exactly 3 digits
- Website URL: valid URL format if provided
- All required fields: non-empty after trimming
- Validated on both frontend (inline errors) and backend (400 response with field errors)

### Progress Tracker (right side, 300px)

Vertical stepper showing 6 steps. Each step displays:
- Status icon: grey circle (pending), magenta pulsing spinner (running), green checkmark (completed), red X (failed)
- Step name
- Status text with duration when completed
- Error message + "Retry" button when failed

Success banner appears below tracker when all 6 steps complete, showing the new GHL location ID.

---

## Build History Page

### Stats Row (4 cards)
- Total Builds (navy)
- Successful (green)
- Failed (red)
- Avg Build Time (magenta)

### Search & Filters
- Text search by business name, email, or location ID
- Industry filter dropdown
- Status filter dropdown (success/failed/all)

### Table
Columns: Business (name + email), Owner, Industry (color badge), Status, Date, Build Time.

- Alternating row backgrounds
- Navy header row
- Click to expand: shows step-by-step detail with timestamps, duration, and error logs for failed steps
- Pagination: 20 builds per page

---

## The 6 Build Steps

All steps run sequentially. Each step is logged to the `build_steps` table and streamed to the frontend via SSE.

### Step 1: Create Sub-Account
```
POST /locations/
Headers: { Authorization: Bearer <agency_token>, Version: 2021-07-28 }
Body: { name, phone, email, address, city, state, postalCode, country, timezone, snapshot: { id, type: "own" } }
Response: { location: { id: "locationId", ... } }
```
Snapshot ID loaded from `snapshots.json` based on selected industry. Saves the returned `locationId` for all subsequent steps. Also generates a location-level API token for subsequent calls if needed.

**Stored state:** `location_id` saved to `builds` table.

### Step 2: Provision Phone Number
```
POST /phone-numbers/buy
Headers: { Authorization: Bearer <agency_token>, Version: 2021-07-28 }
Body: { locationId, areaCode, capabilities: ["sms", "voice", "mms"] }
Response: { phoneNumber: { id, number, ... } }
```
If the requested area code is unavailable, tries nearby area codes by incrementing/decrementing the area code numerically (e.g., 305 → 304, 306, 303) up to 3 attempts before failing.

**Stored state:** `phone_number` and `phone_number_id` saved to `api_response` JSON in `build_steps`.

### Step 3: Set Custom Values
```
POST /locations/{locationId}/customValues
Headers: { Authorization: Bearer <agency_token>, Version: 2021-07-28 }
Body: { customValues: [
  { fieldKey: "contact.business_name", value: "<business_name>" },
  { fieldKey: "contact.business_phone", value: "<business_phone>" },
  { fieldKey: "contact.business_email", value: "<business_email>" },
  { fieldKey: "contact.business_address", value: "<full_address>" },
  { fieldKey: "contact.website_url", value: "<website_url>" },
  { fieldKey: "contact.provisioned_phone", value: "<phone_from_step_2>" }
] }
```
Custom fields are expected to exist on the location (created by the snapshot in Step 1). If a field key does not exist, the API call will skip it gracefully. The field keys above use GHL's `contact.` prefix convention; actual keys will be verified against the snapshot's custom fields during implementation and updated if they differ.

### Step 4: Create Pipeline
```
POST /opportunities/pipelines
Headers: { Authorization: Bearer <agency_token>, Version: 2021-07-28 }
Body: { locationId, name: "Sales Pipeline", stages: [{ name: "Stage Name", position: 0 }, ...] }
Response: { pipeline: { id, stages: [...] } }
```

Pipeline stages by industry:
- **Construction:** New Lead → Site Visit → Estimate Sent → Negotiation → Contract Signed → In Progress → Completed
- **Plumbing/Electrical:** Emergency → Scheduled → Dispatched → Completed → Invoice Sent → Paid (shared — intentionally the same for both industries)
- **Cleaning:** New Lead → Quote Sent → Booked → Recurring → Cancelled
- **General:** New Lead → Contacted → Estimate Sent → Follow Up → Won → Lost

**Stored state:** `pipeline_id` saved to `api_response` JSON in `build_steps`.

### Step 5: Create Admin User
```
POST /users/
Headers: { Authorization: Bearer <agency_token>, Version: 2021-07-28 }
Body: { locationIds: [locationId], firstName, lastName, email, role: "admin", permissions: {} }
Response: { user: { id, email, ... } }
```
GHL sends an invitation email to the new user automatically. The user sets their own password via GHL's invite flow.

**Stored state:** `user_id` saved to `api_response` JSON in `build_steps`.

### Step 6: Send Welcome Communications
First, create a contact for the account owner in the new location, then send email + SMS:

```
Step 6a: Create contact
POST /contacts/
Headers: { Authorization: Bearer <agency_token>, Version: 2021-07-28 }
Body: { locationId, firstName, lastName, email, phone: "<business_phone>" }
Response: { contact: { id, ... } }

Step 6b: Send welcome email
POST /conversations/messages
Headers: { Authorization: Bearer <agency_token>, Version: 2021-07-28 }
Body: { type: "Email", locationId, contactId, message: "<welcome_email_body>" }

Step 6c: Send welcome SMS
POST /conversations/messages
Headers: { Authorization: Bearer <agency_token>, Version: 2021-07-28 }
Body: { type: "SMS", locationId, contactId, message: "<welcome_sms_body>" }
```

**Welcome message content:**
- **Email subject:** "Welcome to [Business Name] — Your Account is Ready"
- **Email body:** Greeting, confirms their GHL sub-account is set up, instructs them to check their email for the GHL invitation (from Step 5), includes business details for reference, VO360 support contact.
- **SMS:** "Hi [First Name]! Your [Business Name] account is ready. Check your email for the login invitation. — VO360"

Note: The admin user (Step 5) receives their login credentials via GHL's built-in invitation email. Step 6 is a separate welcome message from the agency to the client confirming everything is set up.

---

## Configuration

### snapshots.json
```json
{
  "construction": { "id": "REPLACE_ME", "type": "own" },
  "plumbing": { "id": "REPLACE_ME", "type": "own" },
  "electrical": { "id": "REPLACE_ME", "type": "own" },
  "cleaning": { "id": "REPLACE_ME", "type": "own" },
  "general": { "id": "REPLACE_ME", "type": "own" }
}
```

### .env
```
GHL_AGENCY_API_KEY=
APP_PASSWORD=yourpassword   # plaintext — app hashes and stores in SQLite on first boot
PORT=3003
SESSION_SECRET=             # auto-generated on first boot if empty
```

---

## Authentication

Basic shared-password auth for a small team:
- Login page with single password field
- On first boot, the app reads `APP_PASSWORD` from `.env`, hashes it with bcrypt, and stores the hash in SQLite (`settings` table). Subsequent logins compare against the stored hash.
- Session cookie after successful login (express-session, 24h expiry)
- Session store: `better-sqlite3-session-store` (persists sessions across restarts, no memory leaks)
- All API routes (except `/api/auth/login`) protected by auth middleware

---

## Database Schema (SQLite)

### builds
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| business_name | TEXT | |
| business_email | TEXT | |
| business_phone | TEXT | |
| address | TEXT | Street address |
| city | TEXT | |
| state | TEXT | |
| zip | TEXT | |
| country | TEXT | |
| industry | TEXT | construction/plumbing/electrical/cleaning/general |
| timezone | TEXT | |
| owner_first_name | TEXT | |
| owner_last_name | TEXT | |
| area_code | TEXT | |
| website_url | TEXT | nullable |
| location_id | TEXT | GHL location ID, set after Step 1 |
| status | TEXT | pending / running / completed / failed |
| created_at | DATETIME | |
| completed_at | DATETIME | nullable |
| total_duration_ms | INTEGER | nullable |

### build_steps
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Auto-increment PK |
| build_id | TEXT | FK → builds |
| step_number | INTEGER | 1-6 |
| step_name | TEXT | Human-readable name |
| status | TEXT | pending / running / completed / failed |
| started_at | DATETIME | nullable |
| completed_at | DATETIME | nullable |
| duration_ms | INTEGER | nullable |
| error_message | TEXT | nullable |
| retry_count | INTEGER | Default 0 |
| api_response | TEXT | JSON blob of GHL API response |

### settings
| Column | Type | Notes |
|--------|------|-------|
| key | TEXT | Primary key (e.g., "password_hash", "session_secret") |
| value | TEXT | |

---

## API Endpoints (Express)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Authenticate with shared password |
| POST | /api/auth/logout | Clear session |
| POST | /api/builds | Start a new build (accepts form data) |
| GET | /api/builds/:id/stream | SSE stream for real-time progress |
| GET | /api/builds | List builds (paginated, filterable) |
| GET | /api/builds/:id | Get single build with step details |
| POST | /api/builds/:id/retry/:step | Retry a failed step |
| GET | /api/stats | Aggregate stats for history dashboard |

---

## Real-Time Progress (SSE)

After `POST /api/builds`, the frontend opens an SSE connection to `GET /api/builds/:id/stream`.

Events emitted:
```
event: step-update
data: {"step": 1, "status": "running"}

event: step-update
data: {"step": 1, "status": "completed", "duration_ms": 2100}

event: step-update
data: {"step": 2, "status": "running"}

event: build-complete
data: {"location_id": "abc123", "total_duration_ms": 12300}

event: build-failed
data: {"step": 3, "error": "Phone number unavailable", "retry_count": 3}
```

---

## Error Handling

1. **Auto-retry:** Each step retries up to 3x with exponential backoff (1s, 2s, 4s).
2. **Phone fallback:** If requested area code unavailable, tries 3 nearby area codes.
3. **Duplicate name:** If GHL returns duplicate error, appends Unix timestamp to business name.
4. **Manual retry:** Failed steps show a "Retry" button. Hits `POST /api/builds/:id/retry/:step`, picks up from the failed step without re-running completed steps.
5. **Partial state preservation:** Completed steps are never re-run. Build resumes from the failed step. Intermediate state (`location_id`, `phone_number`, `pipeline_id`, `user_id`, `contact_id`) is retrieved from the `api_response` JSON column in `build_steps` for the corresponding completed step. The retry endpoint reads prior step results to reconstruct the state needed for the failed step.
6. **Full logging:** Error messages + complete GHL API responses saved to `build_steps` for debugging.
7. **SSE reconnection:** Builds run to completion server-side regardless of browser disconnection. If the SSE connection drops, the frontend auto-reconnects using `EventSource` (built-in retry). On reconnect, it fetches the current build state via `GET /api/builds/:id` and resumes the SSE stream. The UI reconciles the current state with any missed events.

---

## Project Structure

```
ghl-sub-account-builder/
├── server/
│   ├── index.js              # Express app entry
│   ├── middleware/
│   │   └── auth.js           # Session auth middleware
│   ├── routes/
│   │   ├── auth.js           # Login/logout
│   │   ├── builds.js         # Build CRUD + SSE
│   │   └── stats.js          # Aggregate stats
│   ├── services/
│   │   ├── ghl-api.js        # GHL API client wrapper
│   │   ├── build-runner.js   # Orchestrates the 6-step build
│   │   └── phone-fallback.js # Area code fallback logic
│   ├── db/
│   │   ├── index.js          # SQLite connection + migrations
│   │   └── queries.js        # Prepared statements
│   └── config/
│       └── snapshots.json    # Industry snapshot IDs
├── src/                      # React frontend (Vite)
│   ├── main.jsx
│   ├── App.jsx
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── NewBuild.jsx
│   │   └── BuildHistory.jsx
│   ├── components/
│   │   ├── Sidebar.jsx
│   │   ├── BuildForm.jsx
│   │   ├── ProgressTracker.jsx
│   │   ├── StatsCards.jsx
│   │   ├── BuildTable.jsx
│   │   └── BuildDetailRow.jsx
│   └── hooks/
│       ├── useSSE.js         # SSE connection hook
│       └── useAuth.js        # Auth state hook
├── tailwind.config.js        # VO360 brand colors
├── vite.config.js            # Dev proxy: /api/* → http://localhost:3003
├── package.json
├── .env
└── docs/
```

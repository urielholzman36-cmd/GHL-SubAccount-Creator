import 'dotenv/config';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import express from 'express';
import session from 'express-session';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { initializeDb } from './db/index.js';
import { getSetting, setSetting } from './db/queries.js';
import { requireAuth } from './middleware/auth.js';
import { createAuthRouter } from './routes/auth.js';
import { createBuildsRouter } from './routes/builds.js';
import { createStatsRouter } from './routes/stats.js';
import { createClientsRouter } from './routes/clients.js';
import { createCampaignsRouter } from './routes/campaigns.js';

const require = createRequire(import.meta.url);
const SqliteStore = require('better-sqlite3-session-store')(session);

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// ─── Database setup ──────────────────────────────────────────────────────────
const db = new Database(join(projectRoot, 'data.db'));
initializeDb(db);

// ─── First-boot: seed default user if users table is empty ──────────────────
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
if (userCount === 0) {
  const hash = await bcrypt.hash('Ur25072002', 12);
  db.prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)').run('uriel_holzman', hash, 'Uriel');
  console.log('Default user "uriel_holzman" created (first boot).');
}

// ─── Auto-generate SESSION_SECRET if not set ─────────────────────────────────
let sessionSecret = getSetting(db, 'session_secret');
if (!sessionSecret) {
  const { randomBytes } = await import('crypto');
  sessionSecret = randomBytes(32).toString('hex');
  setSetting(db, 'session_secret', sessionSecret);
  console.log('Session secret generated and stored.');
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();

app.use(express.json());

app.use(
  session({
    store: new SqliteStore({ client: db }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  })
);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', createAuthRouter(db));
app.use('/api/builds', requireAuth, createBuildsRouter(db));
app.use('/api/stats', requireAuth, createStatsRouter(db));
app.use('/api/clients', requireAuth, createClientsRouter(db));
app.use('/api/campaigns', requireAuth, createCampaignsRouter(db));

// ─── Static files (production) ───────────────────────────────────────────────
const distPath = join(projectRoot, 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback — serve index.html for all non-API routes
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`GHL Sub-Account Builder running on http://localhost:${PORT}`);
});

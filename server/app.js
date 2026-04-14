import 'dotenv/config';
import { initCloudinary } from './services/social-cloudinary.js';
initCloudinary();
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
import { createSettingsRouter } from './routes/settings.js';

const require = createRequire(import.meta.url);
const SqliteStore = require('better-sqlite3-session-store')(session);

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// ─── Database setup ──────────────────────────────────────────────────────────
// On Vercel, use /tmp for writable SQLite. Locally, use project root.
const isVercel = !!process.env.VERCEL;
const dbPath = isVercel ? '/tmp/data.db' : join(projectRoot, 'data.db');
const db = new Database(dbPath);
initializeDb(db);

// ─── First-boot: seed default users if users table is empty ─────────────────
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
if (userCount === 0) {
  const hash1 = await bcrypt.hash('Ur25072002', 12);
  db.prepare('INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, ?)').run('uriel_holzman', hash1, 'Uriel', 1);

  const hash2 = await bcrypt.hash('Hsp2026', 12);
  db.prepare('INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, ?)').run('modi', hash2, 'Modi', 0);

  console.log('Default users seeded (first boot).');
}

// ─── Auto-generate SESSION_SECRET if not set ─────────────────────────────────
let sessionSecret = process.env.SESSION_SECRET || getSetting(db, 'session_secret');
if (!sessionSecret) {
  const { randomBytes } = await import('crypto');
  sessionSecret = randomBytes(32).toString('hex');
  setSetting(db, 'session_secret', sessionSecret);
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
      secure: isVercel,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
    ...(isVercel ? { proxy: true } : {}),
  })
);

if (isVercel) {
  app.set('trust proxy', 1);
}

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', createAuthRouter(db));
app.use('/api/builds', requireAuth, createBuildsRouter(db));
app.use('/api/stats', requireAuth, createStatsRouter(db));
app.use('/api/clients', requireAuth, createClientsRouter(db));
app.use('/api/campaigns', requireAuth, createCampaignsRouter(db));
app.use('/api/settings', requireAuth, createSettingsRouter());

// ─── Static files (production) ───────────────────────────────────────────────
const distPath = join(projectRoot, 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

export default app;

import 'dotenv/config';
import { initCloudinary } from './services/social-cloudinary.js';
initCloudinary();
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import express from 'express';
import cookieSession from 'cookie-session';
import bcrypt from 'bcryptjs';
import { createClient } from '@libsql/client';
import { initializeDb } from './db/index.js';
import { getSetting, setSetting } from './db/queries.js';
import { requireAuth } from './middleware/auth.js';
import { createAuthRouter } from './routes/auth.js';
import { createBuildsRouter } from './routes/builds.js';
import { createStatsRouter } from './routes/stats.js';
import { createClientsRouter } from './routes/clients.js';
import { createCampaignsRouter } from './routes/campaigns.js';
import { createSettingsRouter } from './routes/settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// ─── Database setup (lazy — created on first request) ────────────────────────
let _realDb = null;
let _initDone = false;

function getRealDb() {
  if (!_realDb) {
    _realDb = createClient({
      url: process.env.TURSO_CONNECTION_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _realDb;
}

// Proxy that forwards all method calls to the real client (created lazily)
const db = new Proxy({}, {
  get(_, prop) {
    const real = getRealDb();
    const val = real[prop];
    return typeof val === 'function' ? val.bind(real) : val;
  },
});

async function ensureInit() {
  if (_initDone) return;
  _initDone = true;

  await initializeDb(db);

  // Seed default users on first boot
  const userCountResult = await db.execute('SELECT COUNT(*) as count FROM users');
  const userCount = userCountResult.rows[0].count;
  if (userCount === 0) {
    const hash1 = await bcrypt.hash('Ur25072002', 12);
    await db.execute({ sql: 'INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, ?)', args: ['uriel_holzman', hash1, 'Uriel', 1] });

    const hash2 = await bcrypt.hash('Hsp2026', 12);
    await db.execute({ sql: 'INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, ?)', args: ['modi', hash2, 'Modi', 0] });

    console.log('Default users seeded (first boot).');
  }
}

// ─── Session secret ──────────────────────────────────────────────────────────
const sessionSecret = process.env.SESSION_SECRET || 'vo360-fallback-secret-change-me';

// ─── Express app ─────────────────────────────────────────────────────────────
const isVercel = !!process.env.VERCEL;
const app = express();

app.use(express.json());

// Run DB init before any route handler
app.use(async (req, res, next) => {
  try {
    await ensureInit();
    next();
  } catch (err) {
    console.error('DB init failed:', err);
    res.status(500).json({ error: 'Database initialization failed' });
  }
});

app.use(
  cookieSession({
    name: 'session',
    keys: [sessionSecret],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: isVercel,
    sameSite: 'lax',
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

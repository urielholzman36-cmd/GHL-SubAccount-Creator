import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';

export function createAuthRouter(db) {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    req.session.authenticated = true;
    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ ok: true, username: user.username, display_name: user.display_name });
  });

  router.get('/check', (req, res) => {
    if (req.session?.authenticated) {
      return res.json({ ok: true, username: req.session.username });
    }
    res.status(401).json({ ok: false });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: 'Logout failed' });
      res.json({ ok: true });
    });
  });

  // ─── User management (authenticated only) ──────────────────────────────────

  router.get('/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT id, username, display_name, created_at FROM users WHERE id = ?').get(req.session.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });

  router.get('/users', requireAuth, (req, res) => {
    const users = db.prepare('SELECT id, username, display_name, created_at FROM users ORDER BY created_at').all();
    res.json(users);
  });

  router.post('/users', requireAuth, async (req, res) => {
    const { username, password, display_name } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)').run(username, hash, display_name || null);
    res.json({ id: result.lastInsertRowid });
  });

  router.delete('/users/:id', requireAuth, (req, res) => {
    const targetId = Number(req.params.id);
    if (req.session.userId === targetId) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    const count = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last user' });
    }
    const deleted = db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
    if (deleted.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ ok: true });
  });

  return router;
}

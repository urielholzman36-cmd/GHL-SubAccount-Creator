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
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username] });
    const user = result.rows[0];
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
    req.session.isAdmin = user.is_admin;
    res.json({ ok: true, username: user.username, display_name: user.display_name, is_admin: user.is_admin });
  });

  router.get('/check', (req, res) => {
    if (req.session?.authenticated) {
      return res.json({ ok: true, username: req.session.username, is_admin: req.session.isAdmin });
    }
    res.status(401).json({ ok: false });
  });

  router.post('/logout', (req, res) => {
    req.session = null;
    res.json({ ok: true });
  });

  // ─── User management (authenticated only) ──────────────────────────────────

  router.get('/me', requireAuth, async (req, res) => {
    const result = await db.execute({ sql: 'SELECT id, username, display_name, created_at FROM users WHERE id = ?', args: [req.session.userId] });
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });

  router.get('/users', requireAuth, async (req, res) => {
    const result = await db.execute('SELECT id, username, display_name, is_admin, created_at FROM users ORDER BY created_at');
    res.json(result.rows);
  });

  router.post('/users', requireAuth, async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(403).json({ error: 'Only admins can create users' });
    }
    const { username, password, display_name } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const existing = await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] });
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    const hash = await bcrypt.hash(password, 12);
    const result = await db.execute({ sql: 'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)', args: [username, hash, display_name || null] });
    res.json({ id: result.lastInsertRowid });
  });

  router.delete('/users/:id', requireAuth, async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(403).json({ error: 'Only admins can delete users' });
    }
    const targetId = Number(req.params.id);
    if (req.session.userId === targetId) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }
    const countResult = await db.execute('SELECT COUNT(*) as count FROM users');
    if (countResult.rows[0].count <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last user' });
    }
    const deleted = await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [targetId] });
    if (deleted.rowsAffected === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ ok: true });
  });

  return router;
}

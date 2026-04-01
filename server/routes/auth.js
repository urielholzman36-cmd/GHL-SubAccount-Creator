import { Router } from 'express';
import bcrypt from 'bcryptjs';
import * as queries from '../db/queries.js';

export function createAuthRouter(db) {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }
    const storedHash = queries.getSetting(db, 'password_hash');
    if (!storedHash) {
      return res.status(500).json({ error: 'App not configured — no password set' });
    }
    const match = await bcrypt.compare(password, storedHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    req.session.authenticated = true;
    res.json({ ok: true });
  });

  router.get('/check', (req, res) => {
    if (req.session?.authenticated) return res.json({ ok: true });
    res.status(401).json({ ok: false });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: 'Logout failed' });
      res.json({ ok: true });
    });
  });

  return router;
}

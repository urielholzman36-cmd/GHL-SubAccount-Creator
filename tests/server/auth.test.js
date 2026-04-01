import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeDb } from '../../server/db/index.js';
import * as queries from '../../server/db/queries.js';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../../server/middleware/auth.js';

describe('Auth', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    initializeDb(db);
  });

  it('requireAuth rejects when no session', () => {
    const req = { session: {} };
    const res = { status: (code) => ({ json: (body) => ({ code, body }) }) };
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    requireAuth(req, res, next);
    expect(nextCalled).toBe(false);
  });

  it('requireAuth allows when session authenticated', () => {
    const req = { session: { authenticated: true } };
    const res = {};
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    requireAuth(req, res, next);
    expect(nextCalled).toBe(true);
  });

  it('password hash comparison works', async () => {
    const hash = await bcrypt.hash('testpassword', 10);
    queries.setSetting(db, 'password_hash', hash);
    const storedHash = queries.getSetting(db, 'password_hash');
    const match = await bcrypt.compare('testpassword', storedHash);
    expect(match).toBe(true);
    const noMatch = await bcrypt.compare('wrongpassword', storedHash);
    expect(noMatch).toBe(false);
  });
});

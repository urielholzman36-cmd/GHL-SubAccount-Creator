import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../setup.js';
import { initializeSocialTables } from '../../server/db/social-schema.js';
import {
  createClient,
  getClient,
  listClients,
  updateClient,
  deleteClient,
} from '../../server/db/social-queries.js';

describe('Client CRUD', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
    db.pragma('foreign_keys = ON');
    initializeSocialTables(db);
  });

  it('creates and retrieves a client with default platforms', () => {
    const id = createClient(db, { name: 'Acme Corp' });
    expect(id).toBeTruthy();

    const client = getClient(db, id);
    expect(client.name).toBe('Acme Corp');
    expect(JSON.parse(client.platforms)).toEqual(['facebook', 'instagram']);
    expect(client.created_at).toBeTruthy();
  });

  it('lists all clients', () => {
    createClient(db, { name: 'Client A' });
    createClient(db, { name: 'Client B' });

    const clients = listClients(db);
    expect(clients).toHaveLength(2);
  });

  it('updates a client', () => {
    const id = createClient(db, { name: 'Old Name' });
    updateClient(db, id, { name: 'New Name', brand_tone: 'professional' });

    const client = getClient(db, id);
    expect(client.name).toBe('New Name');
    expect(client.brand_tone).toBe('professional');
  });

  it('deletes a client and cascades', () => {
    const id = createClient(db, { name: 'Doomed' });
    deleteClient(db, id);

    const client = getClient(db, id);
    expect(client).toBeUndefined();
  });
});

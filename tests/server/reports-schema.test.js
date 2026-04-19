import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@libsql/client';
import { initializeDb } from '../../server/db/index.js';

describe('reports migration', () => {
  let db;
  beforeAll(async () => {
    db = createClient({ url: 'file::memory:' });
    await initializeDb(db);
  });

  it('creates reports table with expected columns', async () => {
    const info = await db.execute("PRAGMA table_info(reports)");
    const cols = info.rows.map((r) => r.name);
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'client_id', 'month', 'data_snapshot_json',
      'narrative_json', 'pdf_url', 'pdf_cloudinary_id',
      'status', 'created_at', 'updated_at',
    ]));
  });

  it('enforces UNIQUE(client_id, month)', async () => {
    await db.execute("INSERT INTO clients (id, name) VALUES (99, 'C1')");
    await db.execute({
      sql: "INSERT INTO reports (client_id, month, status) VALUES (?, ?, ?)",
      args: [99, '2026-09', 'draft'],
    });
    await expect(db.execute({
      sql: "INSERT INTO reports (client_id, month, status) VALUES (?, ?, ?)",
      args: [99, '2026-09', 'draft'],
    })).rejects.toThrow();
  });
});

// scripts/daily-csv-routine/lib/client-registry.mjs
import { createClient } from '@libsql/client';

let db = null;

function normalizeName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function getDb() {
  if (db) return db;
  const url = process.env.TURSO_CONNECTION_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error('TURSO_CONNECTION_URL missing in env');
  db = createClient({ url, authToken });
  return db;
}

/**
 * Look up a client by folder name (case/whitespace insensitive).
 * @returns {Promise<object|null>} { id, name, cloudinary_folder, posting_time } or null
 */
export async function lookupClientByFolder(folderName) {
  const d = getDb();
  const target = normalizeName(folderName);
  const res = await d.execute(
    'SELECT id, name, cloudinary_folder, posting_time FROM clients',
  );
  for (const row of res.rows) {
    if (normalizeName(row.name) === target) {
      return {
        id: row.id,
        name: row.name,
        cloudinary_folder: row.cloudinary_folder || normalizeName(row.name).replace(/[^a-z0-9]/g, '-'),
        posting_time: row.posting_time || '09:00:00',
      };
    }
  }
  return null;
}

// scripts/daily-csv-routine/lib/client-registry.mjs
import { createClient } from '@libsql/client';

let db = null;

function normalizeName(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePostingTime(raw) {
  const s = String(raw || '').trim();
  if (!s) return '09:00:00';
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;           // HH:mm:ss
  if (/^\d{1,2}:\d{2}$/.test(s)) return `${s}:00`;         // HH:mm → HH:mm:ss
  return '09:00:00';                                        // anything else → safe default
}

function normalizeCloudinaryFolder(raw, clientName) {
  const s = String(raw || '').trim();
  if (s) return s;
  return normalizeName(clientName).replace(/[^a-z0-9]/g, '-');
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
        cloudinary_folder: normalizeCloudinaryFolder(row.cloudinary_folder, row.name),
        posting_time: normalizePostingTime(row.posting_time),
      };
    }
  }
  return null;
}

import { ulid } from 'ulid';

const DEFAULT_CATEGORIES = [
  { name: 'Client Onboarding', display_order: 1 },
  { name: 'Sales & Outreach', display_order: 2 },
  { name: 'Tool Setup', display_order: 3 },
  { name: 'Internal Workflows', display_order: 4 },
  { name: 'Troubleshooting', display_order: 5 },
];

export async function initializeKbTables(db) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS kb_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kb_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category_id TEXT,
      content_raw TEXT NOT NULL,
      content_structured TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      created_by TEXT NOT NULL,
      updated_by TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kb_document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
      content_structured TEXT NOT NULL,
      title TEXT NOT NULL,
      edited_by TEXT NOT NULL,
      edited_at DATETIME DEFAULT (datetime('now')),
      change_summary TEXT
    );

    CREATE TABLE IF NOT EXISTS kb_document_images (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
      cloudinary_public_id TEXT NOT NULL,
      secure_url TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      position_marker TEXT NOT NULL,
      uploaded_at DATETIME DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_kb_documents_category ON kb_documents(category_id);
    CREATE INDEX IF NOT EXISTS idx_kb_documents_deleted ON kb_documents(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_kb_documents_updated ON kb_documents(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_kb_versions_document ON kb_document_versions(document_id);
    CREATE INDEX IF NOT EXISTS idx_kb_images_document ON kb_document_images(document_id);
  `);

  const existing = await db.execute('SELECT COUNT(*) as count FROM kb_categories');
  const count = Number(existing.rows[0].count);
  if (count === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      await db.execute({
        sql: 'INSERT INTO kb_categories (id, name, display_order) VALUES (?, ?, ?)',
        args: [ulid(), cat.name, cat.display_order],
      });
    }
  }
}

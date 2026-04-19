let Database;
try {
  Database = (await import('better-sqlite3')).default;
} catch {
  Database = null;
}

export function createTestDb() {
  if (!Database) {
    throw new Error('better-sqlite3 not installed. Install with: npm install --save-dev better-sqlite3');
  }
  const db = new Database(':memory:');
  return db;
}

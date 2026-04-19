export async function initializeReportsTables(db) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS reports (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id           INTEGER NOT NULL,
      month               TEXT    NOT NULL,
      data_snapshot_json  TEXT,
      narrative_json      TEXT,
      pdf_url             TEXT,
      pdf_cloudinary_id   TEXT,
      status              TEXT    NOT NULL DEFAULT 'draft',
      created_at          DATETIME DEFAULT (datetime('now')),
      updated_at          DATETIME DEFAULT (datetime('now')),
      UNIQUE(client_id, month),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_reports_client_month
      ON reports(client_id, month DESC);
  `);
}

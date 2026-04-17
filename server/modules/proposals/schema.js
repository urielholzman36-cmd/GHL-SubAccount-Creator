export async function initializeProposalsTables(db) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS proposals (
      id                  TEXT PRIMARY KEY,
      client_id           INTEGER,
      client_name         TEXT NOT NULL,
      business_name       TEXT NOT NULL,
      email               TEXT NOT NULL,
      phone               TEXT,
      niche               TEXT,
      notes               TEXT,
      package_name        TEXT,
      package_price       INTEGER,
      proposal_url        TEXT NOT NULL,
      contract_url        TEXT NOT NULL,
      proposal_public_id  TEXT,
      contract_public_id  TEXT,
      created_by          TEXT,
      created_at          DATETIME DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_proposals_created ON proposals(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_proposals_client ON proposals(client_id);
  `);

  // Additive migration for pre-existing deployments
  const cols = (await db.execute('PRAGMA table_info(proposals)')).rows.map((r) => r.name);
  if (!cols.includes('proposal_public_id')) {
    await db.execute('ALTER TABLE proposals ADD COLUMN proposal_public_id TEXT');
  }
  if (!cols.includes('contract_public_id')) {
    await db.execute('ALTER TABLE proposals ADD COLUMN contract_public_id TEXT');
  }
}

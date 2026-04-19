import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { initializeDb } from '../../server/db/index.js';
import {
  createPagePrompt,
  listPagePromptsByClient,
  getPagePromptById,
  updatePagePrompt,
  deletePagePrompt,
} from '../../server/db/queries.js';

describe('page_prompts CRUD', () => {
  let db;
  beforeAll(async () => {
    db = createClient({ url: 'file::memory:' });
    await initializeDb(db);
    await db.execute("INSERT INTO clients (id, name) VALUES (1, 'Test Client')");
  });

  beforeEach(async () => {
    await db.execute('DELETE FROM page_prompts');
  });

  it('creates, lists, reads, updates, deletes', async () => {
    const created = await createPagePrompt(db, {
      client_id: 1,
      build_id: null,
      page_type: 'pricing',
      page_name: 'Pricing',
      page_slug: '/pricing',
      user_notes: '3 tiers',
      generated_prompt: 'PAGE TYPE: Pricing\n...',
      brand_snapshot_json: JSON.stringify({ palette: ['#111'] }),
    });
    expect(created.id).toBeTruthy();

    const list = await listPagePromptsByClient(db, 1);
    expect(list).toHaveLength(1);
    expect(list[0].page_type).toBe('pricing');

    const one = await getPagePromptById(db, created.id);
    expect(one.page_name).toBe('Pricing');

    await updatePagePrompt(db, created.id, { user_notes: '4 tiers', generated_prompt: 'v2' });
    const updated = await getPagePromptById(db, created.id);
    expect(updated.user_notes).toBe('4 tiers');
    expect(updated.generated_prompt).toBe('v2');

    await deletePagePrompt(db, created.id);
    const afterDelete = await listPagePromptsByClient(db, 1);
    expect(afterDelete).toHaveLength(0);
  });
});

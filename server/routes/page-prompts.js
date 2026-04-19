import { Router } from 'express';
import {
  createPagePrompt,
  listPagePromptsByClient,
  getPagePromptById,
  updatePagePrompt,
  deletePagePrompt,
} from '../db/queries.js';
import { generatePagePrompt, PRESETS } from '../services/page-prompt-generator.js';

export function createPagePromptsRouter(db) {
  const router = Router();

  // GET /api/page-prompts?client_id=1
  router.get('/', async (req, res, next) => {
    try {
      const clientId = Number(req.query.client_id);
      if (!clientId) return res.status(400).json({ error: 'client_id required' });
      const rows = await listPagePromptsByClient(db, clientId);
      res.json(rows);
    } catch (e) { next(e); }
  });

  // GET /api/page-prompts/presets  → list of preset types for the UI dropdown
  router.get('/presets', (_req, res) => {
    res.json(Object.entries(PRESETS).map(([value, { label }]) => ({ value, label })));
  });

  // GET /api/page-prompts/:id
  router.get('/:id', async (req, res, next) => {
    try {
      const row = await getPagePromptById(db, Number(req.params.id));
      if (!row) return res.status(404).json({ error: 'not found' });
      res.json(row);
    } catch (e) { next(e); }
  });

  // POST /api/page-prompts  { client_id, page_type, page_name, page_slug, user_notes }
  router.post('/', async (req, res, next) => {
    try {
      const { client_id, page_type, page_name, page_slug, user_notes } = req.body || {};
      if (!client_id || !page_type || !page_name) {
        return res.status(400).json({ error: 'client_id, page_type, page_name required' });
      }
      if (!PRESETS[page_type]) {
        return res.status(400).json({ error: `invalid page_type (must be one of ${Object.keys(PRESETS).join(', ')})` });
      }

      // Load brand from client + most recent build (if any)
      const clientRow = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [client_id] });
      const client = clientRow.rows[0];
      if (!client) return res.status(404).json({ error: 'client not found' });

      const buildRow = await db.execute({
        sql: 'SELECT * FROM builds WHERE client_id = ? ORDER BY created_at DESC LIMIT 1',
        args: [client_id],
      });
      const build = buildRow.rows[0];

      const brand = {
        name: client.name,
        industry: client.industry || build?.industry,
        brand_palette_json: build?.brand_palette_json || null,
        brand_colors_json: client.brand_colors_json,
        brand_personality: build?.brand_personality || client.brand_personality,
        brand_mood_description: build?.brand_mood_description || client.brand_mood_description,
        recommended_surface_style: build?.recommended_surface_style || client.recommended_surface_style,
        industry_cues_json: build?.industry_cues_json || client.industry_cues_json,
        service_areas: build?.service_areas || client.service_areas,
        primary_cta: build?.primary_cta,
        secondary_cta: build?.secondary_cta,
      };

      // Require at least some brand signal
      if (!brand.brand_personality && !brand.brand_palette_json && !brand.brand_colors_json) {
        return res.status(400).json({ error: 'Client has no brand data — run Analyze Brand first.' });
      }

      const { prompt, brand_snapshot } = await generatePagePrompt({
        page_type, page_name,
        page_slug: page_slug || null,
        user_notes: user_notes || null,
        brand,
        tenweb_site_prompt: build?.tenweb_prompt || null,
      });

      const { id } = await createPagePrompt(db, {
        client_id,
        build_id: build?.id || null,
        page_type, page_name,
        page_slug: page_slug || null,
        user_notes: user_notes || null,
        generated_prompt: prompt,
        brand_snapshot_json: JSON.stringify(brand_snapshot),
      });

      const row = await getPagePromptById(db, id);
      res.status(201).json(row);
    } catch (e) { next(e); }
  });

  // PUT /api/page-prompts/:id  { regenerate: true } OR { user_notes }
  router.put('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await getPagePromptById(db, id);
      if (!existing) return res.status(404).json({ error: 'not found' });

      const { regenerate, user_notes, page_name, page_slug } = req.body || {};

      if (user_notes !== undefined) {
        await updatePagePrompt(db, id, { user_notes });
      }
      if (page_name !== undefined) {
        await updatePagePrompt(db, id, { page_name });
      }
      if (page_slug !== undefined) {
        await updatePagePrompt(db, id, { page_slug });
      }

      if (regenerate) {
        const fresh = await getPagePromptById(db, id);
        const clientRow = await db.execute({ sql: 'SELECT * FROM clients WHERE id = ?', args: [fresh.client_id] });
        const client = clientRow.rows[0];
        const buildRow = fresh.build_id
          ? await db.execute({ sql: 'SELECT * FROM builds WHERE id = ?', args: [fresh.build_id] })
          : { rows: [] };
        const build = buildRow.rows[0];

        const brand = {
          name: client.name,
          industry: client.industry || build?.industry,
          brand_palette_json: build?.brand_palette_json || null,
          brand_colors_json: client.brand_colors_json,
          brand_personality: build?.brand_personality || client.brand_personality,
          brand_mood_description: build?.brand_mood_description || client.brand_mood_description,
          recommended_surface_style: build?.recommended_surface_style || client.recommended_surface_style,
          industry_cues_json: build?.industry_cues_json || client.industry_cues_json,
          service_areas: build?.service_areas || client.service_areas,
          primary_cta: build?.primary_cta,
          secondary_cta: build?.secondary_cta,
        };

        const { prompt, brand_snapshot } = await generatePagePrompt({
          page_type: fresh.page_type,
          page_name: fresh.page_name,
          page_slug: fresh.page_slug,
          user_notes: fresh.user_notes,
          brand,
          tenweb_site_prompt: build?.tenweb_prompt || null,
        });

        await updatePagePrompt(db, id, {
          generated_prompt: prompt,
          brand_snapshot_json: JSON.stringify(brand_snapshot),
        });
      }

      const updated = await getPagePromptById(db, id);
      res.json(updated);
    } catch (e) { next(e); }
  });

  // DELETE /api/page-prompts/:id
  router.delete('/:id', async (req, res, next) => {
    try {
      await deletePagePrompt(db, Number(req.params.id));
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return router;
}

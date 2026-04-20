import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as socialQueries from '../db/social-queries.js';
import { encrypt } from '../services/crypto.js';
import { analyzeBrand } from '../services/brand-analyzer.js';
import { generateClientBrief, briefFilename, briefDocxFilename } from '../services/brief-generator.js';
import { buildBriefDocx } from '../services/brief-docx.js';
import { extractClientFromResearch } from '../services/client-extractor.js';
import { v2 as cloudinary } from 'cloudinary';
import AdmZip from 'adm-zip';

function slugify(s) {
  return String(s || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'client';
}

async function uploadLogoToCloudinary(buffer, clientSlug) {
  const publicId = `vo360-logos/${clientSlug || 'client'}-${Date.now()}`;
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: 'image', overwrite: true },
      (err, result) => err ? reject(err) : resolve(result.secure_url),
    );
    stream.end(buffer);
  });
}

function stripSensitive(client) {
  if (!client) return client;
  const { ghl_api_key_encrypted, ...safe } = client;
  return { ...safe, has_ghl_api_key: !!ghl_api_key_encrypted };
}

function handleGhlApiKey(body) {
  if (body && typeof body.ghl_api_key === 'string') {
    const trimmed = body.ghl_api_key.trim();
    if (trimmed) {
      body.ghl_api_key_encrypted = encrypt(trimmed);
    }
    delete body.ghl_api_key;
  }
  return body;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGOS_DIR = process.env.VERCEL
  ? '/tmp/logos'
  : path.resolve(__dirname, '../../data/logos');
try { if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true }); } catch (e) { /* read-only FS */ }

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp',
      'image/gif', 'image/avif', 'image/heic', 'image/heif',
      'application/octet-stream', // some clients/curl don't set a mimetype — fall back to extension check
    ];
    const allowedExt = /\.(png|jpe?g|svg|webp|gif|avif|heic|heif)$/i;
    if (allowedMimes.includes(file.mimetype) || allowedExt.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported logo type: ${file.mimetype}`));
    }
  },
}).single('logo');

// Research-bundle uploader — accepts zips + md + images.
const researchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 100 },
}).array('files');

const MD_EXT_RE = /\.(md|markdown|txt)$/i;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif|heic|heif|svg)$/i;
const LOGO_NAME_RE = /logo/i;

function mimeFromName(name) {
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  return {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
    avif: 'image/avif', heic: 'image/heic', heif: 'image/heif',
  }[ext] || 'application/octet-stream';
}

export function createClientsRouter(db) {
  const router = Router();

  // GET /builds-available — list builds that can be imported as clients
  router.get('/builds-available', async (req, res) => {
    try {
      const result = await db.execute(`
        SELECT id, business_name, industry, industry_text, city, state,
               target_audience, business_description, logo_path
        FROM builds ORDER BY created_at DESC
      `);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to list builds', details: err.message });
    }
  });

  // POST /import-from-build — create a client from an existing build record
  router.post('/import-from-build', async (req, res) => {
    const { build_id } = req.body;
    if (!build_id) return res.status(400).json({ error: 'build_id required' });

    const buildResult = await db.execute({ sql: 'SELECT * FROM builds WHERE id = ?', args: [build_id] });
    const build = buildResult.rows[0];
    if (!build) return res.status(404).json({ error: 'Build not found' });

    const location = [build.city, build.state].filter(Boolean).join(', ');
    const clientData = {
      name: build.business_name,
      industry: build.industry_text || build.industry || '',
      location,
      website: build.website_url || '',
      logo_path: build.logo_path || '',
      brand_description: build.business_description || '',
      target_audience: build.target_audience || '',
      cloudinary_folder: (build.business_name || '').replace(/[^a-zA-Z0-9]/g, '-'),
    };

    try {
      const id = await socialQueries.createClient(db, clientData);
      res.status(201).json({ id });
    } catch (err) {
      res.status(500).json({ error: 'Failed to import client', details: err.message });
    }
  });

  // GET / — list all clients
  router.get('/', async (req, res) => {
    try {
      const clients = await socialQueries.listClients(db);
      res.json(clients.map(stripSensitive));
    } catch (err) {
      res.status(500).json({ error: 'Failed to list clients', details: err.message });
    }
  });

  // GET /:id — get single client
  router.get('/:id', async (req, res) => {
    const client = await socialQueries.getClient(db, req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    res.json(stripSensitive(client));
  });

  // POST /import-research/extract — accept a bundle of Manus research files
  // (markdown + images, optionally zipped) and return structured client fields
  // extracted by Claude, plus the chosen logo as base64 for preview/re-upload.
  router.post('/import-research/extract', (req, res) => {
    researchUpload(req, res, async (uploadErr) => {
      if (uploadErr) return res.status(400).json({ error: 'Upload failed', details: uploadErr.message });
      try {
        const markdowns = [];
        const images = [];

        function addEntry(name, buffer) {
          if (MD_EXT_RE.test(name)) {
            markdowns.push({ filename: name, content: buffer.toString('utf8') });
          } else if (IMAGE_EXT_RE.test(name)) {
            images.push({ filename: name, buffer });
          }
        }

        for (const file of req.files || []) {
          if (/\.zip$/i.test(file.originalname)) {
            const zip = new AdmZip(file.buffer);
            for (const entry of zip.getEntries()) {
              if (entry.isDirectory) continue;
              const base = path.basename(entry.entryName);
              if (!base || base.startsWith('.') || base.startsWith('__MACOSX')) continue;
              if (entry.entryName.includes('__MACOSX/') || entry.entryName.startsWith('._')) continue;
              addEntry(base, entry.getData());
            }
          } else {
            addEntry(file.originalname, file.buffer);
          }
        }

        if (markdowns.length === 0) {
          return res.status(400).json({ error: 'No markdown research files found in upload' });
        }

        // Concatenate markdown content with file headers so Claude can see provenance
        const combined = markdowns.map((m) => `# === FILE: ${m.filename} ===\n\n${m.content}`).join('\n\n---\n\n');

        const extracted = await extractClientFromResearch({
          researchText: combined,
          apiKey: process.env.ANTHROPIC_API_KEY,
        });

        // Pick best logo candidate — prefer filename with "logo", else first image
        let logo = null;
        if (images.length > 0) {
          const preferred = images.find((img) => LOGO_NAME_RE.test(img.filename)) || images[0];
          logo = {
            filename: preferred.filename,
            mime: mimeFromName(preferred.filename),
            data_base64: preferred.buffer.toString('base64'),
          };
        }

        res.json({
          extracted,
          logo,
          research_markdown: combined,
          file_counts: {
            markdown: markdowns.length,
            images: images.length,
          },
        });
      } catch (err) {
        console.error('import-research extract failed:', err);
        res.status(500).json({ error: 'Extraction failed', details: err.message });
      }
    });
  });

  // POST / — create client (multipart with optional logo)
  router.post('/', (req, res) => {
    uploadLogo(req, res, async (uploadErr) => {
      if (uploadErr) {
        return res.status(400).json({ error: 'Logo upload failed', details: uploadErr.message });
      }

      const body = handleGhlApiKey(req.body || {});

      if (req.file) {
        try {
          const slug = body.cloudinary_folder || slugify(body.name);
          body.logo_path = await uploadLogoToCloudinary(req.file.buffer, slug);
        } catch (err) {
          console.error('cloudinary logo upload failed:', err);
          return res.status(500).json({ error: 'Logo upload to Cloudinary failed', details: err.message });
        }
      }

      try {
        const id = await socialQueries.createClient(db, body);
        // Fire-and-forget: auto-analyze brand if we have a logo + some description
        if (body.logo_path && (body.brand_description || body.industry)) {
          (async () => {
            try {
              const client = await socialQueries.getClient(db, id);
              const result = await analyzeBrand(client, { apiKey: process.env.ANTHROPIC_API_KEY });
              await socialQueries.updateClient(db, id, {
                brand_colors_json: JSON.stringify(result.palette),
                brand_personality: result.personality || null,
                brand_mood_description: result.mood_description || null,
                industry_cues_json: JSON.stringify(result.industry_cues || []),
                recommended_surface_style: result.recommended_surface_style || null,
              });
              console.log(`[brand] auto-analyzed client #${id}`);
            } catch (err) {
              console.error(`[brand] auto-analyze failed for client #${id}:`, err.message);
            }
          })();
        }
        res.status(201).json({ id });
      } catch (err) {
        res.status(500).json({ error: 'Failed to create client', details: err.message });
      }
    });
  });

  // PUT /:id/profile — update client profile (JSON body, no file upload)
  router.put('/:id/profile', async (req, res) => {
    const { id } = req.params;
    const existing = await socialQueries.getClient(db, id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    try {
      await socialQueries.updateClient(db, id, handleGhlApiKey({ ...req.body }));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update client', details: err.message });
    }
  });

  // PUT /:id — update client (multipart with optional logo)
  router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const existing = await socialQueries.getClient(db, id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    uploadLogo(req, res, async (uploadErr) => {
      if (uploadErr) {
        return res.status(400).json({ error: 'Logo upload failed', details: uploadErr.message });
      }

      const body = handleGhlApiKey(req.body || {});

      if (req.file) {
        try {
          const slug = body.cloudinary_folder || existing.cloudinary_folder || slugify(existing.name || body.name);
          body.logo_path = await uploadLogoToCloudinary(req.file.buffer, slug);
        } catch (err) {
          console.error('cloudinary logo upload failed:', err);
          return res.status(500).json({ error: 'Logo upload to Cloudinary failed', details: err.message });
        }
      }

      try {
        await socialQueries.updateClient(db, id, body);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: 'Failed to update client', details: err.message });
      }
    });
  });

  // POST /:id/analyze-brand — extract palette + infer personality / cues via Claude
  router.post('/:id/analyze-brand', async (req, res) => {
    try {
      const client = await socialQueries.getClient(db, req.params.id);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      if (!client.logo_path) {
        return res.status(400).json({ error: 'Client has no logo uploaded — add a logo first.' });
      }
      const result = await analyzeBrand(client, { apiKey: process.env.ANTHROPIC_API_KEY });
      const patch = {
        brand_colors_json: JSON.stringify(result.palette),
        brand_personality: result.personality || null,
        brand_mood_description: result.mood_description || null,
        industry_cues_json: JSON.stringify(result.industry_cues || []),
        recommended_surface_style: result.recommended_surface_style || null,
      };
      await socialQueries.updateClient(db, req.params.id, patch);
      // Per two-document model: master brief is once-per-company and manual.
      // Do NOT auto-regenerate here. Operator regenerates via UI if needed.
      res.json({ ok: true, analysis: result });
    } catch (err) {
      console.error('analyze-brand failed:', err);
      res.status(500).json({ error: 'Brand analysis failed', details: err.message });
    }
  });

  // POST /:id/generate-brief — create the Company Master Brief (Mode A).
  // Once per company unless `?replace=true` is passed. Prevents accidental
  // overwrite of a brief Manus is actively using.
  router.post('/:id/generate-brief', async (req, res) => {
    try {
      const client = await socialQueries.getClient(db, req.params.id);
      if (!client) return res.status(404).json({ error: 'Client not found' });

      const replace = req.query.replace === 'true' || req.body?.replace === true;
      if (client.client_brief && !replace) {
        return res.status(409).json({
          error: 'Brief already exists',
          details: 'Pass ?replace=true (or {"replace": true}) to overwrite. Master brief is intended to be once-per-company.',
        });
      }

      const brief = await generateClientBrief(client, { apiKey: process.env.ANTHROPIC_API_KEY });
      const now = new Date().toISOString();
      await socialQueries.updateClient(db, req.params.id, {
        client_brief: brief,
        client_brief_generated_at: now,
        client_brief_status: 'draft',
      });
      res.json({ ok: true, brief, generated_at: now, filename: briefFilename(client.name) });
    } catch (err) {
      console.error('generate-brief failed:', err);
      res.status(500).json({ error: 'Brief generation failed', details: err.message });
    }
  });

  // PUT /:id/brief — save operator edits to the Company Master Brief.
  // Flips status to 'final'. Body: { client_brief: "<markdown>" }.
  router.put('/:id/brief', async (req, res) => {
    try {
      const client = await socialQueries.getClient(db, req.params.id);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      const { client_brief } = req.body || {};
      if (typeof client_brief !== 'string' || !client_brief.trim()) {
        return res.status(400).json({ error: 'client_brief (string) required' });
      }
      const now = new Date().toISOString();
      await socialQueries.updateClient(db, req.params.id, {
        client_brief,
        client_brief_generated_at: now,
        client_brief_status: 'final',
      });
      res.json({ ok: true, status: 'final', generated_at: now });
    } catch (err) {
      console.error('save-brief failed:', err);
      res.status(500).json({ error: 'Save brief failed', details: err.message });
    }
  });

  // GET /:id/brief.md — download the Company Master Brief with the correct
  // two-document-model filename: [Client]_company_master_brief.md
  router.get('/:id/brief.md', async (req, res) => {
    const client = await socialQueries.getClient(db, req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (!client.client_brief) return res.status(404).json({ error: 'No brief generated for this client' });
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${briefFilename(client.name)}"`);
    res.send(client.client_brief);
  });

  // GET /:id/brief.docx — stream a Word-formatted export of the current brief.
  router.get('/:id/brief.docx', async (req, res) => {
    try {
      const client = await socialQueries.getClient(db, req.params.id);
      if (!client) return res.status(404).json({ error: 'Client not found' });
      if (!client.client_brief) return res.status(404).json({ error: 'No brief generated for this client' });
      const buf = await buildBriefDocx(client.client_brief);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${briefDocxFilename(client.name)}"`);
      res.send(buf);
    } catch (err) {
      console.error('brief.docx failed:', err);
      res.status(500).json({ error: 'DOCX export failed', details: err.message });
    }
  });

  // DELETE /:id — delete client and all its campaigns
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const existing = await socialQueries.getClient(db, id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    // Delete logo file if exists
    if (existing.logo_path) {
      const logoFullPath = path.resolve(__dirname, '../..', existing.logo_path);
      try { fs.unlinkSync(logoFullPath); } catch (_) {}
    }

    try {
      await socialQueries.deleteClient(db, id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete client', details: err.message });
    }
  });

  return router;
}

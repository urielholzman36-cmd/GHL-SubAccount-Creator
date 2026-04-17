import { Router } from 'express';
import multer from 'multer';
import { ulid } from 'ulid';
import { v2 as cloudinary } from 'cloudinary';
import { structureDocument, summarizeChanges } from './services/structurer.js';

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
}).array('images');

function currentUser(req) {
  return req.session?.username || 'unknown';
}

async function listCategories(db) {
  const r = await db.execute(`
    SELECT c.id, c.name, c.display_order, c.created_at,
           (SELECT COUNT(*) FROM kb_documents d WHERE d.category_id = c.id AND d.is_deleted = 0) AS doc_count
    FROM kb_categories c
    ORDER BY c.display_order, c.name
  `);
  return r.rows;
}

async function ensureCategory(db, name) {
  const existing = await db.execute({
    sql: 'SELECT id FROM kb_categories WHERE name = ? COLLATE NOCASE LIMIT 1',
    args: [name],
  });
  if (existing.rows[0]) return existing.rows[0].id;
  const id = ulid();
  const maxResult = await db.execute('SELECT COALESCE(MAX(display_order), 0) + 1 AS next FROM kb_categories');
  const nextOrder = Number(maxResult.rows[0].next);
  await db.execute({
    sql: 'INSERT INTO kb_categories (id, name, display_order) VALUES (?, ?, ?)',
    args: [id, name, nextOrder],
  });
  return id;
}

async function getDocumentWithImages(db, id) {
  const docResult = await db.execute({
    sql: `SELECT d.*, c.name AS category_name
          FROM kb_documents d
          LEFT JOIN kb_categories c ON c.id = d.category_id
          WHERE d.id = ? AND d.is_deleted = 0`,
    args: [id],
  });
  const doc = docResult.rows[0];
  if (!doc) return null;
  const imgResult = await db.execute({
    sql: 'SELECT * FROM kb_document_images WHERE document_id = ? ORDER BY uploaded_at ASC',
    args: [id],
  });
  return { ...doc, images: imgResult.rows };
}

export function createKbRouter(db) {
  const router = Router();

  // ── Categories ──────────────────────────────────────────────────────────
  router.get('/categories', async (req, res) => {
    try {
      res.json(await listCategories(db));
    } catch (err) {
      res.status(500).json({ error: 'Failed to list categories', details: err.message });
    }
  });

  router.post('/categories', async (req, res) => {
    try {
      const { name } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
      const id = await ensureCategory(db, name.trim());
      res.status(201).json({ id, name: name.trim() });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create category', details: err.message });
    }
  });

  router.put('/categories/:id', async (req, res) => {
    try {
      const { name } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
      await db.execute({
        sql: 'UPDATE kb_categories SET name = ? WHERE id = ?',
        args: [name.trim(), req.params.id],
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to rename category', details: err.message });
    }
  });

  router.delete('/categories/:id', async (req, res) => {
    try {
      const usage = await db.execute({
        sql: 'SELECT COUNT(*) AS count FROM kb_documents WHERE category_id = ? AND is_deleted = 0',
        args: [req.params.id],
      });
      if (Number(usage.rows[0].count) > 0) {
        return res.status(409).json({ error: 'Category is not empty' });
      }
      await db.execute({ sql: 'DELETE FROM kb_categories WHERE id = ?', args: [req.params.id] });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete category', details: err.message });
    }
  });

  // ── AI structuring ──────────────────────────────────────────────────────
  router.post('/documents/structure', async (req, res) => {
    try {
      const { raw_text } = req.body || {};
      if (!raw_text || !raw_text.trim()) return res.status(400).json({ error: 'raw_text is required' });
      const cats = await listCategories(db);
      const structured = await structureDocument({
        rawText: raw_text,
        existingCategories: cats.map((c) => c.name),
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      res.json(structured);
    } catch (err) {
      console.error('kb structure failed:', err);
      res.status(500).json({ error: 'Structuring failed', details: err.message });
    }
  });

  // ── Documents ───────────────────────────────────────────────────────────
  router.get('/documents', async (req, res) => {
    try {
      const { category, q, sort } = req.query;
      const parts = ['d.is_deleted = 0'];
      const args = [];
      if (category) { parts.push('d.category_id = ?'); args.push(category); }
      if (q) {
        parts.push('(d.title LIKE ? OR d.content_structured LIKE ?)');
        args.push(`%${q}%`, `%${q}%`);
      }
      const where = `WHERE ${parts.join(' AND ')}`;
      const order = sort === 'title' ? 'd.title ASC'
        : sort === 'created' ? 'd.created_at DESC'
        : 'd.updated_at DESC';
      const r = await db.execute({
        sql: `SELECT d.id, d.title, d.language, d.created_at, d.updated_at,
                     d.created_by, d.updated_by,
                     c.id AS category_id, c.name AS category_name
              FROM kb_documents d
              LEFT JOIN kb_categories c ON c.id = d.category_id
              ${where}
              ORDER BY ${order}
              LIMIT 500`,
        args,
      });
      res.json(r.rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to list documents', details: err.message });
    }
  });

  router.post('/documents', async (req, res) => {
    try {
      const { title, category, is_new_category, content_raw, content_structured, language } = req.body || {};
      if (!title?.trim() || !content_structured?.trim()) {
        return res.status(400).json({ error: 'title and content_structured are required' });
      }
      let categoryId = null;
      if (category?.trim()) {
        categoryId = is_new_category
          ? await ensureCategory(db, category.trim())
          : (await db.execute({
              sql: 'SELECT id FROM kb_categories WHERE name = ? COLLATE NOCASE LIMIT 1',
              args: [category.trim()],
            })).rows[0]?.id || await ensureCategory(db, category.trim());
      }
      const id = ulid();
      const user = currentUser(req);
      await db.execute({
        sql: `INSERT INTO kb_documents
              (id, title, category_id, content_raw, content_structured, language, created_by, updated_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, title.trim(), categoryId, content_raw || '', content_structured, language === 'he' ? 'he' : 'en', user, user],
      });
      // Initial version record
      await db.execute({
        sql: `INSERT INTO kb_document_versions
              (id, document_id, content_structured, title, edited_by, change_summary)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [ulid(), id, content_structured, title.trim(), user, 'Initial version'],
      });
      res.status(201).json({ id });
    } catch (err) {
      console.error('kb create failed:', err);
      res.status(500).json({ error: 'Failed to create document', details: err.message });
    }
  });

  router.get('/documents/:id', async (req, res) => {
    try {
      const doc = await getDocumentWithImages(db, req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      res.json(doc);
    } catch (err) {
      res.status(500).json({ error: 'Failed to load document', details: err.message });
    }
  });

  router.put('/documents/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { title, category, is_new_category, content_structured, language } = req.body || {};
      const existing = await db.execute({
        sql: 'SELECT * FROM kb_documents WHERE id = ? AND is_deleted = 0',
        args: [id],
      });
      const current = existing.rows[0];
      if (!current) return res.status(404).json({ error: 'Document not found' });

      const nextTitle = title?.trim() || current.title;
      const nextContent = content_structured ?? current.content_structured;
      const nextLang = language === 'he' || language === 'en' ? language : current.language;

      let categoryId = current.category_id;
      if (category !== undefined) {
        if (!category || !category.trim()) {
          categoryId = null;
        } else if (is_new_category) {
          categoryId = await ensureCategory(db, category.trim());
        } else {
          const catRow = await db.execute({
            sql: 'SELECT id FROM kb_categories WHERE name = ? COLLATE NOCASE LIMIT 1',
            args: [category.trim()],
          });
          categoryId = catRow.rows[0]?.id || await ensureCategory(db, category.trim());
        }
      }

      const user = currentUser(req);
      await db.execute({
        sql: `UPDATE kb_documents
              SET title = ?, category_id = ?, content_structured = ?, language = ?,
                  updated_by = ?, updated_at = datetime('now')
              WHERE id = ?`,
        args: [nextTitle, categoryId, nextContent, nextLang, user, id],
      });

      // Generate change summary if content actually changed
      let changeSummary = null;
      if (nextContent !== current.content_structured) {
        try {
          changeSummary = await summarizeChanges({
            oldContent: current.content_structured,
            newContent: nextContent,
            apiKey: process.env.ANTHROPIC_API_KEY,
          });
        } catch (err) {
          console.error('kb summarize failed:', err.message);
          changeSummary = 'Content edited';
        }
      } else if (nextTitle !== current.title) {
        changeSummary = `Renamed to "${nextTitle}"`;
      }

      if (changeSummary) {
        await db.execute({
          sql: `INSERT INTO kb_document_versions
                (id, document_id, content_structured, title, edited_by, change_summary)
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [ulid(), id, nextContent, nextTitle, user, changeSummary],
        });
      }

      res.json({ ok: true, change_summary: changeSummary });
    } catch (err) {
      console.error('kb update failed:', err);
      res.status(500).json({ error: 'Failed to update document', details: err.message });
    }
  });

  router.delete('/documents/:id', async (req, res) => {
    try {
      await db.execute({
        sql: 'UPDATE kb_documents SET is_deleted = 1, updated_at = datetime(\'now\') WHERE id = ?',
        args: [req.params.id],
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete document', details: err.message });
    }
  });

  // ── Versions ────────────────────────────────────────────────────────────
  router.get('/documents/:id/versions', async (req, res) => {
    try {
      const r = await db.execute({
        sql: `SELECT id, document_id, title, content_structured, edited_by, edited_at, change_summary
              FROM kb_document_versions
              WHERE document_id = ?
              ORDER BY edited_at DESC`,
        args: [req.params.id],
      });
      res.json(r.rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to load versions', details: err.message });
    }
  });

  router.post('/documents/:id/versions/:versionId/restore', async (req, res) => {
    try {
      const { id, versionId } = req.params;
      const vResult = await db.execute({
        sql: 'SELECT * FROM kb_document_versions WHERE id = ? AND document_id = ?',
        args: [versionId, id],
      });
      const v = vResult.rows[0];
      if (!v) return res.status(404).json({ error: 'Version not found' });

      const user = currentUser(req);
      await db.execute({
        sql: `UPDATE kb_documents
              SET title = ?, content_structured = ?, updated_by = ?, updated_at = datetime('now')
              WHERE id = ?`,
        args: [v.title, v.content_structured, user, id],
      });
      await db.execute({
        sql: `INSERT INTO kb_document_versions
              (id, document_id, content_structured, title, edited_by, change_summary)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [ulid(), id, v.content_structured, v.title, user, `Restored version from ${v.edited_at}`],
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to restore version', details: err.message });
    }
  });

  // ── Images ──────────────────────────────────────────────────────────────
  router.post('/documents/:id/images', (req, res) => {
    uploadImage(req, res, async (uploadErr) => {
      if (uploadErr) return res.status(400).json({ error: 'Upload failed', details: uploadErr.message });
      try {
        const { id } = req.params;
        const existing = await db.execute({
          sql: 'SELECT id FROM kb_documents WHERE id = ? AND is_deleted = 0',
          args: [id],
        });
        if (!existing.rows[0]) return res.status(404).json({ error: 'Document not found' });

        const files = req.files || [];
        if (files.length === 0) return res.status(400).json({ error: 'No images uploaded' });

        const uploaded = [];
        for (const f of files) {
          const imageId = ulid();
          const publicId = `kb/${id}/${imageId}`;
          const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { public_id: publicId, resource_type: 'image', overwrite: true },
              (err, result) => err ? reject(err) : resolve(result),
            );
            stream.end(f.buffer);
          });
          const marker = `[image:${f.originalname}]`;
          await db.execute({
            sql: `INSERT INTO kb_document_images
                  (id, document_id, cloudinary_public_id, secure_url, original_filename, position_marker)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [imageId, id, result.public_id, result.secure_url, f.originalname, marker],
          });
          uploaded.push({
            id: imageId,
            secure_url: result.secure_url,
            original_filename: f.originalname,
            position_marker: marker,
          });
        }
        res.json({ ok: true, images: uploaded });
      } catch (err) {
        console.error('kb image upload failed:', err);
        res.status(500).json({ error: 'Image upload failed', details: err.message });
      }
    });
  });

  router.delete('/images/:id', async (req, res) => {
    try {
      const r = await db.execute({
        sql: 'SELECT cloudinary_public_id FROM kb_document_images WHERE id = ?',
        args: [req.params.id],
      });
      const img = r.rows[0];
      if (!img) return res.status(404).json({ error: 'Image not found' });
      try { await cloudinary.uploader.destroy(img.cloudinary_public_id); } catch (e) { /* best effort */ }
      await db.execute({ sql: 'DELETE FROM kb_document_images WHERE id = ?', args: [req.params.id] });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete image', details: err.message });
    }
  });

  // ── Export ──────────────────────────────────────────────────────────────
  router.get('/documents/:id/export/md', async (req, res) => {
    try {
      const doc = await getDocumentWithImages(db, req.params.id);
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      const frontmatter = [
        '---',
        `title: ${JSON.stringify(doc.title)}`,
        `category: ${JSON.stringify(doc.category_name || '')}`,
        `language: ${doc.language}`,
        `created_at: ${doc.created_at}`,
        `updated_at: ${doc.updated_at}`,
        `created_by: ${doc.created_by}`,
        `updated_by: ${doc.updated_by}`,
        '---',
        '',
      ].join('\n');
      const safeName = (doc.title || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'document';
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.md"`);
      res.send(frontmatter + doc.content_structured);
    } catch (err) {
      res.status(500).json({ error: 'Export failed', details: err.message });
    }
  });

  // ── Search (convenience alias) ──────────────────────────────────────────
  router.get('/search', async (req, res) => {
    try {
      const { q } = req.query;
      if (!q) return res.json([]);
      const r = await db.execute({
        sql: `SELECT d.id, d.title, d.updated_at, c.name AS category_name
              FROM kb_documents d
              LEFT JOIN kb_categories c ON c.id = d.category_id
              WHERE d.is_deleted = 0 AND (d.title LIKE ? OR d.content_structured LIKE ?)
              ORDER BY d.updated_at DESC
              LIMIT 50`,
        args: [`%${q}%`, `%${q}%`],
      });
      res.json(r.rows);
    } catch (err) {
      res.status(500).json({ error: 'Search failed', details: err.message });
    }
  });

  return router;
}

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import { ulid } from 'ulid';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { generateProposal } from './services/pdf-proposal.js';
import { generateContract } from './services/pdf-contract.js';
import { buildProposalDocx } from './services/docx-proposal.js';
import { buildContractDocx } from './services/docx-contract.js';
import { sanitizeFilename, formatDate } from './services/pdf-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, 'package-config.json');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

function uploadPdf(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: 'raw',
        format: 'pdf',
        overwrite: true,
        use_filename: false,
      },
      (err, result) => err ? reject(err) : resolve({ secure_url: result.secure_url, public_id: result.public_id }),
    );
    stream.end(buffer);
  });
}

function signedDownloadUrl(publicId, filename) {
  // Generates a short-lived signed download URL that bypasses the
  // "restricted PDF/ZIP" Cloudinary security default.
  return cloudinary.utils.private_download_url(publicId, 'pdf', {
    resource_type: 'raw',
    type: 'upload',
    attachment: filename,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  });
}

export function createProposalsRouter(db) {
  const router = Router();

  // GET /config — package config for UI display
  router.get('/config', (req, res) => {
    try {
      res.json(loadConfig());
    } catch (err) {
      res.status(500).json({ error: 'Failed to load config', details: err.message });
    }
  });

  // GET / — list history (optionally by client_id)
  router.get('/', async (req, res) => {
    try {
      const { client_id } = req.query;
      const sql = client_id
        ? 'SELECT * FROM proposals WHERE client_id = ? ORDER BY created_at DESC'
        : 'SELECT * FROM proposals ORDER BY created_at DESC LIMIT 500';
      const args = client_id ? [client_id] : [];
      const r = await db.execute({ sql, args });
      res.json(r.rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to list proposals', details: err.message });
    }
  });

  // GET /:id — single record
  router.get('/:id', async (req, res) => {
    try {
      const r = await db.execute({
        sql: 'SELECT * FROM proposals WHERE id = ?',
        args: [req.params.id],
      });
      if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
      res.json(r.rows[0]);
    } catch (err) {
      res.status(500).json({ error: 'Failed to load proposal', details: err.message });
    }
  });

  // POST /generate — create proposal + contract PDFs and save record
  router.post('/generate', async (req, res) => {
    try {
      const { business_name, client_name, email, phone, niche, notes, client_id } = req.body || {};
      if (!business_name || !client_name || !email) {
        return res.status(400).json({ error: 'business_name, client_name, email required' });
      }

      const config = loadConfig();
      const client = { business_name, client_name, email, phone, niche, notes };
      const safeName = sanitizeFilename(business_name) || 'client';
      const dateStr = formatDate(new Date());
      const id = ulid();

      const [proposalBuffer, contractBuffer] = await Promise.all([
        generateProposal(config, client),
        generateContract(config, client),
      ]);

      const [proposalUpload, contractUpload] = await Promise.all([
        uploadPdf(proposalBuffer, `vo360-proposals/${id}/${safeName}_Proposal_${dateStr}`),
        uploadPdf(contractBuffer, `vo360-proposals/${id}/${safeName}_Contract_${dateStr}`),
      ]);

      const createdBy = req.session?.username || 'unknown';
      const proposalDownload = `/api/proposals/${id}/proposal.pdf`;
      const contractDownload = `/api/proposals/${id}/contract.pdf`;

      await db.execute({
        sql: `INSERT INTO proposals
              (id, client_id, client_name, business_name, email, phone, niche, notes,
               package_name, package_price, proposal_url, contract_url,
               proposal_public_id, contract_public_id, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          client_id ? Number(client_id) : null,
          client_name,
          business_name,
          email,
          phone || null,
          niche || null,
          notes || null,
          config.package.name,
          Number(config.package.price) || 0,
          proposalDownload,
          contractDownload,
          proposalUpload.public_id,
          contractUpload.public_id,
          createdBy,
        ],
      });

      res.status(201).json({
        id,
        proposal_url: proposalDownload,
        contract_url: contractDownload,
        package_name: config.package.name,
        package_price: config.package.price,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('proposal generate failed:', err);
      res.status(500).json({ error: 'Failed to generate proposal', details: err.message });
    }
  });

  // GET /:id/proposal.pdf | /:id/contract.pdf — auth-protected redirect to signed Cloudinary URL
  async function redirectSigned(req, res, kind) {
    try {
      const { id } = req.params;
      const r = await db.execute({
        sql: `SELECT business_name, proposal_public_id, contract_public_id FROM proposals WHERE id = ?`,
        args: [id],
      });
      const row = r.rows[0];
      if (!row) return res.status(404).json({ error: 'Not found' });
      const publicId = kind === 'contract' ? row.contract_public_id : row.proposal_public_id;
      if (!publicId) return res.status(410).json({ error: 'PDF missing (regenerate proposal)' });
      const safeName = sanitizeFilename(row.business_name) || 'client';
      const kindLabel = kind === 'contract' ? 'Contract' : 'Proposal';
      const filename = `${safeName}_${kindLabel}.pdf`;
      const url = signedDownloadUrl(publicId, filename);
      res.redirect(302, url);
    } catch (err) {
      console.error('pdf proxy failed:', err);
      res.status(500).json({ error: 'Download failed', details: err.message });
    }
  }
  router.get('/:id/proposal.pdf', (req, res) => redirectSigned(req, res, 'proposal'));
  router.get('/:id/contract.pdf', (req, res) => redirectSigned(req, res, 'contract'));

  // GET /template — DOCX editable templates as a zip
  router.get('/template/download', async (req, res) => {
    try {
      const config = loadConfig();
      const proposalDoc = buildProposalDocx(config);
      const contractDoc = buildContractDocx(config);

      const [proposalBuffer, contractBuffer] = await Promise.all([
        Packer.toBuffer(proposalDoc),
        Packer.toBuffer(contractDoc),
      ]);

      const zip = new JSZip();
      zip.file('VO360_Proposal_Template.docx', proposalBuffer);
      zip.file('VO360_Contract_Template.docx', contractBuffer);

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="VO360_Templates.zip"');
      res.send(zipBuffer);
    } catch (err) {
      console.error('template failed:', err);
      res.status(500).json({ error: 'Failed to generate templates', details: err.message });
    }
  });

  // DELETE /:id — remove record (doesn't remove Cloudinary files — keep audit trail)
  router.delete('/:id', async (req, res) => {
    try {
      await db.execute({ sql: 'DELETE FROM proposals WHERE id = ?', args: [req.params.id] });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Delete failed', details: err.message });
    }
  });

  return router;
}

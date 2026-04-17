/**
 * Brand analyzer — extracts palette from the client's logo and asks Claude to
 * derive brand personality, mood, industry visual cues, and recommended surface
 * style. Output powers the "skin" layer of the Style-Transfer System so every
 * image generated for a client feels native to that brand.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ColorThief = require('colorthief');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function colorThiefToHex(entry) {
  // colorthief v3 returns { _r, _g, _b, population, proportion } objects
  if (Array.isArray(entry) && entry.length >= 3) return rgbToHex(entry[0], entry[1], entry[2]);
  if (entry && typeof entry === 'object') return rgbToHex(entry._r ?? entry.r, entry._g ?? entry.g, entry._b ?? entry.b);
  return '#000000';
}

/**
 * Extract a 5-color palette from a logo file. Returns array of hex strings.
 * The first color is the dominant color; the rest are ordered roughly by
 * frequency inside the image.
 */
export async function extractPalette(logoSource) {
  // Accept either an absolute filesystem path OR an http(s) URL.
  let input = logoSource;
  if (typeof logoSource === 'string' && /^https?:\/\//i.test(logoSource)) {
    const resp = await fetch(logoSource);
    if (!resp.ok) throw new Error(`Fetch logo failed: HTTP ${resp.status}`);
    input = Buffer.from(await resp.arrayBuffer());
  }
  // Normalize through sharp to a PNG buffer so colorthief handles any
  // input format (jpg/png/webp/svg/heic-converted) consistently. Sharp also
  // flattens transparency, which matters because logos often have alpha.
  const png = await sharp(input)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize({ width: 512, fit: 'inside' })
    .png()
    .toBuffer();

  const tmpPath = path.join('/tmp', `palette-${Date.now()}.png`);
  const { writeFileSync, unlinkSync } = await import('fs');
  writeFileSync(tmpPath, png);
  try {
    const palette = await ColorThief.getPalette(tmpPath, 6);
    // Sort by proportion (most-used first) when that field is available
    const sorted = Array.isArray(palette)
      ? [...palette].sort((a, b) => (b?.proportion ?? 0) - (a?.proportion ?? 0))
      : [];
    return sorted.map(colorThiefToHex);
  } finally {
    try { unlinkSync(tmpPath); } catch {}
  }
}

/**
 * Ask Claude to synthesize brand direction from the client profile + palette.
 * Returns a structured object.
 */
export async function inferBrandDirection({ client, palette, apiKey }) {
  if (!apiKey) throw new Error('inferBrandDirection: ANTHROPIC_API_KEY is required');

  const anthropic = new Anthropic({ apiKey });

  const services = (() => {
    try { return JSON.parse(client.services || '[]').filter(Boolean); }
    catch { return []; }
  })();

  const prompt = `You are a senior brand strategist + visual designer. Your job is to read a company profile and an extracted logo palette, then return structured guidance so an AI image generator can create on-brand campaign visuals.

You will apply the "Style-Transfer System" principle: **keep a fixed premium visual skeleton (interface-driven, cinematic, depth-rich, luxury SaaS finish), and vary only the skin (palette, personality, surface mood, industry cues).**

Return ONLY valid JSON matching this schema — no prose, no markdown fences:
{
  "palette": {
    "primary": "#RRGGBB",
    "secondary": "#RRGGBB",
    "accent": "#RRGGBB",
    "neutral": "#RRGGBB",
    "background": "#RRGGBB"
  },
  "personality": "one of: luxury | bold | clinical | warm | minimalist | playful | elite | earthy | technical | trustworthy",
  "mood_description": "one short sentence capturing the emotional temperature (e.g. 'bold and trust-building with cinematic depth')",
  "industry_cues": ["6 to 10 short visual props/metaphors native to this industry"],
  "recommended_surface_style": "one concise phrase describing the skin — e.g. 'dark cinematic with brand-orange glow', 'clean clinical white with soft blue accents', 'earthy warm-stone with bronze highlights'"
}

## Company profile
- **Name:** ${client.name}
- **Industry:** ${client.industry || 'unspecified'}
- **Website:** ${client.website || 'none'}
- **Description:** ${client.brand_description || 'none provided'}
- **Target audience:** ${client.target_audience || 'none'}
- **Services:** ${services.length ? services.join(', ') : 'none listed'}
${client.city || client.state ? `- **Location:** ${[client.city, client.state].filter(Boolean).join(', ')}` : ''}

## Extracted logo palette (ordered by dominance)
${palette.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Rules
- Pick palette.primary from the most visually usable dominant color (avoid near-black/near-white unless the logo is strictly monochrome).
- secondary + accent should create enough contrast to light up UI panels and glowing trails in a dark composition.
- neutral = a muted mid-tone useful for card backgrounds.
- background = deep base for cinematic low-key scenes (usually a very dark navy/charcoal tuned toward the brand, NOT pure black unless the brand is black-and-gold luxury).
- If the logo is grayscale or ambiguous, infer palette from the industry + description.
- industry_cues should be concrete visual objects/metaphors (e.g. "electrical panels", "breaker box", "EV charger", "code-compliance stamp"), NOT abstract words.
- personality + surface_style must stay consistent with the industry. A healthcare brand should lean clinical/trustworthy, not bold/playful.

Return the JSON now.`;

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = res.content?.[0]?.text || '';
  // Strip accidental code fences just in case
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (err) {
    throw new Error(`Claude returned invalid JSON: ${err.message}\nRaw: ${text.slice(0, 400)}`);
  }
  return parsed;
}

/**
 * High-level: given a client record, run palette extraction + Claude analysis
 * and return the merged brand-direction object ready to be persisted.
 */
export async function analyzeBrand(client, { apiKey } = {}) {
  if (!client?.logo_path) {
    throw new Error('Client has no logo_path — upload a logo before analyzing brand.');
  }
  const logoSource = /^https?:\/\//i.test(client.logo_path)
    ? client.logo_path
    : path.resolve(PROJECT_ROOT, client.logo_path);
  const palette = await extractPalette(logoSource);
  const direction = await inferBrandDirection({ client, palette, apiKey });
  return { extracted_palette: palette, ...direction };
}

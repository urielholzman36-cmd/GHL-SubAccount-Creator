import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-4-7';
const MAX_CHARS = 2000;
const CREATIVE_BUDGET = 1200;

export const PRESETS = {
  services_detail: {
    label: 'Services Detail',
    sections: 'Hero (headline + subhead), Problem/Solution (2-3 lines), Benefits (3-5 bullets), Process (3-5 steps), Trust Block (badges/guarantees), CTA',
  },
  pricing: {
    label: 'Pricing',
    sections: 'Hero, Tier Cards (3 tiers unless notes say otherwise — name, price, 4-6 feature bullets per tier), Feature Comparison snippet, FAQ snippet (3 Qs), CTA',
  },
  about: {
    label: 'About',
    sections: 'Origin Story (3-4 lines), Mission (1 line), Values (3-5 bullets), Team/Credentials (1 line), CTA',
  },
  testimonials: {
    label: 'Testimonials',
    sections: 'Hero, Review Cards (5-8 industry-relevant quotes with name/role), Stats/Proof bar, CTA',
  },
  service_areas: {
    label: 'Service Areas',
    sections: 'Hero, City List (from service areas), Local Trust Signals (licensing, response time), Map/Coverage note, CTA',
  },
  landing: {
    label: 'Landing / Lead Magnet',
    sections: 'Single Hero with offer, 3 Benefit bullets, Social Proof (1 line), Single CTA',
  },
  blog: {
    label: 'Blog / Articles Index',
    sections: 'Hero (blog purpose + topic mix), Featured Post block, Post Grid (6-9 cards — title, excerpt, date, category, read-more), Category Filter strip, Newsletter CTA',
  },
  case_studies: {
    label: 'Case Studies / Portfolio',
    sections: 'Hero, Project Grid (6-9 projects — title, industry/service, short outcome line, before/after thumb), Featured Case Study (problem → solution → outcome, 3 metrics), CTA',
  },
  gallery: {
    label: 'Gallery',
    sections: 'Hero (what the gallery shows), Category Filter tabs, Masonry/Grid layout (12-18 image slots with short captions), Lightbox behavior note, CTA',
  },
  free_text: {
    label: 'Free Text',
    sections: 'Pick the structure entirely from the user notes. No template — use only the user notes to decide sections.',
  },
};

function parseJsonSafe(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function paletteLine(brand) {
  const p = parseJsonSafe(brand.brand_palette_json, null) || parseJsonSafe(brand.brand_colors_json, null);
  if (p && !Array.isArray(p)) {
    const { primary, secondary, accent, neutral, background } = p;
    const parts = [];
    if (primary) parts.push(`primary ${primary}`);
    if (secondary) parts.push(`secondary ${secondary}`);
    if (accent) parts.push(`accent ${accent}`);
    if (neutral) parts.push(`neutral ${neutral}`);
    if (background) parts.push(`background ${background}`);
    return parts.join(', ');
  }
  if (Array.isArray(p) && p.length) return p.join(', ');
  return 'pick industry-appropriate hex codes';
}

export function buildDeterministicBlock(brand) {
  const cues = parseJsonSafe(brand.industry_cues_json, []);
  const cuesLine = Array.isArray(cues) && cues.length ? cues.slice(0, 4).join(', ') : '';
  const lines = [
    `Company: ${brand.name || 'Unknown'} — ${brand.industry || ''}`.trim(),
    `Palette: ${paletteLine(brand)}`,
    brand.brand_personality && `Personality: ${brand.brand_personality}`,
    brand.brand_mood_description && `Mood: ${brand.brand_mood_description}`,
    brand.recommended_surface_style && `Surface style: ${brand.recommended_surface_style}`,
    cuesLine && `Industry cues: ${cuesLine}`,
    brand.service_areas && `Service areas: ${brand.service_areas}`,
    (brand.primary_cta || brand.secondary_cta) && `CTAs: ${[brand.primary_cta, brand.secondary_cta].filter(Boolean).join(' / ')}`,
  ].filter(Boolean);
  return 'BRAND CONTEXT:\n' + lines.map((l) => `- ${l}`).join('\n');
}

function header(page_type, page_name, page_slug) {
  return [
    `PAGE TYPE: ${PRESETS[page_type]?.label || page_type}`,
    `PAGE NAME: ${page_name}`,
    page_slug && `TARGET URL SLUG: ${page_slug}`,
  ].filter(Boolean).join('\n');
}

const MUST_HAVES = `MUST-HAVES:
- Match existing site's header/footer/nav
- Use palette roles consistently
- Mobile-first responsive
- CTA placement top + mid + bottom`;

export function enforceCharCap({ header: h, brandBlock, creative, mustHaves }, cap = MAX_CHARS) {
  const join = (parts) => parts.filter(Boolean).join('\n\n');
  let out = join([h, brandBlock, creative, mustHaves]);
  if (out.length <= cap) return out;

  // 1. Drop MUST-HAVES
  out = join([h, brandBlock, creative]);
  if (out.length <= cap) return out;

  // 2. Trim creative (keep the first N chars)
  const overhead = join([h, brandBlock]).length + 2;
  const room = Math.max(0, cap - overhead);
  const trimmed = creative.slice(0, room);
  return join([h, brandBlock, trimmed]);
}

export function assemblePagePrompt({ page_type, page_name, page_slug, brand, creativeSections }) {
  return enforceCharCap({
    header: header(page_type, page_name, page_slug),
    brandBlock: buildDeterministicBlock(brand),
    creative: creativeSections,
    mustHaves: MUST_HAVES,
  });
}

export async function generatePagePrompt({
  page_type, page_name, page_slug, user_notes,
  brand, tenweb_site_prompt,
}) {
  const preset = PRESETS[page_type] || PRESETS.custom;

  const systemPrompt = `You write compact page prompts for 10Web's "add a page" AI builder.
Rules:
- Output ONLY the creative sections listed below (no preamble, no trailing chatter).
- Use bullet points and short phrases, not prose.
- Honor the provided brand palette hex codes, personality, mood, and surface style verbatim.
- Do not invent facts about the company.
- Your creative sections must total ≤ ${CREATIVE_BUDGET} characters.`;

  const userMessage = [
    buildDeterministicBlock(brand),
    tenweb_site_prompt ? `\nORIGINAL SITE PROMPT (for tone reference):\n${tenweb_site_prompt.slice(0, 800)}` : '',
    `\nPage type: ${preset.label}`,
    `Page name: ${page_name}`,
    page_slug && `Target slug: ${page_slug}`,
    user_notes && `User notes: ${user_notes}`,
    `\nWrite these creative sections (bullets/phrases, not prose):\n${preset.sections}`,
    `\nAlso include a TONE line (one sentence synthesising personality + mood)`,
    `and a DESIGN NOTES line (palette roles + surface style + industry cues translated to layout hints).`,
    `\nTotal creative output must be ≤ ${CREATIVE_BUDGET} chars.`,
  ].filter(Boolean).join('\n');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const creative = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

  const final = assemblePagePrompt({
    page_type, page_name, page_slug, brand,
    creativeSections: creative,
  });

  return {
    prompt: final,
    brand_snapshot: {
      palette: parseJsonSafe(brand.brand_palette_json, null) || parseJsonSafe(brand.brand_colors_json, null),
      personality: brand.brand_personality,
      mood: brand.brand_mood_description,
      surface_style: brand.recommended_surface_style,
      industry_cues: parseJsonSafe(brand.industry_cues_json, null),
      service_areas: brand.service_areas,
    },
  };
}

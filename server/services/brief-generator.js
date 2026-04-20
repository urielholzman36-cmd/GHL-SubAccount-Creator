/**
 * Mode A — Company Master Brief generator.
 *
 * Produces exactly ONE document per client in the new hybrid format:
 *   [ClientName]_company_master_brief.md
 *
 * Cover block + 4 "ABOUT THE X" groups + 13 numbered sections + 2 tables
 * (Objections · Palette). Every field not sourced from the client record is
 * suffixed [inferred]. Palette rows must come from the extracted palette —
 * never invented hex codes.
 *
 * See docs/superpowers/specs/2026-04-20-brief-format-redesign.md
 */

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

function parseList(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return v.filter(Boolean);
  } catch {}
  return String(raw).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

function parsePalette(raw) {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return { array: v };
    if (v && typeof v === 'object') return v;
  } catch {}
  return null;
}

export function clientFilenameSlug(name) {
  return String(name || 'client')
    .trim()
    .replace(/[^\w\s.-]/g, '')
    .replace(/[\s.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function briefFilename(clientName) {
  return `${clientFilenameSlug(clientName)}_company_master_brief.md`;
}

export function briefDocxFilename(clientName) {
  return `${clientFilenameSlug(clientName)}_company_master_brief.docx`;
}

function monthYearLabel(date = new Date()) {
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${names[date.getMonth()]} ${date.getFullYear()}`;
}

export function buildBriefPrompt(client, { now = new Date() } = {}) {
  const services = parseList(client.services);
  const industryCues = parseList(client.industry_cues_json);
  const palette = parsePalette(client.brand_colors_json) || parsePalette(client.brand_palette_json);

  const paletteBlock = palette
    ? (palette.array
        ? palette.array.map((c, i) => `Color ${i + 1}: ${c}`).join('\n')
        : Object.entries(palette).map(([k, v]) => `${k}: ${v}`).join('\n'))
    : '(no palette extracted — mark all palette rows [inferred] and extract from brand/logo description)';

  const rawInput = `
Business Name: ${client.name || ''}
Industry: ${client.industry || ''}
Website: ${client.website || ''}
Location: ${[client.city, client.state].filter(Boolean).join(', ') || client.location || ''}
Address: ${client.address || ''}
Contact: ${client.contact_name || ''}${client.email ? ` · ${client.email}` : ''}${client.phone ? ` · ${client.phone}` : ''}
Brand Tone (raw): ${client.brand_tone || ''}
Brand Description: ${client.brand_description || ''}
Target Audience: ${client.target_audience || ''}
Services (raw): ${services.length ? services.join(', ') : ''}

Auto-analysis of logo + profile (if run):
- Palette (logo-derived, AI-mapped):
${paletteBlock}
- Personality: ${client.brand_personality || ''}
- Mood: ${client.brand_mood_description || ''}
- Surface style: ${client.recommended_surface_style || ''}
- Industry visual cues: ${industryCues.length ? industryCues.join(', ') : ''}
`.trim();

  const system = `You are supporting a lean monthly social content production system shared with Manus.

Your role right now is Mode A — **New Client Onboarding**. You will produce exactly ONE Markdown document:

  ${briefFilename(client.name)}

Do NOT split the company into multiple files. Build ONE decision-ready master brief that Manus can use without reconstructing the business from scattered notes.

## Cover block (first lines, exactly this shape)

# ${client.name}
## CLIENT BRIEF MASTER
> "{tagline if known, else [inferred] short positioning line in quotes}"
Internal Strategic Document · Version 1.0 · ${monthYearLabel(now)} · CONFIDENTIAL

---

## Required structure — 4 "ABOUT THE X" groups with 13 numbered sections

Use Markdown H2 headings for each "ABOUT THE X" group and H3 headings for each numbered section.

## ABOUT THE BUSINESS

### 1. Company Overview
Labeled fields: **Name**, **Industry**, **Business Type**, **Founded**, **Location**, **Website**, **Phone**, **Address**.

### 2. Mission & Value Proposition
2-3 paragraphs: mission + core value prop.

### 3. Services & Offerings
Bullet list. Each item: "Service Name — short description".

### 4. Competitive Positioning
- **Unique Selling Proposition:** one paragraph
- **Key Competitors:** comma-separated, 3-5 names
- **Key Differentiators:** bullet list

## ABOUT THE AUDIENCE

### 5. Target Audience
Labeled fields: **Primary Segment**, **Special Focus**, **Demographics**, **Pain Points**, **Decision Maker**, **Tech Comfort**.

### 6. Common Objections & Concerns
A Markdown table with this exact header row:

| Objection | Response Strategy |
|---|---|

3-5 rows.

## ABOUT THE BRAND

### 7. Brand Identity & Tone of Voice
Labeled fields: **Brand Personality**, **Tone of Voice**, **Communication Style**, **Visual Feel**, **What We Avoid**.

### 8. Visual Palette
A Markdown table with this exact header row:

| Color Name | Hex Code | Usage |
|---|---|---|

Rows must come from the provided palette. Never invent hex codes. If no palette was extracted, mark every row [inferred] and derive from the brand description.

### 9. Typography & Style Rules
- **Headings:** font name
- **Body Text:** font name
- **Brand Messaging DO:** bullet list
- **Brand Messaging DON'T:** bullet list

## ABOUT THE MARKETING

### 10. Digital Presence & Platforms
Labeled fields: **Primary Platforms**, **Secondary Platforms**, **Content Frequency**, **Content Strategy**, **Previous Efforts**.

### 11. Business Goals
Labeled fields: **Primary Goal**, **Content Target**, **Growth Strategy**, **Success Metrics**.

### 12. Content Production Workflow
Short paragraph describing the Claude Cowork (strategy) → Manus AI (execution) pipeline. Same standard language every client:

  Claude Cowork (Strategic Layer): Strategy, messaging, tone, content plans, visual prompts, Monthly Strategy Packs.
  Manus AI (Execution Layer): Task breakdown, file organization, platform adaptation, QA, asset production, Execution Packs.

### 13. Additional Notes
Any client-specific notes, caveats, or inferred assumptions to flag for Manus.

## Summary
3-5 bullet lines at the very end:
- What was created
- What was inferred vs. sourced
- How Manus should use this document next

## CRITICAL rules

- Any field NOT directly sourced from the client record must be suffixed **[inferred]** (e.g., \`Founded: 2018 [inferred]\`).
- Palette rows must match the provided hex codes exactly. NEVER invent new hex codes.
- Never copy another client's visual skin, tone, or tagline. Keep this brief brand-specific.
- Output ONLY clean Markdown. No code fences around the output. No preamble.
- Keep it lean. A solo operator should use it without overhead.
- Write in English.`;

  const user = `Client record provided below. Produce the complete ${briefFilename(client.name)} now.

---
${rawInput}
---`;

  return { system, user };
}

export async function generateClientBrief(client, { apiKey, now } = {}) {
  if (!apiKey) throw new Error('generateClientBrief: ANTHROPIC_API_KEY required');
  const { system, user } = buildBriefPrompt(client, { now });
  const anthropic = new Anthropic({ apiKey });

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
    messages: [{ role: 'user', content: user }],
  });

  let text = res.content?.[0]?.text || '';
  text = text.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/i, '').trim();
  return text;
}

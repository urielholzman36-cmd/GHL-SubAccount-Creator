/**
 * Mode B — End-of-Month Recap / Memory generator.
 *
 * Per the two-document model, this produces exactly ONE document per month per
 * client:
 *   [ClientName]_monthly_recap_[YYYY_MM].md
 *
 * 9 required sections. Written for continuity — so Manus knows what has been
 * used, what worked, and what to avoid repeating next month. Uses the current
 * month's delivered posts AS WELL AS every prior-month recap for the client, so
 * the memory is cumulative.
 */

import Anthropic from '@anthropic-ai/sdk';
import { clientFilenameSlug } from './brief-generator.js';

function safe(s, max = 600) {
  if (s == null) return '';
  const str = String(s).replace(/\s+/g, ' ').trim();
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function monthSlug(monthRaw) {
  if (!monthRaw) return 'unknown';
  // "2026-05" → "2026_05"; "May 2026" → "2026_05" best-effort
  const m = String(monthRaw).match(/(\d{4})[^\d]?(\d{1,2})/);
  if (m) return `${m[1]}_${m[2].padStart(2, '0')}`;
  return String(monthRaw).replace(/[^a-z0-9]+/gi, '_').toLowerCase();
}

export function recapFilename(clientName, monthRaw) {
  return `${clientFilenameSlug(clientName)}_monthly_recap_${monthSlug(monthRaw)}.md`;
}

function summarizePostsForClaude(posts) {
  if (!posts || posts.length === 0) return '(no posts delivered)';
  return posts.map((p) => {
    const parts = [
      `Day ${p.day_number}`,
      p.post_type,
      p.pillar ? `pillar:${p.pillar}` : '',
      p.concept ? `concept: ${safe(p.concept, 140)}` : '',
      p.caption ? `caption: ${safe(p.caption, 400)}` : '',
      p.hashtags ? `hashtags: ${safe(p.hashtags, 160)}` : '',
      p.cta ? `cta: ${safe(p.cta, 120)}` : '',
      p.slide_count ? `slides:${p.slide_count}` : '',
    ].filter(Boolean);
    return `- ${parts.join(' · ')}`;
  }).join('\n');
}

function summarizePriorRecaps(priorCampaigns) {
  if (!priorCampaigns || priorCampaigns.length === 0) return '(no prior-month recaps on record — this is the client\'s first recap)';
  return priorCampaigns
    .filter((c) => c.monthly_recap)
    .map((c) => `### Prior month: ${c.month || '?'}\n\n${c.monthly_recap}`)
    .join('\n\n---\n\n');
}

export async function generateMonthlyRecap({
  client,
  campaign,
  posts,
  priorCampaigns,
  apiKey,
  recapSeed,
}) {
  if (!apiKey) throw new Error('generateMonthlyRecap: ANTHROPIC_API_KEY required');
  if (!client || !campaign) throw new Error('generateMonthlyRecap: client + campaign required');

  const anthropic = new Anthropic({ apiKey });

  const monthLabel = campaign.month || '(unspecified)';
  const postBlock = summarizePostsForClaude(posts);
  const priorBlock = summarizePriorRecaps(priorCampaigns);

  const systemPrompt = `You are supporting a lean monthly social content production system shared with Manus.

Your role right now is Mode B — **End-of-Month Recap / Memory**. You will produce exactly ONE document:

  ${recapFilename(client.name, monthLabel)}

This recap is rolling memory. The goal is to help Manus plan the NEXT month without repeating itself. You will be given BOTH the current month's delivery AND every prior-month recap for this client. Use all of them to decide what is overused, what is fresh, and where the next month should go.

## Required structure (9 sections, in this order, using Markdown H2 headings)

1. Month Summary — the month completed, what was produced, overall focus.
2. Post Mix Used — post types that appeared (single / carousel / before_after / comparison / CTA / quote / infographic / checklist / stats card / founder-style / etc.).
3. Angles and Themes Covered — strategic angles, problem frames, solution frames, proof types, narratives already used.
4. Hooks and CTA Patterns Used — opening structures, hook styles, CTA phrasings, repeated copy mechanisms.
5. Visual Patterns Used — visual motifs, layout tendencies, recurring compositions, metaphors, palette usage, format families that showed up.
6. Approved or Strong Directions — what clearly worked and is safe to build from again. (If unclear because approvals weren't recorded, say so.)
7. Repetition Risks and What to Avoid Next Month — overused themes, hooks, visuals, CTA framings, structures. Reference prior-month recaps when they reinforce a risk.
8. Opportunities for Next Month — promising untested angles, format gaps, narratives worth trying next.
9. Operational Notes — anything practical (naming, cadence, client preferences, approval workflow observations) that would help the next cycle.

## Quality standard

- Write for continuity, not presentation.
- Distinguish what happened frequently vs. what happened only once.
- Be concrete enough to shape next month's planning — no vague platitudes.
- If the delivered month is incomplete, say so explicitly.
- When prior-month recaps exist, CROSS-REFERENCE them. A theme that appeared last month AND this month is a much bigger repetition risk than one that appeared only this month.

## Closing summary

After the 9 sections, add a final short "## Summary" note (3–5 bullet lines): what was captured, what was uncertain, how Manus should use this document to plan the next month.

## Global rules

- English, clean Markdown.
- Single H1 title at the top: "# ${client.name} — Monthly Recap (${monthLabel})"
- No code fences around the output. Output pure Markdown ready to save as the .md file.`;

  const seedBlock = recapSeed
    ? `## Manus seed notes for this month\n\nManus included these continuity notes alongside the delivery. Treat them as raw production observations — extract, do not quote verbatim. Fold them into the 9 sections where they belong, and cross-check them against the actual delivered posts.\n\n---\n${recapSeed}\n---`
    : '(no seed notes supplied with the delivery)';

  const userPrompt = `## Current month delivered (${monthLabel})

${postBlock}

${seedBlock}

## Prior-month recaps for ${client.name} (cumulative memory)

${priorBlock}

Produce the complete ${recapFilename(client.name, monthLabel)} now.`;

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  let text = res.content?.[0]?.text || '';
  text = text.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/i, '').trim();
  return text;
}

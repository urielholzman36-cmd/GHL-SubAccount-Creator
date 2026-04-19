import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';

function monthLabel(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${names[m - 1]} ${y}`;
}

export function buildNarrativePrompt({ clientName, industry, data }) {
  const sourcesLine = (data.lead_sources || [])
    .map((s) => `${s.source}: ${s.count} (${s.pct}%)`)
    .join(', ') || 'no sources';

  const system = `You are writing a monthly performance report for a VO360 agency client.

VOICE:
- Positive, confident, client-facing — you are presenting wins.
- Avoid hedging words ("may", "perhaps", "somewhat").
- Every paragraph should feel like progress.
- Use the client's name occasionally, but don't over-use it.
- Never mention raw database terms ("lead objects", "deal records") — use business English.

CONSTRAINTS:
- exec_summary: 150-200 words, 2-3 short paragraphs, plain prose (no markdown).
- recommendations: 3-4 one-sentence actionable bullets, each under 200 chars.
- Reference specific numbers from the data — don't generalize.
- Output ONLY valid JSON: {"exec_summary": "...", "recommendations": ["...", "..."]}.`;

  const user = `Client: ${clientName}
Industry: ${industry || 'N/A'}
Report month: ${monthLabel(data.month)}

DATA SNAPSHOT:
- Leads this month: ${data.leads_count}${data.leads_mom_pct !== null && data.leads_mom_pct !== undefined ? ` (${data.leads_mom_pct >= 0 ? '+' : ''}${data.leads_mom_pct}% vs last month)` : ''}
- Top sources: ${sourcesLine}
- Appointments booked: ${data.appointments_booked}
- Show rate: ${data.show_rate_pct}%
- Converted to customer: ${data.converted_rate_pct}%

Write the narrative now.`;

  return { system, user };
}

function extractNumbers(str) {
  return new Set(
    (String(str).match(/-?\d+(?:\.\d+)?/g) || []).map((n) => Number(n)),
  );
}

function allowedNumbers(data) {
  const out = new Set();
  const add = (n) => { if (n !== null && n !== undefined && !Number.isNaN(Number(n))) out.add(Number(n)); };
  add(data.leads_count);
  add(data.leads_mom_pct);
  add(data.prior_leads_count);
  add(data.appointments_booked);
  add(data.appointments_showed);
  add(data.show_rate_pct);
  add(data.converted_count);
  add(data.converted_rate_pct);
  for (const s of (data.lead_sources || [])) {
    add(s.count);
    add(s.pct);
  }
  // Tolerate small integers for paragraph counts etc.
  for (let i = 0; i <= 3; i++) out.add(i);
  const [y] = String(data.month || '').split('-');
  if (y) out.add(Number(y));
  return out;
}

export function validateNarrativeFidelity(narrative, data) {
  if (!narrative || typeof narrative !== 'object') {
    return { valid: false, reason: 'narrative not an object' };
  }
  if (typeof narrative.exec_summary !== 'string' || !narrative.exec_summary.trim()) {
    return { valid: false, reason: 'exec_summary missing' };
  }
  // Check number fidelity first so invented-number errors are always surfaced
  const allowed = allowedNumbers(data);
  const used = extractNumbers(narrative.exec_summary);
  const invented = [...used].filter((n) => !allowed.has(n));
  if (invented.length) {
    return { valid: false, reason: `exec_summary uses numbers not in data: ${invented.join(', ')}` };
  }
  if (!Array.isArray(narrative.recommendations)) {
    return { valid: false, reason: 'recommendations not an array' };
  }
  if (narrative.recommendations.length < 3 || narrative.recommendations.length > 4) {
    return { valid: false, reason: `recommendations count ${narrative.recommendations.length} (want 3-4)` };
  }
  for (const rec of narrative.recommendations) {
    if (typeof rec !== 'string' || rec.length === 0 || rec.length > 200) {
      return { valid: false, reason: `recommendation length invalid: "${rec}"` };
    }
  }
  return { valid: true };
}

function parseNarrativeResponse(text) {
  try { return JSON.parse(text); } catch {}
  const match = String(text).match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

export async function generateNarrative({ clientName, industry, data }) {
  const { system, user } = buildNarrativePrompt({ clientName, industry, data });
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  async function callOnce(extraInstruction = '') {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: system + extraInstruction,
      messages: [{ role: 'user', content: user }],
    });
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return parseNarrativeResponse(text);
  }

  let narrative = await callOnce();
  let check = validateNarrativeFidelity(narrative, data);
  if (!check.valid) {
    narrative = await callOnce(`\n\nPREVIOUS ATTEMPT FAILED: ${check.reason}. Use ONLY the numbers from the DATA SNAPSHOT and output strict JSON.`);
    check = validateNarrativeFidelity(narrative, data);
  }
  if (!check.valid) {
    // Final fallback: deterministic minimal narrative so the UI never blocks.
    narrative = {
      exec_summary: `This month, ${clientName} booked ${data.appointments_booked} appointments with a ${data.show_rate_pct}% show rate and ${data.converted_rate_pct}% conversion. Total leads: ${data.leads_count}.`,
      recommendations: [
        `Double down on your top-performing lead source.`,
        `Test a same-day appointment incentive to lift the show rate.`,
        `Review your follow-up cadence for un-converted leads.`,
      ],
    };
  }
  return narrative;
}

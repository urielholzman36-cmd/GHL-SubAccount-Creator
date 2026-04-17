import Anthropic from '@anthropic-ai/sdk';
import { getStructurerPrompt, CHANGE_SUMMARY_PROMPT } from './prompts.js';

const MODEL = 'claude-sonnet-4-20250514';

export async function structureDocument({ rawText, existingCategories, apiKey }) {
  if (!apiKey) throw new Error('structureDocument: ANTHROPIC_API_KEY required');
  const anthropic = new Anthropic({ apiKey });

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: getStructurerPrompt(existingCategories),
    messages: [{ role: 'user', content: rawText }],
  });

  const text = (res.content?.[0]?.text || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  const parsed = JSON.parse(cleaned);
  return {
    suggested_title: String(parsed.suggested_title || '').slice(0, 200),
    suggested_category: String(parsed.suggested_category || ''),
    is_new_category: !!parsed.is_new_category,
    language: parsed.language === 'he' ? 'he' : 'en',
    structured_content: String(parsed.structured_content || ''),
    screenshot_suggestions: Array.isArray(parsed.screenshot_suggestions)
      ? parsed.screenshot_suggestions.map(String)
      : [],
  };
}

export async function summarizeChanges({ oldContent, newContent, apiKey }) {
  if (!apiKey) throw new Error('summarizeChanges: ANTHROPIC_API_KEY required');
  const anthropic = new Anthropic({ apiKey });

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    system: CHANGE_SUMMARY_PROMPT,
    messages: [
      { role: 'user', content: `OLD VERSION:\n${oldContent}\n\nNEW VERSION:\n${newContent}` },
    ],
  });

  return (res.content?.[0]?.text || '').trim();
}

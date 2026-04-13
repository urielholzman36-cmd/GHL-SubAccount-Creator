import Anthropic from '@anthropic-ai/sdk';
import { withRetry } from './retry.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Convert "2026-04" → "April 2026"
 */
function formatMonth(month) {
  const [year, m] = month.split('-');
  const date = new Date(Number(year), Number(m) - 1);
  const name = date.toLocaleString('en-US', { month: 'long' });
  return `${name} ${year}`;
}

/**
 * Build a text prompt for Claude web search.
 */
export function buildResearchPrompt(client, month, theme) {
  const services = Array.isArray(client.services)
    ? client.services.join(', ')
    : JSON.parse(client.services || '[]').join(', ');

  const monthLabel = formatMonth(month);

  return [
    `Research the following for a social media content plan:`,
    ``,
    `Business Industry: ${client.industry}`,
    `Location: ${client.location}`,
    `Target Audience: ${client.target_audience}`,
    `Services: ${services}`,
    `Month: ${monthLabel}`,
    `Theme: ${theme}`,
    ``,
    `Please provide insights on:`,
    `1. Industry Trends`,
    `2. Seasonal Relevance`,
    `3. Competitor Landscape`,
    `4. Content Angles`,
    `5. Hashtag Trends`,
  ].join('\n');
}

/**
 * Call Claude API with web_search tool, or return fixture in DRY_RUN mode.
 */
export async function runWebResearch(client, month, theme) {
  if (process.env.DRY_RUN === 'true') {
    try {
      const fixturePath = join(__dirname, '..', '..', 'test', 'fixtures', 'sample-research.json');
      const raw = await readFile(fixturePath, 'utf-8');
      const data = JSON.parse(raw);
      return data.research;
    } catch {
      return 'Placeholder research content for dry-run mode.';
    }
  }

  const anthropic = new Anthropic();
  const prompt = buildResearchPrompt(client, month, theme);

  const response = await withRetry(
    () => anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
    { label: 'Research (Claude)' }
  );

  const textBlocks = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text);

  return textBlocks.join('\n\n');
}

/**
 * Merge web search research with optional Manus AI research.
 */
export function mergeResearch(webResearch, manusResearch) {
  if (!manusResearch) {
    return webResearch;
  }

  return `## Industry Research\n\n${webResearch}\n\n---\n\n## Social Trend Research (Manus AI)\n\n${manusResearch}`;
}

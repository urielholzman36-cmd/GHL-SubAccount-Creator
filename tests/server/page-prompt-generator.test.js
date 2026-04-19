import { describe, it, expect, vi } from 'vitest';
import { buildDeterministicBlock, assemblePagePrompt, enforceCharCap, PRESETS } from '../../server/services/page-prompt-generator.js';

describe('page prompt generator — deterministic pieces', () => {
  const brand = {
    name: 'Restoration Pro NW',
    industry: 'Water damage restoration',
    brand_palette_json: JSON.stringify({
      primary: '#0A2540', secondary: '#06B6D4', accent: '#F97316',
      neutral: '#E5E7EB', background: '#0B1220',
    }),
    brand_personality: 'Trustworthy, calm, emergency-ready',
    brand_mood_description: 'Reassuring emergency-response',
    recommended_surface_style: 'clean geometric cards',
    industry_cues_json: JSON.stringify(['water droplet', 'shield icon', 'truck']),
    service_areas: 'Mukilteo, Everett, Seattle',
    primary_cta: 'Get Help Now',
    secondary_cta: 'Call 425-595-4500',
  };

  it('builds a compact deterministic brand block under 600 chars', () => {
    const block = buildDeterministicBlock(brand);
    expect(block.length).toBeLessThan(600);
    expect(block).toContain('#0A2540');
    expect(block).toContain('#06B6D4');
    expect(block).toContain('#F97316');
    expect(block).toContain('clean geometric cards');
    expect(block).toContain('Mukilteo');
  });

  it('exposes the 7 expected presets', () => {
    expect(Object.keys(PRESETS).sort()).toEqual([
      'about', 'custom', 'landing', 'pricing',
      'service_areas', 'services_detail', 'testimonials',
    ]);
  });

  it('assembles a full prompt under 2000 chars', () => {
    const prompt = assemblePagePrompt({
      page_type: 'pricing',
      page_name: 'Pricing',
      page_slug: '/pricing',
      brand,
      creativeSections: 'HERO: "Fair pricing, no surprises"\nTIERS: Basic / Pro / Elite ...',
    });
    expect(prompt.length).toBeLessThanOrEqual(2000);
    expect(prompt).toContain('PAGE TYPE: Pricing');
  });

  it('trims overflowing prompts in priority order', () => {
    const longCreative = 'x'.repeat(3000);
    const prompt = assemblePagePrompt({
      page_type: 'pricing',
      page_name: 'Pricing',
      page_slug: '/pricing',
      brand,
      creativeSections: longCreative,
    });
    expect(prompt.length).toBeLessThanOrEqual(2000);
    expect(prompt).toContain('PAGE TYPE: Pricing');
    expect(prompt).toContain('#0A2540');
  });

  it('enforceCharCap trims MUST-HAVES first, brand context last', () => {
    const oversized = {
      header: 'PAGE TYPE: X\nPAGE NAME: Y\n',
      brandBlock: 'BRAND: palette #111\n',
      creative: 'NARRATIVE: ' + 'n'.repeat(200),
      mustHaves: 'MUST-HAVES:\n- ' + 'm'.repeat(2000),
    };
    const out = enforceCharCap(oversized, 500);
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out).toContain('BRAND:');
    expect(out).toContain('NARRATIVE:');
  });
});

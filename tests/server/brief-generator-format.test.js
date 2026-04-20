import { describe, it, expect } from 'vitest';
import { buildBriefPrompt, briefFilename, clientFilenameSlug } from '../../server/services/brief-generator.js';

describe('briefFilename + clientFilenameSlug', () => {
  it('slugifies names', () => {
    expect(clientFilenameSlug('Lyrie.ai')).toBe('Lyrie_ai');
    expect(clientFilenameSlug('HSP - San Diego')).toBe('HSP_San_Diego');
    expect(briefFilename('Restoration Pro NW')).toBe('Restoration_Pro_NW_company_master_brief.md');
  });
});

describe('buildBriefPrompt', () => {
  const client = {
    name: 'Restoration Pro NW',
    industry: 'Water damage restoration',
    website: 'https://restorationprosnw.com',
    city: 'Mukilteo',
    state: 'WA',
    phone: '425-595-4500',
    email: 'info@restorationprosnw.com',
    brand_personality: 'Trustworthy, calm, emergency-ready',
    brand_mood_description: 'Reassuring emergency-response',
    recommended_surface_style: 'clean geometric cards',
    brand_colors_json: JSON.stringify({ primary: '#0A2540', secondary: '#06B6D4', accent: '#F97316' }),
    industry_cues_json: JSON.stringify(['water droplet', 'shield icon']),
    services: JSON.stringify(['Water Damage Restoration', 'Fire Damage', 'Mold Remediation']),
  };

  it('returns {system, user} strings', () => {
    const { system, user } = buildBriefPrompt(client);
    expect(typeof system).toBe('string');
    expect(typeof user).toBe('string');
  });

  it('system prompt enumerates the 4 ABOUT THE X groups and 13 numbered sections', () => {
    const { system } = buildBriefPrompt(client);
    expect(system).toMatch(/ABOUT THE BUSINESS/);
    expect(system).toMatch(/ABOUT THE AUDIENCE/);
    expect(system).toMatch(/ABOUT THE BRAND/);
    expect(system).toMatch(/ABOUT THE MARKETING/);
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]) {
      expect(system).toContain(`${n}.`);
    }
  });

  it('system prompt mandates the [inferred] tag for non-sourced fields', () => {
    const { system } = buildBriefPrompt(client);
    expect(system).toMatch(/\[inferred\]/);
  });

  it('system prompt requires markdown tables for Objections and Palette', () => {
    const { system } = buildBriefPrompt(client);
    expect(system).toMatch(/Objection.*Response Strategy/is);
    expect(system).toMatch(/Color Name.*Hex Code.*Usage/is);
  });

  it('system prompt requires cover block with CONFIDENTIAL + Version 1.0', () => {
    const { system } = buildBriefPrompt(client);
    expect(system).toMatch(/CLIENT BRIEF MASTER/);
    expect(system).toMatch(/Version 1\.0/);
    expect(system).toMatch(/CONFIDENTIAL/);
  });

  it('user prompt includes the client name, industry, and palette hex codes', () => {
    const { user } = buildBriefPrompt(client);
    expect(user).toContain('Restoration Pro NW');
    expect(user).toContain('Water damage restoration');
    expect(user).toContain('#0A2540');
    expect(user).toContain('#06B6D4');
  });
});

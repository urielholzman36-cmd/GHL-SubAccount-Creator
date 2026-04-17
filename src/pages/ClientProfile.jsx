import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CollapsibleSection from '../components/CollapsibleSection';

const DEFAULT_PILLARS = ['PAIN', 'SOLUTION', 'AUTHORITY', 'PROOF', 'CTA'];
const PLATFORM_OPTIONS = ['facebook', 'instagram', 'linkedin', 'tiktok'];

export default function ClientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [form, setForm] = useState({
    name: '',
    industry: '',
    location: '',
    website: '',
    contact_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
    timezone: 'America/New_York',
    brand_tone: '',
    brand_description: '',
    target_audience: '',
    services: '',
    content_pillars: [...DEFAULT_PILLARS],
    hashtag_bank: '',
    cta_style: '',
    platforms: [],
    logo: null,
    cloudinary_folder: '',
    watermark_position: 'bottom-right',
    watermark_opacity: 0.5,
    uses_manus: false,
    posting_time: '09:00',
    location_id: '',
    ghl_api_key: '',
    has_ghl_api_key: false,
    logo_path: '',
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    if (isNew) return;
    fetch(`/api/clients/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const c = data.client || data;
        setForm((prev) => ({
          ...prev,
          name: c.name || '',
          industry: c.industry || '',
          location: c.location || '',
          website: c.website || '',
          brand_tone: c.brand_tone || '',
          brand_description: c.brand_description || '',
          target_audience: c.target_audience || '',
          services: Array.isArray(c.services) ? c.services.join('\n') : c.services || '',
          content_pillars: Array.isArray(c.content_pillars) && c.content_pillars.length
            ? c.content_pillars
            : [...DEFAULT_PILLARS],
          hashtag_bank: Array.isArray(c.hashtag_bank) ? c.hashtag_bank.join(' ') : c.hashtag_bank || '',
          cta_style: c.cta_style || '',
          platforms: Array.isArray(c.platforms) ? c.platforms : tryParse(c.platforms, []),
          cloudinary_folder: c.cloudinary_folder || '',
          watermark_position: c.watermark_position || 'bottom-right',
          watermark_opacity: c.watermark_opacity ?? 0.5,
          uses_manus: !!c.uses_manus,
          posting_time: c.posting_time || '09:00',
          location_id: c.location_id || '',
          ghl_api_key: '',
          has_ghl_api_key: !!c.has_ghl_api_key,
          contact_name: c.contact_name || '',
          email: c.email || '',
          phone: c.phone || '',
          address: c.address || '',
          city: c.city || '',
          state: c.state || '',
          zip: c.zip || '',
          country: c.country || 'US',
          timezone: c.timezone || 'America/New_York',
          logo_path: c.logo_path || '',
        }));
        // Load prior brand analysis if it exists
        if (c.brand_colors_json || c.brand_personality) {
          let palette = null;
          try { palette = JSON.parse(c.brand_colors_json); } catch {}
          let cues = [];
          try { cues = JSON.parse(c.industry_cues_json || '[]'); } catch {}
          setAnalysis({
            palette,
            personality: c.brand_personality,
            mood_description: c.brand_mood_description,
            industry_cues: cues,
            recommended_surface_style: c.recommended_surface_style,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, isNew]);

  async function handleAnalyzeBrand() {
    if (!id || isNew) {
      alert('Save the client first (with a logo uploaded) before analyzing the brand.');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/clients/${id}/analyze-brand`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(`Brand analysis failed: ${data.details || data.error || res.status}`);
        return;
      }
      setAnalysis(data.analysis);
    } catch (err) {
      alert(`Brand analysis failed: ${err?.message || 'network error'}`);
    } finally {
      setAnalyzing(false);
    }
  }

  function tryParse(val, fallback) {
    if (!val) return fallback;
    try { return JSON.parse(val); } catch { return fallback; }
  }

  function set(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function togglePlatform(p) {
    setForm((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter((x) => x !== p)
        : [...prev.platforms, p],
    }));
  }

  function setPillar(idx, val) {
    setForm((prev) => {
      const pillars = [...prev.content_pillars];
      pillars[idx] = val;
      return { ...prev, content_pillars: pillars };
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);

    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('industry', form.industry);
    fd.append('location', form.location);
    fd.append('website', form.website);
    fd.append('brand_tone', form.brand_tone);
    fd.append('brand_description', form.brand_description);
    fd.append('target_audience', form.target_audience);
    fd.append('services', JSON.stringify(form.services.split('\n').map((s) => s.trim()).filter(Boolean)));
    fd.append('content_pillars', JSON.stringify(form.content_pillars.filter(Boolean)));
    fd.append('hashtag_bank', JSON.stringify(form.hashtag_bank.split(/\s+/).filter(Boolean)));
    fd.append('cta_style', form.cta_style);
    fd.append('platforms', JSON.stringify(form.platforms));
    fd.append('cloudinary_folder', form.cloudinary_folder);
    fd.append('watermark_position', form.watermark_position);
    fd.append('watermark_opacity', String(form.watermark_opacity));
    fd.append('uses_manus', form.uses_manus ? '1' : '0');
    fd.append('posting_time', form.posting_time);
    if (form.location_id) fd.append('location_id', form.location_id.trim());
    if (form.ghl_api_key && form.ghl_api_key.trim()) {
      fd.append('ghl_api_key', form.ghl_api_key.trim());
    }
    fd.append('contact_name', form.contact_name || '');
    fd.append('email', form.email || '');
    fd.append('phone', form.phone || '');
    fd.append('address', form.address || '');
    fd.append('city', form.city || '');
    fd.append('state', form.state || '');
    fd.append('zip', form.zip || '');
    fd.append('country', form.country || 'US');
    fd.append('timezone', form.timezone || 'America/New_York');
    if (form.logo instanceof File) fd.append('logo', form.logo);

    try {
      const url = isNew ? '/api/clients' : `/api/clients/${id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, { method, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.details || data.error || `Save failed (HTTP ${res.status})`;
        alert(`Save failed: ${msg}`);
        return;
      }
      const newId = data.id || data.client?.id || id;
      if (isNew) {
        navigate(`/social/client/${newId}/campaigns`);
      } else {
        navigate(`/clients/${newId}`);
      }
    } catch (err) {
      alert(`Failed to save client: ${err?.message || 'network error'}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 pl-16 text-white/50">Loading client...</div>;

  const labelClass = 'block text-sm text-white/60 mb-1';
  const inputClass =
    'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-purple-500/50 transition-colors';

  return (
    <div className="p-8 pl-16 text-white min-h-screen max-w-4xl">
      {/* Back button + title */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white/60"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold">{isNew ? 'New Client' : 'Edit Client'}</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Business Info */}
        <CollapsibleSection title="Business Info" defaultOpen={true}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Name *</label>
              <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} required placeholder="Business name" />
            </div>
            <div>
              <label className={labelClass}>Industry</label>
              <input className={inputClass} value={form.industry} onChange={(e) => set('industry', e.target.value)} placeholder="e.g. Real Estate" />
            </div>
            <div>
              <label className={labelClass}>Website</label>
              <input className={inputClass} value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <label className={labelClass}>Timezone</label>
              <input className={inputClass} value={form.timezone} onChange={(e) => set('timezone', e.target.value)} placeholder="America/Los_Angeles" />
            </div>
          </div>
        </CollapsibleSection>

        {/* Contact + Address */}
        <CollapsibleSection title="Contact & Address">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Contact Name</label>
              <input className={inputClass} value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="Primary contact" />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input type="email" className={inputClass} value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@company.com" />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input className={inputClass} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(555) 555-5555" />
            </div>
            <div>
              <label className={labelClass}>Street Address</label>
              <input className={inputClass} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="123 Main St" />
            </div>
            <div>
              <label className={labelClass}>City</label>
              <input className={inputClass} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="San Diego" />
            </div>
            <div>
              <label className={labelClass}>State</label>
              <input className={inputClass} value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="CA" />
            </div>
            <div>
              <label className={labelClass}>ZIP</label>
              <input className={inputClass} value={form.zip} onChange={(e) => set('zip', e.target.value)} placeholder="92101" />
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <input className={inputClass} value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="US" />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Location (free-form, optional)</label>
              <input className={inputClass} value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="City, State — shown next to the client name" />
            </div>
          </div>
        </CollapsibleSection>

        {/* Brand Identity */}
        <CollapsibleSection title="Brand Identity">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Brand Tone</label>
              <input className={inputClass} value={form.brand_tone} onChange={(e) => set('brand_tone', e.target.value)} placeholder="e.g. Professional yet approachable" />
            </div>
            <div>
              <label className={labelClass}>Target Audience</label>
              <input className={inputClass} value={form.target_audience} onChange={(e) => set('target_audience', e.target.value)} placeholder="e.g. First-time homebuyers" />
            </div>
          </div>
          <div className="mt-4">
            <label className={labelClass}>Brand Description</label>
            <textarea className={inputClass + ' h-24 resize-none'} value={form.brand_description} onChange={(e) => set('brand_description', e.target.value)} placeholder="Describe the brand..." />
          </div>
          <div className="mt-4">
            <label className={labelClass}>Services (one per line)</label>
            <textarea className={inputClass + ' h-24 resize-none'} value={form.services} onChange={(e) => set('services', e.target.value)} placeholder="Service 1&#10;Service 2" />
          </div>

          {/* Auto-Analyze Brand — palette from logo + AI personality & industry cues */}
          <div className="mt-6 p-4 rounded-xl bg-white/[0.03] border border-white/10">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-semibold text-white">Auto-Analyze Brand</p>
                <p className="text-xs text-white/40 mt-0.5">Extracts palette from the logo + uses Claude to infer personality, mood, and industry visual cues. Drives every image generated for this client.</p>
              </div>
              <button
                type="button"
                onClick={handleAnalyzeBrand}
                disabled={analyzing || isNew || !form.logo_path}
                title={isNew ? 'Save the client first' : (!form.logo_path ? 'Upload a logo first' : 'Run AI brand analysis')}
                className="shrink-0 px-4 py-2 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {analyzing ? 'Analyzing…' : analysis ? 'Re-analyze' : 'Analyze Brand'}
              </button>
            </div>

            {analysis && (
              <div className="space-y-3 pt-3 border-t border-white/5">
                {analysis.palette && (
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Palette</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(analysis.palette).map(([role, hex]) => (
                        <div key={role} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                          <span className="w-5 h-5 rounded" style={{ backgroundColor: hex }} />
                          <span className="text-xs text-white/70 font-mono">{hex}</span>
                          <span className="text-xs text-white/30">{role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {analysis.personality && (
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs text-white/40 uppercase tracking-wider">Personality</span>
                    <span className="text-sm text-white">{analysis.personality}</span>
                    {analysis.mood_description && (
                      <span className="text-xs text-white/50 italic">— {analysis.mood_description}</span>
                    )}
                  </div>
                )}
                {analysis.recommended_surface_style && (
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs text-white/40 uppercase tracking-wider">Surface Style</span>
                    <span className="text-sm text-white/80">{analysis.recommended_surface_style}</span>
                  </div>
                )}
                {analysis.industry_cues?.length > 0 && (
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Industry Cues</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.industry_cues.map((cue, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-xs text-white/70">
                          {cue}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Content Strategy moved to each campaign's Step 1 — each post batch has its own plan */}

        {/* Image Settings */}
        <CollapsibleSection title="Image Settings">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Logo</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif,image/heic,image/heif"
                onChange={(e) => set('logo', e.target.files[0] || null)}
                className="text-sm text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-white/10 file:text-white/70 hover:file:bg-white/20"
              />
              {form.logo instanceof File && (
                <p className="mt-1 text-xs text-[#2dd4bf]">✓ {form.logo.name} ({Math.round(form.logo.size / 1024)} KB) — will upload on save</p>
              )}
              {!form.logo && form.logo_path && !isNew && (
                <div className="mt-2 flex items-center gap-3">
                  <img src={`/${form.logo_path}`} alt="Current logo" className="w-10 h-10 rounded-lg object-cover bg-white/5" />
                  <span className="text-xs text-white/40">Current logo — pick a new file to replace</span>
                </div>
              )}
              <p className="mt-1 text-xs text-white/30">PNG, JPEG, WEBP, GIF, SVG, AVIF, HEIC · max 10 MB</p>
            </div>
            <div>
              <label className={labelClass}>Cloudinary Folder</label>
              <input className={inputClass} value={form.cloudinary_folder} onChange={(e) => set('cloudinary_folder', e.target.value)} placeholder="folder/path" />
            </div>
            <div>
              <label className={labelClass}>Watermark Position</label>
              <select
                className={inputClass}
                value={form.watermark_position}
                onChange={(e) => set('watermark_position', e.target.value)}
              >
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="top-right">Top Right</option>
                <option value="top-left">Top Left</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Watermark Opacity: {form.watermark_opacity}</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={form.watermark_opacity}
                onChange={(e) => set('watermark_opacity', parseFloat(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* GHL Connection (for Health Monitor) */}
        <CollapsibleSection title="GHL Connection (optional)">
          <div className="space-y-4">
            <p className="text-white/40 text-xs leading-relaxed">
              Connect this client's GoHighLevel sub-account so the Health Monitor can read real
              activity (contacts, conversations, opportunities, appointments).
              Create a Private Integration Token inside the sub-account:
              <span className="text-white/60"> GHL → Settings → Private Integrations → Create new integration</span>.
              Grant read scopes for contacts, conversations, opportunities, and calendars.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>GHL Location ID</label>
                <input
                  className={inputClass + ' font-mono'}
                  value={form.location_id}
                  onChange={(e) => set('location_id', e.target.value)}
                  placeholder="e.g. ve9EPM428h8vShlRW1KT"
                />
              </div>
              <div>
                <label className={labelClass}>
                  Location API Key
                  {form.has_ghl_api_key ? <span className="text-[#2dd4bf] ml-2">· already set</span> : null}
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  className={inputClass + ' font-mono'}
                  value={form.ghl_api_key}
                  onChange={(e) => set('ghl_api_key', e.target.value)}
                  placeholder={form.has_ghl_api_key ? 'Leave blank to keep current key' : 'Paste Private Integration Token'}
                />
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Advanced */}
        <CollapsibleSection title="Advanced">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 text-sm text-white/70 cursor-pointer">
              <input
                type="checkbox"
                checked={form.uses_manus}
                onChange={(e) => set('uses_manus', e.target.checked)}
                className="rounded bg-white/10 border-white/20 text-purple-500 focus:ring-purple-500/30"
              />
              Uses Manus (external content research)
            </label>
            <div>
              <label className={labelClass}>Posting Time</label>
              <input
                type="time"
                className={inputClass}
                value={form.posting_time}
                onChange={(e) => set('posting_time', e.target.value)}
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* Actions */}
        <div className="flex gap-3 pb-8">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Saving...' : isNew ? 'Create Client' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white/60 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

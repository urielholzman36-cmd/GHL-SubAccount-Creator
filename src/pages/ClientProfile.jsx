import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

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
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

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
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, isNew]);

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
    if (form.logo instanceof File) fd.append('logo', form.logo);

    try {
      const url = isNew ? '/api/clients' : `/api/clients/${id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, { method, body: fd });
      const data = await res.json();
      const newId = data.id || data.client?.id || id;
      navigate(`/social/client/${newId}/campaigns`);
    } catch {
      alert('Failed to save client');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 pl-16 text-white/50">Loading client...</div>;

  const cardClass = 'bg-white/5 border border-white/10 backdrop-blur-sm rounded-xl p-6 space-y-4';
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
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-white/80">Business Info</h2>
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
              <label className={labelClass}>Location</label>
              <input className={inputClass} value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="City, State" />
            </div>
            <div>
              <label className={labelClass}>Website</label>
              <input className={inputClass} value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://..." />
            </div>
          </div>
        </div>

        {/* Brand Identity */}
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-white/80">Brand Identity</h2>
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
          <div>
            <label className={labelClass}>Brand Description</label>
            <textarea className={inputClass + ' h-24 resize-none'} value={form.brand_description} onChange={(e) => set('brand_description', e.target.value)} placeholder="Describe the brand..." />
          </div>
          <div>
            <label className={labelClass}>Services (one per line)</label>
            <textarea className={inputClass + ' h-24 resize-none'} value={form.services} onChange={(e) => set('services', e.target.value)} placeholder="Service 1&#10;Service 2" />
          </div>
        </div>

        {/* Content Strategy */}
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-white/80">Content Strategy</h2>
          <div>
            <label className={labelClass}>Content Pillars</label>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              {form.content_pillars.map((pillar, i) => (
                <input
                  key={i}
                  className={inputClass}
                  value={pillar}
                  onChange={(e) => setPillar(i, e.target.value)}
                  placeholder={`Pillar ${i + 1}`}
                />
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass}>Hashtag Bank (space-separated)</label>
            <textarea className={inputClass + ' h-20 resize-none'} value={form.hashtag_bank} onChange={(e) => set('hashtag_bank', e.target.value)} placeholder="#hashtag1 #hashtag2" />
          </div>
          <div>
            <label className={labelClass}>CTA Style</label>
            <input className={inputClass} value={form.cta_style} onChange={(e) => set('cta_style', e.target.value)} placeholder="e.g. DM us to learn more" />
          </div>
          <div>
            <label className={labelClass}>Platforms</label>
            <div className="flex flex-wrap gap-3 mt-1">
              {PLATFORM_OPTIONS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.platforms.includes(p)}
                    onChange={() => togglePlatform(p)}
                    className="rounded bg-white/10 border-white/20 text-purple-500 focus:ring-purple-500/30"
                  />
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Image Settings */}
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-white/80">Image Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Logo</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => set('logo', e.target.files[0] || null)}
                className="text-sm text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-white/10 file:text-white/70 hover:file:bg-white/20"
              />
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
        </div>

        {/* Advanced */}
        <div className={cardClass}>
          <h2 className="text-lg font-semibold text-white/80">Advanced</h2>
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
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-8">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
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

import { useState, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const FIELD_GROUPS = [
  {
    title: 'Basics',
    fields: [
      { key: 'name', label: 'Business name', required: true },
      { key: 'industry', label: 'Industry' },
      { key: 'website', label: 'Website' },
      { key: 'timezone', label: 'Timezone' },
      { key: 'cloudinary_folder', label: 'Cloudinary folder (slug)' },
    ],
  },
  {
    title: 'Contact',
    fields: [
      { key: 'contact_name', label: 'Primary contact' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'address', label: 'Address' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'zip', label: 'Zip' },
      { key: 'country', label: 'Country' },
      { key: 'location', label: 'Display location' },
    ],
  },
  {
    title: 'Brand',
    fields: [
      { key: 'brand_tone', label: 'Brand tone', textarea: true, rows: 2 },
      { key: 'target_audience', label: 'Target audience', textarea: true, rows: 2 },
      { key: 'brand_description', label: 'Brand description', textarea: true, rows: 4 },
      { key: 'services', label: 'Services (one per line)', textarea: true, rows: 6 },
      { key: 'cta_style', label: 'CTA style', textarea: true, rows: 2 },
      { key: 'content_pillars', label: 'Content pillars (JSON array)' },
      { key: 'hashtag_bank', label: 'Hashtag bank (JSON array)' },
    ],
  },
];

export default function ImportClientResearch() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null); // { extracted, logo, research_markdown, file_counts }
  const [form, setForm] = useState({});
  const [saveResearchAsKb, setSaveResearchAsKb] = useState(true);

  function onDragOver(e) { e.preventDefault(); e.stopPropagation(); }
  function onDrop(e) {
    e.preventDefault(); e.stopPropagation();
    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
  }
  function onPick(e) {
    setFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
  }
  function removeFile(i) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleExtract() {
    if (files.length === 0) return;
    setExtracting(true);
    setError(null);
    setData(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const res = await fetch('/api/clients/import-research/extract', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.details || body.error || `HTTP ${res.status}`);
      setData(body);
      setForm({ ...(body.extracted || {}) });
    } catch (err) {
      setError(err.message);
    } finally {
      setExtracting(false);
    }
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!form.name?.trim()) { setError('Business name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      // 1) Create client as multipart with logo
      const fd = new FormData();
      for (const key of Object.keys(form)) {
        const v = form[key];
        if (v == null || v === '') continue;
        fd.append(key, typeof v === 'string' ? v : JSON.stringify(v));
      }
      if (data?.logo) {
        const bytes = Uint8Array.from(atob(data.logo.data_base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: data.logo.mime });
        fd.append('logo', blob, data.logo.filename);
      }

      const res = await fetch('/api/clients', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.details || body.error || `HTTP ${res.status}`);
      const clientId = body.id;

      // 2) Optionally save the research as a KB document
      if (saveResearchAsKb && data?.research_markdown) {
        try {
          await fetch('/api/kb/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: `${form.name} — Manus Research`,
              category: 'Client Onboarding',
              is_new_category: false,
              content_raw: data.research_markdown,
              content_structured: data.research_markdown,
              language: /[\u0590-\u05FF]/.test(data.research_markdown) ? 'he' : 'en',
            }),
          });
        } catch (err) {
          console.error('KB save failed (non-blocking):', err);
        }
      }

      navigate(`/social/client/${clientId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const logoSrc = useMemo(() => {
    if (!data?.logo) return null;
    return `data:${data.logo.mime};base64,${data.logo.data_base64}`;
  }, [data?.logo]);

  return (
    <div className="p-8 pl-16 text-white min-h-screen max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/clients" className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 text-white/60">←</Link>
        <div>
          <h1 className="text-2xl font-bold">Import Client from Research</h1>
          <p className="text-white/40 text-sm">Drop a Manus research bundle (markdown + logo) — Claude extracts the profile; you review and save.</p>
        </div>
      </div>

      {!data && (
        <>
          <div
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer p-10 rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-all text-center"
          >
            <svg className="w-10 h-10 mx-auto mb-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-white/70 text-sm">Drag & drop a ZIP, folder contents, or loose .md files + logo image</p>
            <p className="text-white/30 text-xs mt-1">Markdown files (research) + optional logo image</p>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onPick} />
          </div>

          {files.length > 0 && (
            <div className="mt-5 p-4 rounded-xl bg-white/[0.03] border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-white">{files.length} file{files.length === 1 ? '' : 's'} ready</p>
                <button onClick={() => setFiles([])} className="text-xs text-white/40 hover:text-white/70">Clear</button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-white/60 py-1 px-2 rounded hover:bg-white/5">
                    <span className="truncate">{f.name}</span>
                    <span className="shrink-0 ml-3 text-white/30">{Math.round(f.size / 1024)} KB</span>
                    <button onClick={() => removeFile(i)} className="ml-2 text-white/30 hover:text-[#ef4444]">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 text-sm text-[#ef4444]">{error}</div>
          )}

          <div className="mt-6">
            <button
              onClick={handleExtract}
              disabled={extracting || files.length === 0}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
              {extracting ? 'Extracting with AI…' : 'Extract Fields'}
            </button>
          </div>
        </>
      )}

      {data && (
        <>
          <div className="mb-5 p-4 rounded-xl bg-[#2dd4bf]/10 border border-[#2dd4bf]/30">
            <p className="text-sm text-[#2dd4bf] font-medium">
              Extracted from {data.file_counts.markdown} markdown file{data.file_counts.markdown === 1 ? '' : 's'}
              {data.file_counts.images > 0 ? ` + ${data.file_counts.images} image${data.file_counts.images === 1 ? '' : 's'}` : ''} ✓
            </p>
            {form.uncertainty_notes?.length > 0 && (
              <div className="mt-2 text-xs text-white/70">
                <strong>Verify before saving:</strong>
                <ul className="mt-1 list-disc list-inside text-white/60">
                  {form.uncertainty_notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}
          </div>

          {logoSrc && (
            <div className="mb-5 p-4 rounded-xl bg-white/[0.02] border border-white/10 flex items-center gap-4">
              <img src={logoSrc} alt="Logo" className="w-20 h-20 object-contain bg-white/5 rounded-lg p-2" />
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider">Logo detected</p>
                <p className="text-sm text-white/70">{data.logo.filename}</p>
                <p className="text-[11px] text-white/40 mt-1">Will be uploaded with the client.</p>
              </div>
            </div>
          )}

          {FIELD_GROUPS.map((group) => (
            <div key={group.title} className="mb-5 p-5 rounded-xl bg-white/[0.02] border border-white/10">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-3">{group.title}</p>
              <div className={group.title === 'Brand' ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 gap-3'}>
                {group.fields.map((f) => (
                  <label key={f.key} className="block">
                    <span className="text-xs text-white/50 mb-1 block">
                      {f.label}{f.required && <span className="text-[#ef4444] ml-1">*</span>}
                    </span>
                    {f.textarea ? (
                      <textarea
                        value={form[f.key] || ''}
                        onChange={(e) => setField(f.key, e.target.value)}
                        rows={f.rows || 3}
                        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm focus:outline-none focus:border-[#3b82f6]/50 resize-none"
                      />
                    ) : (
                      <input
                        value={form[f.key] || ''}
                        onChange={(e) => setField(f.key, e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm focus:outline-none focus:border-[#3b82f6]/50"
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <label className="flex items-center gap-2 mb-5 p-3 rounded-lg bg-white/[0.03] border border-white/10 cursor-pointer">
            <input
              type="checkbox"
              checked={saveResearchAsKb}
              onChange={(e) => setSaveResearchAsKb(e.target.checked)}
              className="accent-[#2dd4bf]"
            />
            <span className="text-sm text-white/70">
              Also save the full research as a Knowledge Base document in <strong>Client Onboarding</strong> (so it stays searchable).
            </span>
          </label>

          {error && (
            <div className="mb-4 p-3 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 text-sm text-[#ef4444]">{error}</div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !form.name?.trim()}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Create Client'}
            </button>
            <button
              onClick={() => { setData(null); setForm({}); }}
              className="px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-sm hover:bg-white/10"
            >
              Start over
            </button>
          </div>
        </>
      )}
    </div>
  );
}

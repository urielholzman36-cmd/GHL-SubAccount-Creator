import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useToast } from '../hooks/useToast.jsx';

function slugify(s) {
  return '/' + String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const labelClass = 'block text-sm text-white/60 mb-1';
const inputClass =
  'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-purple-500/50 transition-colors';
const selectClass =
  'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500/50 transition-colors appearance-none';

export default function PageGenerator() {
  const { toast } = useToast();
  const { id } = useParams();

  const [clients, setClients] = useState([]);
  const [presets, setPresets] = useState([]);
  const [form, setForm] = useState({
    client_id: '',
    page_type: 'services_detail',
    page_name: '',
    page_slug: '',
    user_notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch('/api/clients').then((r) => r.json()).then(setClients).catch(() => {});
    fetch('/api/page-prompts/presets').then((r) => r.json()).then(setPresets).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/page-prompts/${id}`)
      .then((r) => r.json())
      .then((row) => {
        setResult(row);
        setForm({
          client_id: String(row.client_id),
          page_type: row.page_type,
          page_name: row.page_name,
          page_slug: row.page_slug || '',
          user_notes: row.user_notes || '',
        });
      })
      .catch(() => {});
  }, [id]);

  const selectedClient = clients.find((c) => String(c.id) === String(form.client_id));
  const brandReady = selectedClient && (
    selectedClient.brand_personality || selectedClient.brand_colors_json
  );
  const canGenerate = form.client_id && brandReady && form.page_name.trim();

  function update(key, value) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'page_name' && !f.page_slug) next.page_slug = slugify(value);
      return next;
    });
  }

  async function generate() {
    if (!form.client_id || !form.page_name.trim()) {
      toast('Pick a client and enter a page name.', 'error');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/page-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          client_id: Number(form.client_id),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setResult(data);
      toast('Prompt generated.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function regenerate() {
    if (!result?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/page-prompts/${result.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: true, user_notes: form.user_notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Regenerate failed');
      setResult(data);
      toast('Regenerated.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function copyPrompt() {
    if (!result?.generated_prompt) return;
    await navigator.clipboard.writeText(result.generated_prompt);
    toast('Copied to clipboard.', 'success');
  }

  const charCount = result?.generated_prompt?.length || 0;
  const counterColor =
    charCount >= 2000 ? 'text-red-400' : charCount >= 1800 ? 'text-amber-400' : 'text-white/40';

  return (
    <div className="p-8 pl-16 text-white min-h-screen max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Page Generator</h1>
        <p className="text-sm text-white/40 mt-1">
          Generate a 10Web-ready AI prompt for any client page, powered by their brand profile.
        </p>
      </div>

      {/* Form card */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-5 mb-6">
        {/* Client dropdown */}
        <div>
          <label className={labelClass}>Client</label>
          <select
            className={selectClass}
            value={form.client_id}
            onChange={(e) => update('client_id', e.target.value)}
          >
            <option value="" className="bg-[#0f1729]">-- Select a client --</option>
            {clients.map((c) => (
              <option key={c.id} value={String(c.id)} className="bg-[#0f1729]">
                {c.name}
              </option>
            ))}
          </select>

          {/* Brand warning */}
          {form.client_id && !brandReady && (
            <p className="mt-2 text-xs text-amber-400/80 flex items-center gap-1.5">
              <span>⚠</span>
              This client has no brand data. Run &quot;Analyze Brand&quot; on their profile first.
            </p>
          )}
          {form.client_id && brandReady && (
            <p className="mt-2 text-xs text-emerald-400/70">Brand data found — ready to generate.</p>
          )}
        </div>

        {/* Page Type dropdown */}
        <div>
          <label className={labelClass}>Page Type</label>
          <select
            className={selectClass}
            value={form.page_type}
            onChange={(e) => update('page_type', e.target.value)}
          >
            {presets.length > 0 ? (
              presets.map((p) => (
                <option key={p.value || p} value={p.value || p} className="bg-[#0f1729]">
                  {p.label || p.value || p}
                </option>
              ))
            ) : (
              <>
                <option value="services_detail" className="bg-[#0f1729]">Services Detail</option>
                <option value="landing_page" className="bg-[#0f1729]">Landing Page</option>
                <option value="about" className="bg-[#0f1729]">About</option>
                <option value="contact" className="bg-[#0f1729]">Contact</option>
                <option value="home" className="bg-[#0f1729]">Home</option>
              </>
            )}
          </select>
        </div>

        {/* Page Name */}
        <div>
          <label className={labelClass}>Page Name</label>
          <input
            className={inputClass}
            value={form.page_name}
            onChange={(e) => update('page_name', e.target.value)}
            placeholder="e.g. Roof Replacement"
          />
        </div>

        {/* URL Slug */}
        <div>
          <label className={labelClass}>URL Slug</label>
          <input
            className={inputClass}
            value={form.page_slug}
            onChange={(e) => update('page_slug', e.target.value)}
            placeholder="/roof-replacement"
          />
          <p className="mt-1 text-xs text-white/30">Auto-filled from page name; edit if needed.</p>
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass}>Notes <span className="text-white/30">(optional)</span></label>
          <textarea
            className={`${inputClass} resize-none`}
            rows={3}
            value={form.user_notes}
            onChange={(e) => update('user_notes', e.target.value)}
            placeholder="Any specific instructions or focus areas for this page..."
          />
        </div>

        {/* Generate button */}
        <div className="pt-1">
          <button
            onClick={generate}
            disabled={!canGenerate || loading}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              canGenerate && !loading
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-lg shadow-purple-900/30 cursor-pointer'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            }`}
          >
            {loading ? 'Generating…' : result ? 'Generate New' : 'Generate Prompt'}
          </button>
        </div>
      </div>

      {/* Result card */}
      {result?.generated_prompt && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          {/* Result header */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
              Generated Prompt
            </h2>
            <span className={`text-xs font-mono ${counterColor}`}>
              {charCount.toLocaleString()}/2000
            </span>
          </div>

          {/* Prompt output */}
          <pre className="bg-black/30 border border-white/10 rounded-lg p-4 text-xs text-white/80 font-mono leading-relaxed overflow-auto max-h-96 whitespace-pre-wrap break-words">
            {result.generated_prompt}
          </pre>

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={copyPrompt}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 border border-white/10 hover:bg-white/15 hover:border-white/20 text-white transition-all"
            >
              Copy
            </button>
            <button
              onClick={regenerate}
              disabled={loading}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                loading
                  ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                  : 'bg-white/10 border-white/10 hover:bg-white/15 hover:border-white/20 text-white'
              }`}
            >
              {loading ? 'Regenerating…' : 'Regenerate'}
            </button>
          </div>

          {/* Meta info */}
          {(result.page_name || result.page_type) && (
            <p className="text-xs text-white/30">
              {result.page_type && <span className="capitalize">{result.page_type.replace(/_/g, ' ')}</span>}
              {result.page_name && result.page_type && ' · '}
              {result.page_name}
              {result.page_slug && ` · ${result.page_slug}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

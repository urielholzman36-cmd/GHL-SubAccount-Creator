import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function NewProposal() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [config, setConfig] = useState(null);
  const [clientId, setClientId] = useState('');
  const [form, setForm] = useState({
    business_name: '',
    client_name: '',
    email: '',
    phone: '',
    niche: '',
    notes: '',
  });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/clients').then((r) => r.json()).catch(() => []),
      fetch('/api/proposals/config').then((r) => r.json()).catch(() => null),
    ]).then(([c, cfg]) => {
      setClients(Array.isArray(c) ? c : []);
      setConfig(cfg);
    });
  }, []);

  function pickClient(id) {
    setClientId(id);
    if (!id) return;
    const c = clients.find((x) => String(x.id) === String(id));
    if (!c) return;
    setForm({
      business_name: c.name || '',
      client_name: c.contact_name || '',
      email: c.email || '',
      phone: c.phone || '',
      niche: c.industry || '',
      notes: '',
    });
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleGenerate() {
    setError(null);
    setResult(null);
    if (!form.business_name.trim() || !form.client_name.trim() || !form.email.trim()) {
      setError('Business, client name, and email are required');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/proposals/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          client_id: clientId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  const pkg = config?.package;

  return (
    <div className="p-8 pl-16 text-white min-h-screen max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/proposals" className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 text-white/60">
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Proposal</h1>
          <p className="text-white/40 text-sm">Generates a branded proposal and contract PDF.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_340px] gap-5">
        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/10 space-y-4">
          {clients.length > 0 && (
            <label className="block">
              <span className="text-xs text-white/50 mb-1 block">Pick an existing client (optional)</span>
              <select
                value={clientId}
                onChange={(e) => pickClient(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm focus:outline-none focus:border-[#3b82f6]/50"
              >
                <option value="">— new client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Business name *" value={form.business_name} onChange={(v) => update('business_name', v)} />
            <Field label="Client contact name *" value={form.client_name} onChange={(v) => update('client_name', v)} />
            <Field label="Email *" value={form.email} onChange={(v) => update('email', v)} type="email" />
            <Field label="Phone" value={form.phone} onChange={(v) => update('phone', v)} />
            <Field label="Niche / industry" value={form.niche} onChange={(v) => update('niche', v)} />
          </div>

          <label className="block">
            <span className="text-xs text-white/50 mb-1 block">Internal notes (not on PDF)</span>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm focus:outline-none focus:border-[#3b82f6]/50 resize-none"
            />
          </label>

          {error && (
            <div className="p-3 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 text-sm text-[#ef4444]">
              {error}
            </div>
          )}

          {result && (
            <div className="p-4 rounded-lg border border-[#2dd4bf]/30 bg-[#2dd4bf]/10">
              <p className="text-[#2dd4bf] font-medium text-sm mb-2">Proposal generated ✓</p>
              <div className="flex flex-wrap gap-2 mb-2">
                <a href={result.proposal_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/90 text-xs hover:bg-white/15">
                  ↓ Proposal PDF
                </a>
                <a href={result.contract_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/90 text-xs hover:bg-white/15">
                  ↓ Contract PDF
                </a>
                <button
                  onClick={() => navigate('/proposals')}
                  className="px-3 py-1.5 rounded-lg text-white/60 text-xs hover:text-white/90"
                >
                  View history →
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40"
          >
            {generating ? 'Generating PDFs…' : result ? 'Regenerate with edits' : 'Generate Proposal + Contract'}
          </button>
          {result && (
            <p className="text-[11px] text-white/40 mt-2">
              Edit any field above, then click Regenerate. Your current PDFs will be replaced with a new proposal.
            </p>
          )}
        </div>

        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/10 h-fit">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Package</p>
          {pkg ? (
            <>
              <p className="text-white font-semibold">{pkg.name}</p>
              <p className="text-[#2dd4bf] text-lg font-semibold">${pkg.price}<span className="text-sm text-white/40 font-normal"> / {pkg.billing}</span></p>
              {pkg.setup_fee > 0 && (
                <p className="text-xs text-white/50 mt-0.5">Setup fee: ${pkg.setup_fee}</p>
              )}
              <p className="text-xs text-white/50">Minimum term: {pkg.contract_length_months} months</p>

              <div className="h-px bg-white/5 my-3" />
              <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Included</p>
              <ul className="text-xs text-white/70 space-y-1">
                {pkg.services?.map((s) => (
                  <li key={s} className="flex items-start gap-2">
                    <span className="text-[#2dd4bf] mt-0.5">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>

              {pkg.not_included?.length > 0 && (
                <>
                  <p className="text-xs text-white/40 uppercase tracking-wider mt-4 mb-2">Not included</p>
                  <ul className="text-xs text-white/50 space-y-1">
                    {pkg.not_included.map((s) => (
                      <li key={s} className="flex items-start gap-2">
                        <span className="text-white/30 mt-0.5">✗</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="text-white/40 text-sm">Loading…</p>
          )}
          <p className="text-[10px] text-white/30 mt-4">
            Package defined in <code className="text-white/50">server/modules/proposals/package-config.json</code>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="text-xs text-white/50 mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm focus:outline-none focus:border-[#3b82f6]/50"
      />
    </label>
  );
}

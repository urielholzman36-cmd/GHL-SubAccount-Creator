import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import StatusBadge from '../components/health/StatusBadge.jsx';

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-white/30 text-xs uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-white text-sm">{value}</p>
    </div>
  );
}

function QuickAction({ label, to, icon }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-sm hover:bg-white/10 hover:text-white transition-all"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      {label}
    </Link>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [health, setHealth] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [regenBrief, setRegenBrief] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerateBrief() {
    const alreadyExists = !!client?.client_brief;
    if (alreadyExists) {
      const ok = window.confirm(
        'A Company Master Brief already exists for this client.\n\n' +
        'The brief is meant to be generated once per company. Regenerating will OVERWRITE the existing brief that Manus may be using.\n\n' +
        'Proceed?'
      );
      if (!ok) return;
    }
    setRegenBrief(true);
    try {
      const qs = alreadyExists ? '?replace=true' : '';
      const res = await fetch(`/api/clients/${id}/generate-brief${qs}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(`Brief generation failed: ${data.details || data.error || res.status}`);
        return;
      }
      setClient((c) => ({
        ...c,
        client_brief: data.brief,
        client_brief_generated_at: data.generated_at,
      }));
      setBriefOpen(true);
    } catch (err) {
      alert(`Brief generation failed: ${err?.message || 'network error'}`);
    } finally {
      setRegenBrief(false);
    }
  }

  function handleDownloadBrief() {
    if (!client?.client_brief) return;
    window.location.href = `/api/clients/${id}/brief.md`;
  }

  async function handleCopyBrief() {
    if (!client?.client_brief) return;
    try {
      await navigator.clipboard.writeText(client.client_brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      alert('Copy failed — select the text manually.');
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Delete failed: ${data.details || data.error || res.status}`);
        setDeleting(false);
        return;
      }
      navigate('/clients');
    } catch (err) {
      alert(`Delete failed: ${err?.message || 'network error'}`);
      setDeleting(false);
    }
  }

  useEffect(() => {
    fetch(`/api/clients/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) setClient(data);
      });
    fetch(`/api/health/scores/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => data?.latest && setHealth(data.latest))
      .catch(() => {});
  }, [id]);

  if (!client) {
    return <div className="p-6 text-white/30 text-sm">Loading client...</div>;
  }

  const addressLine = [client.address, client.city, client.state, client.zip]
    .filter(Boolean).join(', ');
  const cityState = [client.city, client.state].filter(Boolean).join(', ');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        to="/clients"
        className="inline-flex items-center gap-1.5 text-white/40 hover:text-white/80 text-sm mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Clients
      </Link>
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          {client.logo_path ? (
            <img src={`/${client.logo_path}`} alt="" className="w-14 h-14 rounded-xl object-cover bg-white/5" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center text-white/20 text-lg font-bold">
              {(client.name || '?')[0]}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-white">{client.name}</h1>
            <p className="text-white/30 text-sm">
              {client.industry || 'No industry'}{cityState ? ` — ${cityState}` : client.location ? ` — ${client.location}` : ''}
            </p>
            {health && (
              <div className="flex items-center gap-2 mt-2">
                <Link to={`/health/${id}`} className="text-white/70 text-sm font-semibold hover:text-white">
                  Health {health.score}
                </Link>
                <StatusBadge status={health.status} />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/social/client/${id}`}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-sm hover:bg-white/10 hover:text-white transition-all"
          >
            Edit Full Profile
          </Link>
          <button
            onClick={() => { setConfirmOpen(true); setConfirmText(''); }}
            className="px-4 py-2 rounded-lg bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-sm hover:bg-[#ef4444]/20 transition-all"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        <QuickAction label="Social Planner" to={`/social/client/${id}/campaigns`} icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        <QuickAction label="Health" to={`/health/${id}`} icon="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5" />
        <QuickAction label="Generate Report" to="/reports" icon="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5" />
        <QuickAction label="Create Proposal" to="/proposals" icon="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192" />
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0f172a] border border-[#ef4444]/30 p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-2">Delete {client.name}?</h3>
            <p className="text-white/60 text-sm mb-4 leading-relaxed">
              This permanently removes the client and <span className="text-white/80">all associated data</span>:
              campaigns, posts, health scores, and alerts. This cannot be undone.
            </p>
            <p className="text-white/40 text-xs mb-2">
              Type <span className="text-white/80 font-mono">{client.name}</span> to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-3 py-2 mb-4 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#ef4444]/50"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-sm hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || confirmText !== client.name}
                className="px-4 py-2 rounded-lg bg-[#ef4444] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Delete Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Company Master Brief (Mode A) — generated once per client, used by Manus */}
      <div className="mb-6 p-5 rounded-xl bg-gradient-to-r from-[#2dd4bf]/5 via-[#3b82f6]/5 to-[#a855f7]/5 border border-white/10">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Company Master Brief</h2>
            <p className="text-xs text-white/50 mt-1">
              One-time, authoritative brief shared with Manus. 10 structured sections covering who the brand is, how it sounds, and how its images should look. Regenerate only if the client's fundamentals change.
            </p>
            {client.client_brief_generated_at && (
              <p className="text-[11px] text-white/30 mt-1">
                Last generated {new Date(client.client_brief_generated_at).toLocaleString()} · filename <code className="text-white/50">{(client.name || 'client').replace(/[^\w.-]/g,'').replace(/[.-]+/g,'_')}_company_master_brief.md</code>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {client.client_brief && (
              <>
                <button
                  onClick={handleCopyBrief}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10 transition-all"
                >
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
                <button
                  onClick={handleDownloadBrief}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10 transition-all"
                >
                  Download .md
                </button>
              </>
            )}
            <button
              onClick={() => setBriefOpen((o) => !o)}
              disabled={!client.client_brief}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10 transition-all disabled:opacity-40"
            >
              {briefOpen ? 'Hide' : 'View'}
            </button>
            <button
              onClick={handleGenerateBrief}
              disabled={regenBrief}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {regenBrief ? 'Generating…' : client.client_brief ? 'Replace brief' : 'Generate Brief'}
            </button>
          </div>
        </div>
        {briefOpen && client.client_brief && (
          <pre className="mt-4 p-4 rounded-lg bg-black/40 border border-white/5 text-white/80 text-xs leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-[480px] overflow-y-auto font-mono">
{client.client_brief}
          </pre>
        )}
        {!client.client_brief && !regenBrief && (
          <p className="mt-3 text-xs text-white/40">
            No brief yet. Click <span className="text-white/60">Generate Brief</span> — produces a 10-section Mode A document from the client profile + logo palette.
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5 space-y-3">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-2">Contact Info</h2>
          <Field label="Contact Name" value={client.contact_name} />
          <Field label="Email" value={client.email} />
          <Field label="Phone" value={client.phone} />
          <Field label="Website" value={client.website} />
          <Field label="Address" value={addressLine || client.location} />
          <Field label="Timezone" value={client.timezone} />
        </div>
        <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5 space-y-3">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-2">Brand & Services</h2>
          <Field label="Industry" value={client.industry} />
          <Field label="Brand Tone" value={client.brand_tone} />
          <Field label="Target Audience" value={client.target_audience} />
          <Field label="Brand Description" value={client.brand_description} />
          <Field label="Onboarding Status" value={client.onboarding_status} />
          <Field label="Start Date" value={client.start_date} />
          <Field
            label="GHL Connection"
            value={client.has_ghl_api_key && client.location_id ? `Connected · ${client.location_id}` : client.location_id ? 'Location ID set, API key missing' : null}
          />
        </div>
      </div>
    </div>
  );
}

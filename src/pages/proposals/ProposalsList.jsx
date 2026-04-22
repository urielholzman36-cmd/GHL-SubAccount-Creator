import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';

export default function ProposalsList() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/proposals')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setProposals(Array.isArray(data) ? data : []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function handleDelete(p) {
    if (!confirm(`Delete proposal for ${p.business_name}? This can't be undone.`)) return;
    const res = await fetch(`/api/proposals/${p.id}`, { method: 'DELETE' });
    if (res.ok) {
      setProposals((list) => list.filter((x) => x.id !== p.id));
    } else {
      alert('Delete failed.');
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return proposals;
    return proposals.filter((p) =>
      [p.business_name, p.client_name, p.email, p.niche].filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [proposals, search]);

  return (
    <div className="p-8 pl-16 text-white min-h-screen max-w-6xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Proposals</h1>
          <p className="text-white/40 text-sm">Generate branded proposal + contract PDFs.</p>
        </div>
        <div className="flex gap-2">
          <a
            href="/api/proposals/template/download"
            className="px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10"
          >
            ↓ DOCX Templates
          </a>
          <Link
            to="/proposals/new"
            className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90"
          >
            + New Proposal
          </Link>
        </div>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by business, client, or email…"
        className="w-full md:max-w-md mb-5 px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:border-[#3b82f6]/50"
      />

      {loading ? (
        <div className="text-white/40 text-sm py-10 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center rounded-xl bg-white/[0.02] border border-white/5">
          <p className="text-white/50 text-sm">
            {proposals.length === 0 ? 'No proposals yet.' : 'No proposals match your search.'}
          </p>
          {proposals.length === 0 && (
            <Link to="/proposals/new" className="inline-block mt-3 text-[#3b82f6] text-sm hover:underline">
              Create your first proposal →
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-white/[0.02] border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.03] text-white/50 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Business</th>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Package</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Created</th>
                <th className="text-right px-4 py-3 font-medium">Downloads</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{p.business_name}</div>
                    {p.niche && (
                      <div className="text-[11px] text-white/40 mt-0.5">{p.niche}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    <div>{p.client_name}</div>
                    <div className="text-[11px] text-white/40">{p.email}</div>
                  </td>
                  <td className="px-4 py-3 text-white/70 hidden md:table-cell">
                    <div>{p.package_name || '—'}</div>
                    {p.package_price ? (
                      <div className="text-[11px] text-white/40">${p.package_price}/mo</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-white/50 text-xs hidden md:table-cell">
                    {formatDate(p.created_at)}
                    {p.created_by && <div className="text-[10px] text-white/30">{p.created_by}</div>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={p.proposal_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block px-2.5 py-1 text-xs text-[#3b82f6] hover:underline"
                    >
                      Proposal
                    </a>
                    <a
                      href={p.contract_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block px-2.5 py-1 text-xs text-[#3b82f6] hover:underline"
                    >
                      Contract
                    </a>
                    <button
                      onClick={() => handleDelete(p)}
                      className="inline-block px-2.5 py-1 text-xs text-[#ef4444] hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString();
}

import { useEffect, useState, useCallback } from 'react';
import BuildDetailRow from './BuildDetailRow';
import Spinner from './Spinner';


function StatusBadge({ status }) {
  if (status === 'success' || status === 'completed') {
    return (
      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/20">
        Success
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
        Failed
      </span>
    );
  }
  if (status === 'paused') {
    return (
      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
        Paused
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-magenta/15 text-magenta border border-magenta/20">
        Running
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-white/5 text-white/30 border border-white/10">
      {status ?? '—'}
    </span>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatDuration(ms) {
  if (ms == null) return '—';
  return (ms / 1000).toFixed(1) + 's';
}

export default function BuildTable() {
  const [builds, setBuilds] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchBuilds = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (status) params.set('status', status);

    fetch(`/api/builds?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch builds');
        return r.json();
      })
      .then((json) => {
        setBuilds(json.builds ?? []);
        setTotal(json.total ?? 0);
        setPerPage(json.perPage ?? 10);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [page, debouncedSearch, status]);

  useEffect(() => {
    fetchBuilds();
  }, [fetchBuilds]);

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [debouncedSearch, status]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  async function handleDelete(e, buildId, businessName) {
    e.stopPropagation();
    if (!confirm(`Delete "${businessName}"? This will also remove the GHL sub-account.`)) return;
    try {
      const res = await fetch(`/api/builds/${buildId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchBuilds();
        if (expandedId === buildId) setExpandedId(null);
      }
    } catch (_) {}
  }

  function toggleRow(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const selectClass =
    'px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 ' +
    'focus:outline-none focus:border-magenta/50 focus:ring-1 focus:ring-magenta/30 transition';

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-magenta/50 focus:ring-1 focus:ring-magenta/30 transition"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectClass}
        >
          <option value="">All Statuses</option>
          <option value="completed">Success</option>
          <option value="failed">Failed</option>
          <option value="paused">Paused</option>
          <option value="running">Running</option>
        </select>
      </div>

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left px-4 py-3 font-semibold text-white/40 text-xs uppercase tracking-wider">Business</th>
              <th className="text-left px-4 py-3 font-semibold text-white/40 text-xs uppercase tracking-wider">Owner</th>
              <th className="text-left px-4 py-3 font-semibold text-white/40 text-xs uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-white/40 text-xs uppercase tracking-wider">Date</th>
              <th className="text-left px-4 py-3 font-semibold text-white/40 text-xs uppercase tracking-wider">Time</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="py-10">
                  <div className="flex justify-center"><Spinner /></div>
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-red-400">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && builds.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-white/20">
                  No builds found.
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              builds.map((build) => {
                const isExpanded = expandedId === build.id;
                return [
                  <tr
                    key={build.id}
                    onClick={() => toggleRow(build.id)}
                    className={`cursor-pointer border-b border-white/5 transition-colors ${
                      isExpanded ? 'bg-white/6' : 'hover:bg-white/4'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-white block">
                        {build.business_name ?? '—'}
                      </span>
                      <span className="text-xs text-white/25">{build.email ?? ''}</span>
                    </td>
                    <td className="px-4 py-3 text-white/50">
                      {[build.first_name, build.last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={build.status} />
                    </td>
                    <td className="px-4 py-3 text-white/30 text-xs">{formatDate(build.created_at)}</td>
                    <td className="px-4 py-3 text-white/30 text-xs">{formatDuration(build.duration_ms)}</td>
                    <td className="px-2 py-3">
                      <button
                        onClick={(e) => handleDelete(e, build.id, build.business_name)}
                        className="p-1.5 rounded-lg text-white/15 hover:text-red-400 hover:bg-red-500/10 transition"
                        title="Delete build"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>,
                  isExpanded && (
                    <BuildDetailRow key={`detail-${build.id}`} buildId={build.id} />
                  ),
                ];
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-5">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-full text-sm font-semibold transition-all ${
                p === page
                  ? 'bg-magenta text-white shadow-lg shadow-magenta/30'
                  : 'bg-white/5 text-white/30 border border-white/10 hover:border-magenta/30 hover:text-magenta'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

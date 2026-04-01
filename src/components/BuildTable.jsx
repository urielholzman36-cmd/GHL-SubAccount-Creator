import { useEffect, useState, useCallback } from 'react';
import BuildDetailRow from './BuildDetailRow';

const INDUSTRIES = ['', 'Construction', 'Plumbing', 'Electrical', 'Cleaning', 'General'];
const STATUSES = ['', 'success', 'failed'];

const INDUSTRY_BADGE = {
  Construction: 'bg-gray-800 text-white',
  Plumbing: 'bg-navy text-white',
  Electrical: 'bg-amber-500 text-white',
  Cleaning: 'bg-magenta text-white',
  General: 'bg-gray-400 text-white',
};

function IndustryBadge({ industry }) {
  const cls = INDUSTRY_BADGE[industry] ?? 'bg-gray-300 text-gray-700';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {industry ?? '—'}
    </span>
  );
}

function StatusBadge({ status }) {
  if (status === 'success') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">
        ✓ Success
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-600">
        ✗ Failed
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-500">
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
  const [industry, setIndustry] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // Debounced search value
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
    if (industry) params.set('industry', industry);
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
  }, [page, debouncedSearch, industry, status]);

  useEffect(() => {
    fetchBuilds();
  }, [fetchBuilds]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [debouncedSearch, industry, status]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  function toggleRow(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div>
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-magenta/40"
        />
        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-magenta/40 bg-white"
        >
          <option value="">All Industries</option>
          {INDUSTRIES.filter(Boolean).map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-magenta/40 bg-white"
        >
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy text-white">
              <th className="text-left px-4 py-3 font-semibold">Business</th>
              <th className="text-left px-4 py-3 font-semibold">Owner</th>
              <th className="text-left px-4 py-3 font-semibold">Industry</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Date</th>
              <th className="text-left px-4 py-3 font-semibold">Build Time</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400">
                  Loading...
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
                <td colSpan={6} className="text-center py-10 text-gray-400">
                  No builds found.
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              builds.map((build, i) => {
                const isExpanded = expandedId === build.id;
                const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                return [
                  <tr
                    key={build.id}
                    onClick={() => toggleRow(build.id)}
                    className={`${rowBg} cursor-pointer hover:bg-blue-50 transition-colors`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-800 block">
                        {build.business_name ?? '—'}
                      </span>
                      <span className="text-xs text-gray-400">{build.email ?? ''}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {[build.first_name, build.last_name].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <IndustryBadge industry={build.industry} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={build.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(build.created_at)}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDuration(build.duration_ms)}</td>
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
              className={`w-8 h-8 rounded-full text-sm font-semibold transition-colors ${
                p === page
                  ? 'bg-magenta text-white'
                  : 'bg-white text-gray-500 border border-gray-200 hover:border-magenta hover:text-magenta'
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

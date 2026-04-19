import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../hooks/useToast.jsx';

export default function PagePromptHistory({ clientId }) {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    fetch(`/api/page-prompts?client_id=${clientId}`)
      .then((r) => r.json())
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  async function remove(id) {
    if (!confirm('Delete this generated prompt?')) return;
    const res = await fetch(`/api/page-prompts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast('Deleted.', 'success');
    } else {
      toast('Failed to delete.', 'error');
    }
  }

  if (!clientId) return null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Generated Pages</span>
          {!loading && (
            <span className="px-2 py-0.5 rounded-md bg-white/10 text-xs text-white/60 font-mono">
              {rows.length}
            </span>
          )}
          {loading && (
            <span className="text-xs text-white/30">Loading…</span>
          )}
        </div>
        <span className="text-white/30 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {/* Expandable body */}
      {open && (
        <div className="border-t border-white/10 px-5 py-4">
          {loading ? (
            <p className="text-sm text-white/40">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-white/40">
              No page prompts yet.{' '}
              <Link to="/pages" className="text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors">
                Generate one
              </Link>
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => {
                const date = row.created_at
                  ? new Date(row.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—';
                const charCount = row.generated_prompt?.length || 0;
                const pageType = row.page_type
                  ? row.page_type.replace(/_/g, ' ')
                  : '—';

                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
                  >
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{row.page_name || '(unnamed)'}</p>
                      <p className="text-xs text-white/40 mt-0.5 capitalize">
                        {pageType} · {date}
                        {charCount > 0 && (
                          <span className="ml-2 font-mono">{charCount.toLocaleString()} chars</span>
                        )}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        to={`/pages/${row.id}`}
                        className="px-3 py-1 rounded-md text-xs font-medium bg-white/10 border border-white/10 text-white/70 hover:bg-white/15 hover:text-white transition-all"
                      >
                        Open
                      </Link>
                      <button
                        type="button"
                        onClick={() => remove(row.id)}
                        className="px-3 py-1 rounded-md text-xs font-medium bg-white/5 border border-white/10 text-white/40 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

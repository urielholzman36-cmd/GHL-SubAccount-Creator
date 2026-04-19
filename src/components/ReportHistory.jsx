import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function ReportHistory({ clientId }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    fetch(`/api/reports?client_id=${clientId}`)
      .then((r) => r.json())
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId]);

  if (!clientId) return null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="font-semibold text-white/80">
          Reports {rows.length > 0 && <span className="text-white/40 ml-1">({rows.length})</span>}
        </span>
        <span className="text-white/40 text-sm">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-2">
          {loading && <p className="text-white/40 text-sm">Loading…</p>}
          {!loading && rows.length === 0 && (
            <p className="text-white/40 text-sm">
              No reports yet.{' '}
              <Link to={`/reports?client_id=${clientId}`} className="text-cyan-300 underline">Generate one</Link>.
            </p>
          )}
          {rows.slice(0, 3).map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5">
              <div className="min-w-0">
                <p className="text-sm text-white/80">{r.month}</p>
                <p className="text-xs text-white/40">{r.status} · {new Date(r.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {r.pdf_url && <a href={r.pdf_url} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 hover:underline">Download</a>}
                <Link to={`/reports?client_id=${clientId}&month=${r.month}`} className="text-xs text-white/60 hover:underline">Open</Link>
              </div>
            </div>
          ))}
          {rows.length > 0 && (
            <Link to={`/reports?client_id=${clientId}`} className="block text-xs text-cyan-300 hover:underline mt-2">Generate new report →</Link>
          )}
        </div>
      )}
    </div>
  );
}

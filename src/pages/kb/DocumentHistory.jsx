import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import MarkdownRenderer from '../../components/kb/MarkdownRenderer';

export default function DocumentHistory() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [d, v] = await Promise.all([
        fetch(`/api/kb/documents/${id}`).then((r) => r.json()),
        fetch(`/api/kb/documents/${id}/versions`).then((r) => r.json()),
      ]);
      setDoc(d);
      setVersions(Array.isArray(v) ? v : []);
      if (v?.[0]) setSelected(v[0]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleRestore(version) {
    if (!confirm(`Restore version from ${new Date(version.edited_at.replace(' ', 'T') + 'Z').toLocaleString()}? This creates a new version with the old content.`)) return;
    setRestoring(true);
    try {
      const res = await fetch(`/api/kb/documents/${id}/versions/${version.id}/restore`, { method: 'POST' });
      if (!res.ok) throw new Error('Restore failed');
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setRestoring(false);
    }
  }

  if (loading) return <div className="p-8 pl-16 text-white/40 text-sm">Loading…</div>;

  const dir = doc?.language === 'he' ? 'rtl' : 'ltr';

  return (
    <div className="p-8 pl-16 text-white min-h-screen max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/kb/doc/${id}`} className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 text-white/60">
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Version History</h1>
          <p className="text-white/40 text-sm">{doc?.title}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-5">
        <div className="space-y-2">
          {versions.length === 0 && <p className="text-white/40 text-sm">No versions yet.</p>}
          {versions.map((v) => {
            const active = selected?.id === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  active
                    ? 'bg-[#3b82f6]/15 border border-[#3b82f6]/40'
                    : 'bg-white/[0.03] border border-white/10 hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-white/50">{formatDate(v.edited_at)}</span>
                  <span className="text-[10px] text-white/40">{v.edited_by}</span>
                </div>
                <p className="text-sm text-white/80 line-clamp-2">{v.change_summary || '—'}</p>
              </button>
            );
          })}
        </div>

        <div>
          {selected ? (
            <div className="p-5 rounded-xl bg-white/[0.02] border border-white/10">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/5">
                <div>
                  <p className="text-xs text-white/40 uppercase tracking-wider">Viewing</p>
                  <p className="text-sm text-white/80">{formatDate(selected.edited_at)} · {selected.edited_by}</p>
                </div>
                <button
                  onClick={() => handleRestore(selected)}
                  disabled={restoring || selected.id === versions[0]?.id}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-xs hover:bg-white/10 disabled:opacity-40"
                  title={selected.id === versions[0]?.id ? 'This is the current version' : 'Restore this version'}
                >
                  {restoring ? 'Restoring…' : 'Restore this version'}
                </button>
              </div>
              <MarkdownRenderer content={selected.content_structured} dir={dir} />
            </div>
          ) : (
            <p className="text-white/40 text-sm">Select a version to preview it.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

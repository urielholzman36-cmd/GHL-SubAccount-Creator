import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';

export default function KnowledgeList() {
  const [docs, setDocs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [sort, setSort] = useState('updated');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [docsRes, catsRes] = await Promise.all([
          fetch(`/api/kb/documents?sort=${sort}`).then((r) => r.json()),
          fetch('/api/kb/categories').then((r) => r.json()),
        ]);
        if (!cancelled) {
          setDocs(Array.isArray(docsRes) ? docsRes : []);
          setCategories(Array.isArray(catsRes) ? catsRes : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sort]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (activeCategory !== 'all' && d.category_id !== activeCategory) return false;
      if (!q) return true;
      return d.title?.toLowerCase().includes(q) || d.category_name?.toLowerCase().includes(q);
    });
  }, [docs, search, activeCategory]);

  return (
    <div className="p-8 pl-16 text-white min-h-screen max-w-6xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-white/40 text-sm">Internal processes, tool setups, and playbooks.</p>
        </div>
        <Link
          to="/kb/new"
          className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90"
        >
          + New Document
        </Link>
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or content…"
          className="flex-1 px-4 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-sm placeholder:text-white/30 focus:outline-none focus:border-[#3b82f6]/50"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-white/70 focus:outline-none focus:border-[#3b82f6]/50"
        >
          <option value="updated">Last updated</option>
          <option value="created">Created date</option>
          <option value="title">Title A–Z</option>
        </select>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        <Chip
          active={activeCategory === 'all'}
          onClick={() => setActiveCategory('all')}
          count={docs.length}
        >
          All
        </Chip>
        {categories.map((c) => (
          <Chip
            key={c.id}
            active={activeCategory === c.id}
            onClick={() => setActiveCategory(c.id)}
            count={c.doc_count}
          >
            {c.name}
          </Chip>
        ))}
      </div>

      {loading ? (
        <div className="text-white/40 text-sm py-10 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center rounded-xl bg-white/[0.02] border border-white/5">
          <p className="text-white/50 text-sm">No documents yet{search ? ' matching your search' : ''}.</p>
          {!search && (
            <Link to="/kb/new" className="inline-block mt-3 text-[#3b82f6] text-sm hover:underline">
              Create your first document →
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((d) => (
            <Link
              key={d.id}
              to={`/kb/doc/${d.id}`}
              className="p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.05] hover:border-white/20 transition-colors block"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-white font-medium leading-snug line-clamp-2">{d.title}</h3>
                {d.language === 'he' && (
                  <span className="text-[10px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded shrink-0">עב</span>
                )}
              </div>
              {d.category_name && (
                <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-[#3b82f6]/15 text-[#3b82f6] mb-2">
                  {d.category_name}
                </span>
              )}
              <p className="text-white/40 text-xs">
                Updated {formatDate(d.updated_at)}{d.updated_by ? ` · ${d.updated_by}` : ''}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, count, children }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
        active
          ? 'bg-gradient-to-r from-[#2dd4bf]/20 via-[#3b82f6]/20 to-[#a855f7]/20 text-white border border-[#3b82f6]/30'
          : 'bg-white/[0.03] border border-white/10 text-white/50 hover:bg-white/[0.06] hover:text-white/80'
      }`}
    >
      {children}
      {count != null && <span className="ml-1.5 text-white/30">{count}</span>}
    </button>
  );
}

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return s;
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

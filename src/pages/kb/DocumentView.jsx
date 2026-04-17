import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import MarkdownRenderer from '../../components/kb/MarkdownRenderer';

export default function DocumentView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef(null);

  async function reload() {
    setLoading(true);
    try {
      const [d, cats] = await Promise.all([
        fetch(`/api/kb/documents/${id}`).then((r) => r.ok ? r.json() : Promise.reject(r)),
        fetch('/api/kb/categories').then((r) => r.json()),
      ]);
      setDoc(d);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (err) {
      setError('Could not load document');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [id]);

  function startEdit() {
    setDraftTitle(doc.title);
    setDraftContent(doc.content_structured);
    setDraftCategory(doc.category_name || '');
    setIsNewCategory(false);
    setEditing(true);
  }

  async function saveEdit() {
    if (!draftTitle.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/kb/documents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle.trim(),
          category: draftCategory.trim() || null,
          is_new_category: isNewCategory,
          content_structured: draftContent,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.details || data.error || `HTTP ${res.status}`);
      }
      setEditing(false);
      await reload();
    } catch (err) {
      alert(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${doc.title}"? This can be undone from the database but not from the UI.`)) return;
    await fetch(`/api/kb/documents/${id}`, { method: 'DELETE' });
    navigate('/kb');
  }

  async function handleImageUpload(files) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('images', f);
      const res = await fetch(`/api/kb/documents/${id}/images`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error);
      // Append image markdown into edit buffer if editing, else into content directly
      const markdown = data.images
        .map((img) => `![${img.original_filename}](${img.secure_url})`)
        .join('\n\n');
      if (editing) {
        setDraftContent((prev) => `${prev}\n\n${markdown}\n`);
      } else {
        startEdit();
        setDraftContent((prev) => `${doc.content_structured}\n\n${markdown}\n`);
      }
      await reload();
    } catch (err) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <div className="p-8 pl-16 text-white/40 text-sm">Loading…</div>;
  if (error || !doc) return <div className="p-8 pl-16 text-[#ef4444]">{error || 'Not found'}</div>;

  const dir = doc.language === 'he' ? 'rtl' : 'ltr';

  return (
    <div className="p-8 pl-16 text-white min-h-screen max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Link to="/kb" className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 text-white/60 shrink-0 mt-1">
            ←
          </Link>
          <div className="min-w-0">
            {editing ? (
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="w-full text-2xl font-bold bg-transparent border-b border-white/10 focus:outline-none focus:border-[#3b82f6]/50 pb-1"
                dir="auto"
              />
            ) : (
              <h1 className="text-2xl font-bold break-words" dir="auto">{doc.title}</h1>
            )}
            <div className="flex items-center gap-2 text-xs text-white/40 mt-1.5 flex-wrap">
              {doc.category_name && !editing && (
                <span className="px-2 py-0.5 rounded-full bg-[#3b82f6]/15 text-[#3b82f6]">{doc.category_name}</span>
              )}
              <span>Updated {formatDate(doc.updated_at)} by {doc.updated_by}</span>
              {doc.language === 'he' && <span className="bg-white/5 px-1.5 py-0.5 rounded">עברית</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-sm hover:bg-white/10"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEdit}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 text-sm hover:bg-white/10"
              >
                Edit
              </button>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10"
                  aria-label="More actions"
                >
                  ⋯
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 mt-1 w-48 rounded-lg bg-[#0f172a] border border-white/10 shadow-xl py-1 z-20">
                      <MenuItem onClick={() => { fileInputRef.current?.click(); setMenuOpen(false); }}>
                        Add images…
                      </MenuItem>
                      <MenuItem onClick={() => { window.open(`/api/kb/documents/${id}/export/md`, '_blank'); setMenuOpen(false); }}>
                        Download Markdown
                      </MenuItem>
                      <MenuItem onClick={() => { navigate(`/kb/doc/${id}/history`); setMenuOpen(false); }}>
                        Version History
                      </MenuItem>
                      <div className="h-px bg-white/5 my-1" />
                      <MenuItem danger onClick={() => { setMenuOpen(false); handleDelete(); }}>
                        Delete
                      </MenuItem>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => handleImageUpload(e.target.files)}
      />

      {editing && (
        <div className="mb-4">
          <label className="text-xs text-white/50 mb-1 block">Category</label>
          <input
            list="kb-cats-edit"
            value={draftCategory}
            onChange={(e) => {
              setDraftCategory(e.target.value);
              const match = categories.find((c) => c.name.toLowerCase() === e.target.value.trim().toLowerCase());
              setIsNewCategory(!match && e.target.value.trim().length > 0);
            }}
            className="w-full md:w-80 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm focus:outline-none focus:border-[#3b82f6]/50"
          />
          <datalist id="kb-cats-edit">
            {categories.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
          {isNewCategory && <p className="text-[10px] text-[#2dd4bf] mt-1">New category will be created</p>}
        </div>
      )}

      {uploading && (
        <div className="mb-3 p-2 rounded-lg bg-[#3b82f6]/10 border border-[#3b82f6]/20 text-xs text-[#3b82f6]">
          Uploading images…
        </div>
      )}

      <div className="p-6 rounded-xl bg-white/[0.02] border border-white/10">
        {editing ? (
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            rows={24}
            dir={dir}
            className="w-full bg-transparent text-white/80 text-sm leading-relaxed focus:outline-none resize-y font-mono"
          />
        ) : (
          <MarkdownRenderer content={doc.content_structured} dir={dir} />
        )}
      </div>

      {doc.images?.length > 0 && !editing && (
        <div className="mt-4 p-4 rounded-xl bg-white/[0.02] border border-white/10">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-3">Attached images ({doc.images.length})</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {doc.images.map((img) => (
              <a
                key={img.id}
                href={img.secure_url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg overflow-hidden border border-white/5 hover:border-white/20"
              >
                <img src={img.secure_url} alt={img.original_filename} className="w-full h-24 object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left px-3 py-2 text-sm ${
        danger ? 'text-[#ef4444] hover:bg-[#ef4444]/10' : 'text-white/70 hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );
}

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

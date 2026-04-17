import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import VoiceRecorder from '../../components/kb/VoiceRecorder';
import MarkdownRenderer from '../../components/kb/MarkdownRenderer';

export default function NewDocument() {
  const navigate = useNavigate();
  const [rawText, setRawText] = useState('');
  const [voiceLang, setVoiceLang] = useState('en');
  const [categories, setCategories] = useState([]);
  const [structuring, setStructuring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [structured, setStructured] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [isNewCategory, setIsNewCategory] = useState(false);

  useEffect(() => {
    fetch('/api/kb/categories').then((r) => r.json()).then(setCategories).catch(() => {});
  }, []);

  function appendTranscript(snippet) {
    setRawText((prev) => (prev.trim() ? `${prev.trimEnd()} ${snippet}` : snippet));
  }

  async function handleStructure() {
    if (!rawText.trim()) return;
    setStructuring(true);
    setError(null);
    try {
      const res = await fetch('/api/kb/documents/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || `HTTP ${res.status}`);
      setStructured(data);
      setTitle(data.suggested_title || '');
      setCategory(data.suggested_category || '');
      setIsNewCategory(!!data.is_new_category);
    } catch (err) {
      setError(err.message || 'Structuring failed');
    } finally {
      setStructuring(false);
    }
  }

  async function handleSave() {
    if (!structured || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/kb/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category: category.trim() || null,
          is_new_category: isNewCategory,
          content_raw: rawText,
          content_structured: structured.structured_content,
          language: structured.language,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || `HTTP ${res.status}`);
      navigate(`/kb/doc/${data.id}`);
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 pl-16 text-white min-h-screen max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/kb"
          className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 text-white/60"
        >
          ←
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Document</h1>
          <p className="text-white/40 text-sm">Type, paste, or voice-record a process — AI structures it.</p>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 mb-4">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-2">
            <VoiceRecorder onTranscript={appendTranscript} language={voiceLang} />
            <select
              value={voiceLang}
              onChange={(e) => setVoiceLang(e.target.value)}
              className="text-[10px] bg-white/5 border border-white/10 rounded px-1 py-0.5 text-white/50"
              title="Voice language"
            >
              <option value="en">EN</option>
              <option value="he">HE</option>
            </select>
          </div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Describe a process, paste notes, or tap the mic and start talking…"
            rows={10}
            className="flex-1 bg-transparent border-0 text-white placeholder:text-white/30 focus:outline-none resize-none text-sm leading-relaxed"
            dir="auto"
          />
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <button
          onClick={handleStructure}
          disabled={structuring || !rawText.trim()}
          className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {structuring ? 'Structuring…' : structured ? 'Re-structure' : 'Structure This'}
        </button>
        {rawText && (
          <button
            onClick={() => setRawText('')}
            className="px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-sm hover:bg-white/10"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 text-sm text-[#ef4444]">
          {error}
        </div>
      )}

      {structured && (
        <>
          <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-white/50 mb-1 block">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm focus:outline-none focus:border-[#3b82f6]/50"
                dir="auto"
              />
            </label>
            <label className="block">
              <span className="text-xs text-white/50 mb-1 block flex items-center justify-between">
                <span>Category</span>
                {isNewCategory && <span className="text-[10px] text-[#2dd4bf]">new</span>}
              </span>
              <input
                list="kb-cats"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  const match = categories.find((c) => c.name.toLowerCase() === e.target.value.trim().toLowerCase());
                  setIsNewCategory(!match && e.target.value.trim().length > 0);
                }}
                className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm focus:outline-none focus:border-[#3b82f6]/50"
              />
              <datalist id="kb-cats">
                {categories.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </label>
          </div>

          {structured.screenshot_suggestions?.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-[#3b82f6]/5 border border-[#3b82f6]/20">
              <p className="text-xs font-medium text-[#3b82f6] mb-1.5">Screenshot suggestions</p>
              <ul className="text-xs text-white/60 space-y-0.5">
                {structured.screenshot_suggestions.map((s, i) => (
                  <li key={i}>• {s}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mb-4 p-5 rounded-xl bg-white/[0.02] border border-white/10">
            <p className="text-xs text-white/40 uppercase tracking-wider mb-3">Preview</p>
            <MarkdownRenderer
              content={structured.structured_content}
              dir={structured.language === 'he' ? 'rtl' : 'ltr'}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save Document'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

export default function ManusImport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [campaign, setCampaign] = useState(null);
  const [client, setClient] = useState(null);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then((r) => r.json())
      .then((c) => {
        setCampaign(c);
        if (c?.client_id) {
          fetch(`/api/clients/${c.client_id}`)
            .then((r) => r.json())
            .then(setClient)
            .catch(() => {});
        }
      })
      .catch(() => setError('Could not load campaign'));
  }, [id]);

  function onDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const list = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...list]);
  }

  function onPick(e) {
    const list = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...list]);
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleImport() {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const res = await fetch(`/api/campaigns/${id}/import`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.details || data.error || `HTTP ${res.status}`);
        return;
      }
      setResult(data);
      setTimeout(() => navigate(`/social/campaign/${id}`), 1500);
    } catch (err) {
      setError(err?.message || 'network error');
    } finally {
      setUploading(false);
    }
  }

  const imageCount = files.filter((f) => /\.(png|jpe?g|webp|gif|avif|heic|heif)$/i.test(f.name)).length;
  const captionCount = files.filter((f) => /\.(csv|json|md|txt)$/i.test(f.name)).length;
  const zipCount = files.filter((f) => /\.zip$/i.test(f.name)).length;

  return (
    <div className="p-8 pl-16 text-white min-h-screen max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white/60"
        >
          ←
        </button>
        <div>
          <h1 className="text-2xl font-bold">Import from Manus</h1>
          <p className="text-white/40 text-sm">
            {client?.name || 'Client'} · Campaign #{id}
            {campaign?.month ? ` · ${campaign.month}` : ''}
          </p>
        </div>
      </div>

      <div className="mb-6 p-4 rounded-xl bg-white/[0.03] border border-white/10 text-sm text-white/70 space-y-2 leading-relaxed">
        <p><strong className="text-white">What to drop:</strong></p>
        <ul className="list-disc list-inside text-white/50 space-y-1">
          <li>A <span className="text-white/80">ZIP</span> of everything Manus produced, <em>or</em> a folder of loose images</li>
          <li>Images: <code className="text-white/70">.png .jpg .webp .gif</code> — numbers in the filename are treated as the post day (e.g. <code>post_01_single.png</code>, <code>lyrie_wave1_img01_unified_control.png</code>)</li>
          <li>Captions (optional): <code>captions.csv</code> / <code>.json</code> / <code>.md</code>. Without captions the posts still import with empty copy you can fill in later.</li>
          <li>Multiple images sharing a post day become a carousel; filenames containing <em>before</em> + <em>after</em> become a before/after.</li>
        </ul>
      </div>

      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className="cursor-pointer p-10 rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-all text-center"
      >
        <svg className="w-10 h-10 mx-auto mb-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-white/70 text-sm">Drag & drop a ZIP or loose files here, or click to browse</p>
        <p className="text-white/30 text-xs mt-1">Images + optional captions file · up to 200 MB total</p>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onPick} />
      </div>

      {files.length > 0 && (
        <div className="mt-5 p-4 rounded-xl bg-white/[0.03] border border-white/10">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-white">
              {files.length} file{files.length === 1 ? '' : 's'} ready ·{' '}
              <span className="text-white/50">
                {imageCount} image{imageCount === 1 ? '' : 's'}, {captionCount} caption file{captionCount === 1 ? '' : 's'}{zipCount ? `, ${zipCount} zip` : ''}
              </span>
            </p>
            <button onClick={() => setFiles([])} className="text-xs text-white/40 hover:text-white/70">Clear</button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-white/60 py-1 px-2 rounded hover:bg-white/5">
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 ml-3 text-white/30">{Math.round(f.size / 1024)} KB</span>
                <button onClick={() => removeFile(i)} className="ml-2 text-white/30 hover:text-[#ef4444]">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 text-sm text-[#ef4444]">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 p-4 rounded-lg border border-[#2dd4bf]/30 bg-[#2dd4bf]/10 text-sm">
          <p className="text-[#2dd4bf] font-medium">Imported {result.created} posts ✓</p>
          {result.unmatched_images?.length > 0 && (
            <p className="text-white/60 mt-1">{result.unmatched_images.length} image(s) could not be auto-matched to a day — review them in the campaign.</p>
          )}
          <p className="text-white/50 text-xs mt-2">Redirecting to review…</p>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          onClick={handleImport}
          disabled={uploading || files.length === 0}
          className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uploading ? 'Uploading & processing…' : `Import ${files.length || ''} file${files.length === 1 ? '' : 's'}`}
        </button>
        <Link
          to={`/social/client/${campaign?.client_id || ''}`}
          className="px-5 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-sm hover:bg-white/10"
        >
          Edit Brief
        </Link>
      </div>
    </div>
  );
}

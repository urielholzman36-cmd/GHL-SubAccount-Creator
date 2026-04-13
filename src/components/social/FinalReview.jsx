import { useState, useEffect, useCallback } from 'react';

const PILLAR_COLORS = {
  PAIN: 'bg-red-500/20 text-red-300 border-red-500/30',
  SOLUTION: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  AUTHORITY: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  PROOF: 'bg-green-500/20 text-green-300 border-green-500/30',
  CTA: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

function parseImages(imageUrls) {
  if (!imageUrls) return [];
  if (Array.isArray(imageUrls)) return imageUrls;
  try {
    return JSON.parse(imageUrls);
  } catch {
    return imageUrls.split(',').map((s) => s.trim()).filter(Boolean);
  }
}

export default function FinalReview({ campaignId, posts, clientName, onExport }) {
  const [localPosts, setLocalPosts] = useState(posts || []);
  const [saving, setSaving] = useState({});

  useEffect(() => {
    if (posts && posts.length > 0) setLocalPosts(posts);
  }, [posts]);

  const saveField = useCallback(
    async (postId, field, value) => {
      setSaving((prev) => ({ ...prev, [postId]: field }));
      try {
        await fetch(`/api/campaigns/${campaignId}/posts/${postId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        });
        setTimeout(() => setSaving((prev) => ({ ...prev, [postId]: null })), 1200);
      } catch {
        setSaving((prev) => ({ ...prev, [postId]: null }));
      }
    },
    [campaignId]
  );

  function updatePost(postId, field, value) {
    setLocalPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, [field]: value } : p)));
  }

  function downloadCSV() {
    window.open(`/api/campaigns/${campaignId}/csv`, '_blank');
    if (onExport) onExport();
  }

  return (
    <div className="mt-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Final Review</h2>
          <p className="text-sm text-white/40">
            {localPosts.length} posts ready{clientName ? ` for ${clientName}` : ''}
          </p>
        </div>
        <button
          onClick={downloadCSV}
          className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download GHL CSV
        </button>
      </div>

      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {localPosts.map((post) => {
          const images = parseImages(post.image_urls);
          return (
            <div
              key={post.id}
              className="bg-white/5 border border-white/10 rounded-xl p-4"
            >
              <div className="flex gap-4">
                {/* Image thumbnails */}
                <div className="flex-shrink-0">
                  {images.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto max-w-[320px]">
                      {images.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`Post ${post.day_number} image ${i + 1}`}
                          className="w-[150px] h-[150px] object-cover rounded-lg border border-white/10 flex-shrink-0"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="w-[150px] h-[150px] rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                      <span className="text-white/20 text-xs">No image</span>
                    </div>
                  )}
                </div>

                {/* Post details */}
                <div className="flex-1 min-w-0">
                  {/* Badges row */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60 font-mono">
                      Day {post.day_number}
                    </span>
                    {post.post_date && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                        {post.post_date}{post.posting_time ? ` ${post.posting_time}` : ''}
                      </span>
                    )}
                    {post.pillar && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${PILLAR_COLORS[post.pillar] || 'bg-white/10 text-white/60'}`}
                      >
                        {post.pillar}
                      </span>
                    )}
                    {post.post_type && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                        {post.post_type.replace('_', '/')}
                      </span>
                    )}
                    {saving[post.id] && (
                      <span className="text-xs text-emerald-400 ml-auto animate-pulse">Saved</span>
                    )}
                  </div>

                  {/* Title */}
                  <p className="text-sm font-semibold text-white mb-2">
                    {post.concept_title || post.title || 'Untitled'}
                  </p>

                  {/* Caption */}
                  <div className="mb-2">
                    <label className="text-xs text-white/40 block mb-1">Caption</label>
                    <textarea
                      value={post.caption || ''}
                      onChange={(e) => updatePost(post.id, 'caption', e.target.value)}
                      onBlur={(e) => saveField(post.id, 'caption', e.target.value)}
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-xs text-white/80 placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-y"
                    />
                  </div>

                  {/* Hashtags */}
                  <div>
                    <label className="text-xs text-white/40 block mb-1">Hashtags</label>
                    <input
                      type="text"
                      value={post.hashtags || ''}
                      onChange={(e) => updatePost(post.id, 'hashtags', e.target.value)}
                      onBlur={(e) => saveField(post.id, 'hashtags', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/70 placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                      placeholder="#hashtag1 #hashtag2"
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

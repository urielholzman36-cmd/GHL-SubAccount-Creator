import { useState, useEffect, useCallback } from 'react';

const PILLAR_COLORS = {
  PAIN: 'bg-red-500/20 text-red-300 border-red-500/30',
  SOLUTION: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  AUTHORITY: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  PROOF: 'bg-green-500/20 text-green-300 border-green-500/30',
  CTA: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

const TYPE_STYLES = {
  single: 'bg-white/10 text-white/60',
  carousel: 'bg-cyan-500/20 text-cyan-300',
  before_after: 'bg-orange-500/20 text-orange-300',
};

export default function StrategyReview({ campaignId, posts, onApprove }) {
  const [localPosts, setLocalPosts] = useState(posts || []);
  const [expanded, setExpanded] = useState({});
  const [saving, setSaving] = useState({});
  const [approving, setApproving] = useState(false);

  // Sync when posts prop changes (e.g. after refetch)
  useEffect(() => {
    if (posts && posts.length > 0) setLocalPosts(posts);
  }, [posts]);

  const toggleExpand = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

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

  async function handleApprove() {
    setApproving(true);
    try {
      await fetch(`/api/campaigns/${campaignId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      });
      onApprove();
    } catch {
      alert('Failed to approve');
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Strategy Review</h2>
        <span className="text-sm text-white/40">{localPosts.length} posts</span>
      </div>

      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {localPosts.map((post) => (
          <div
            key={post.id}
            className="bg-white/5 border border-white/10 rounded-xl p-4"
          >
            {/* Top row: badges */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/60 font-mono">
                Day {post.day_number}
              </span>
              {post.post_date && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                  {post.post_date}
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
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${TYPE_STYLES[post.post_type] || TYPE_STYLES.single}`}
                >
                  {post.post_type.replace('_', '/')}
                </span>
              )}
              {saving[post.id] && (
                <span className="text-xs text-emerald-400 ml-auto animate-pulse">Saved</span>
              )}
            </div>

            {/* Concept title */}
            <p className="text-sm font-semibold text-white mb-2">{post.concept || post.concept_title || post.title || 'Untitled'}</p>

            {/* Caption - collapsible */}
            <div className="mb-2">
              <button
                onClick={() => toggleExpand(post.id)}
                className="text-xs text-white/40 hover:text-white/60 transition-colors mb-1"
              >
                {expanded[post.id] ? '▾ Caption' : '▸ Caption (click to edit)'}
              </button>
              {expanded[post.id] && (
                <textarea
                  value={post.caption || ''}
                  onChange={(e) => updatePost(post.id, 'caption', e.target.value)}
                  onBlur={(e) => saveField(post.id, 'caption', e.target.value)}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-sm text-white/80 placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-y"
                />
              )}
              {!expanded[post.id] && post.caption && (
                <p className="text-xs text-white/50 truncate">{post.caption}</p>
              )}
            </div>

            {/* Hashtags */}
            <div className="mb-2">
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

            {/* Visual prompt */}
            <div>
              <label className="text-xs text-white/40 block mb-1">Visual Prompt</label>
              <textarea
                value={post.visual_prompt || ''}
                onChange={(e) => updatePost(post.id, 'visual_prompt', e.target.value)}
                onBlur={(e) => saveField(post.id, 'visual_prompt', e.target.value)}
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg p-2.5 text-xs text-white/70 placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-y"
                placeholder="Describe the image to generate..."
              />
            </div>
          </div>
        ))}
      </div>

      {/* Approve button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleApprove}
          disabled={approving}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {approving ? 'Approving...' : 'Approve & Generate Images'}
        </button>
      </div>
    </div>
  );
}

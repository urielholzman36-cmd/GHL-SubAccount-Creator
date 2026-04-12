import { useState } from 'react';

export default function ManusPasteModal({ campaignId, pauseInfo, onContinue, onSkip }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSubmit() {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/campaigns/${campaignId}/manus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manus_research: text }),
      });
      onContinue();
    } catch {
      alert('Failed to submit research');
    } finally {
      setSubmitting(false);
    }
  }

  function copyPrompt() {
    navigator.clipboard.writeText(pauseInfo?.manusPrompt || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0f1629] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-xl font-bold text-white mb-1">Enhance with Manus Research</h2>
        <p className="text-white/50 text-sm mb-5">
          Optional — skip if this client doesn't need social trend data
        </p>

        {/* Research brief */}
        {pauseInfo?.researchBrief && (
          <div className="mb-4">
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">Research Brief</label>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white/70 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {pauseInfo.researchBrief}
            </div>
          </div>
        )}

        {/* Manus prompt */}
        {pauseInfo?.manusPrompt && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-white/40 uppercase tracking-wider">Manus Prompt</label>
              <button
                onClick={copyPrompt}
                className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white/70 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {pauseInfo.manusPrompt}
            </div>
          </div>
        )}

        {/* Paste area */}
        <div className="mb-5">
          <label className="block text-xs text-white/40 uppercase tracking-wider mb-1.5">Paste Manus Output Here</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-y"
            placeholder="Paste the research output from Manus here..."
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onSkip}
            className="px-4 py-2 rounded-lg border border-white/10 text-white/60 text-sm hover:bg-white/5 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';

export default function AwaitingWebsiteBanner({ pauseInfo, onResume, resuming }) {
  const [wpUrl, setWpUrl] = useState('');
  const [wpUsername, setWpUsername] = useState('');
  const [wpPassword, setWpPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const prompt = pauseInfo?.context?.prompt || '';
  const canSubmit = wpUrl.trim() && wpUsername.trim() && wpPassword.trim() && !resuming;

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {}
  }

  function submit() {
    if (!canSubmit) return;
    onResume({
      wp_url: wpUrl.trim(),
      wp_username: wpUsername.trim(),
      wp_password: wpPassword.trim(),
    });
  }

  return (
    <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <p className="text-sm font-bold text-yellow-800">Website creation in progress</p>
      <p className="text-xs text-yellow-700 mt-1">
        Copy this prompt and paste it into the 10Web AI Website Builder. When your site is live,
        enter your WordPress credentials below and click Continue.
      </p>

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-yellow-800">10Web Prompt</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyPrompt}
              className="text-xs font-semibold text-white bg-magenta hover:opacity-90 px-3 py-1 rounded-md"
            >
              {copied ? 'Copied ✓' : 'Copy Prompt'}
            </button>
            <a
              href="https://10web.io/ai-website-builder/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-magenta border border-magenta px-3 py-1 rounded-md hover:bg-magenta hover:text-white transition-colors"
            >
              Open 10Web ↗
            </a>
          </div>
        </div>
        <pre className="bg-white border border-yellow-200 rounded p-2 text-xs text-gray-700 font-mono max-h-48 overflow-auto whitespace-pre-wrap">
          {prompt}
        </pre>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2">
        <input
          type="url"
          value={wpUrl}
          onChange={(e) => setWpUrl(e.target.value)}
          placeholder="WordPress URL (e.g. https://mysite.10web.site)"
          className="text-xs px-2 py-1.5 border border-yellow-300 rounded"
        />
        <input
          type="text"
          value={wpUsername}
          onChange={(e) => setWpUsername(e.target.value)}
          placeholder="WordPress username"
          className="text-xs px-2 py-1.5 border border-yellow-300 rounded"
        />
        <input
          type="password"
          value={wpPassword}
          onChange={(e) => setWpPassword(e.target.value)}
          placeholder="WordPress application password"
          className="text-xs px-2 py-1.5 border border-yellow-300 rounded"
        />
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="mt-3 text-xs font-semibold text-white bg-magenta hover:opacity-90 disabled:opacity-50 px-4 py-1.5 rounded-md"
      >
        {resuming ? 'Resuming…' : 'Continue'}
      </button>
    </div>
  );
}

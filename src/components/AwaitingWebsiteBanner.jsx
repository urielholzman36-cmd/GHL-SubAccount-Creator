import { useState } from 'react';

export default function AwaitingWebsiteBanner({ pauseInfo, onResume, resuming }) {
  const [wpUrl, setWpUrl] = useState('');
  const [wpUsername, setWpUsername] = useState('');
  const [wpPassword, setWpPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const prompt = pauseInfo?.context?.prompt || '';
  const canSubmit = wpUrl.trim() && wpUsername.trim() && wpPassword.trim() && !resuming;

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  const inputClass =
    'w-full text-sm px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white ' +
    'placeholder-white/20 focus:outline-none focus:border-magenta/50 focus:ring-1 focus:ring-magenta/30 transition';

  return (
    <div className="mb-4 glass rounded-xl overflow-hidden">
      {/* Header with gradient accent */}
      <div className="relative px-5 py-4 border-b border-white/5">
        <div className="absolute top-0 left-0 right-0 h-px bg-brand-gradient-r opacity-30" />
        <p className="text-base font-bold text-white">Action Required: Build the Website</p>
        <p className="text-sm text-white/30 mt-0.5">Follow the steps below to create the client's website on 10Web</p>
      </div>

      <div className="px-5 py-5 space-y-6">
        {/* Step 1: Copy Prompt */}
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-magenta/20 border border-magenta/30 text-magenta text-sm font-bold flex items-center justify-center mt-0.5">
            1
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white/80">Copy the AI-generated website prompt</p>
            <p className="text-xs text-white/30 mt-0.5">Custom-built for this client using their business details.</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={copyPrompt}
                className={`text-sm font-semibold px-4 py-2 rounded-lg transition-all ${
                  copied
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-brand-gradient text-white shadow-lg shadow-magenta/20 hover:opacity-90'
                }`}
              >
                {copied ? 'Copied!' : 'Copy Prompt'}
              </button>
              <button
                type="button"
                onClick={() => setShowPrompt(!showPrompt)}
                className="text-sm font-medium text-white/30 border border-white/10 px-4 py-2 rounded-lg hover:bg-white/5 hover:text-white/50 transition"
              >
                {showPrompt ? 'Hide' : 'Preview'}
              </button>
            </div>
            {showPrompt && (
              <pre className="mt-3 bg-white/3 border border-white/5 rounded-lg p-3 text-xs text-white/40 font-mono max-h-60 overflow-auto whitespace-pre-wrap">
                {prompt}
              </pre>
            )}
          </div>
        </div>

        {/* Step 2: Open 10Web */}
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-magenta/20 border border-magenta/30 text-magenta text-sm font-bold flex items-center justify-center mt-0.5">
            2
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white/80">Paste the prompt into 10Web AI Website Builder</p>
            <p className="text-xs text-white/30 mt-0.5">Open 10Web, start a new AI website, and paste the copied prompt.</p>
            <a
              href="https://10web.io/ai-website-builder/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-sm font-semibold text-magenta border border-magenta/30 px-4 py-2 rounded-lg hover:bg-magenta/10 transition"
            >
              Open 10Web
            </a>
          </div>
        </div>

        {/* Step 3: Enter Credentials */}
        <div className="flex gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-magenta/20 border border-magenta/30 text-magenta text-sm font-bold flex items-center justify-center mt-0.5">
            3
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white/80">Enter the WordPress credentials and continue</p>
            <p className="text-xs text-white/30 mt-0.5">Once the site is live, enter the login details below.</p>

            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-white/30 mb-1">WordPress URL</label>
                <input
                  type="url"
                  value={wpUrl}
                  onChange={(e) => setWpUrl(e.target.value)}
                  placeholder="https://mysite.10web.site"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/30 mb-1">Username</label>
                <input
                  type="text"
                  value={wpUsername}
                  onChange={(e) => setWpUsername(e.target.value)}
                  placeholder="admin"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/30 mb-1">Application Password</label>
                <input
                  type="password"
                  value={wpPassword}
                  onChange={(e) => setWpPassword(e.target.value)}
                  placeholder="xxxx xxxx xxxx xxxx"
                  className={inputClass}
                />
                <p className="text-xs text-white/15 mt-1">WP Admin → Users → Application Passwords</p>
              </div>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="mt-4 text-sm font-semibold text-white bg-brand-gradient hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed px-6 py-2.5 rounded-lg shadow-lg shadow-magenta/20 transition"
            >
              {resuming ? 'Resuming…' : 'Continue Onboarding'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

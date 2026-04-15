import { useEffect, useState } from 'react';
import AwaitingWebsiteBanner from './AwaitingWebsiteBanner';

const STEP_NAMES = [
  'Create Sub-Account',
  'Assign Snapshot',
  'Create Pipeline',
  'Configure Calendar',
  'Set Up Automation',
  'Finalize',
];

function StepBadge({ status }) {
  if (status === 'success' || status === 'completed') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-green-500/15 text-green-400">
        Success
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-500/15 text-amber-400">
        Warning
      </span>
    );
  }
  if (status === 'failed' || status === 'error') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-red-500/15 text-red-400">
        Failed
      </span>
    );
  }
  if (status === 'running') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-magenta/15 text-magenta">
        Running
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-white/5 text-white/30">
      {status ?? 'Pending'}
    </span>
  );
}

function CollapsibleCode({ json }) {
  const [open, setOpen] = useState(false);
  let formatted;
  try {
    formatted =
      typeof json === 'string'
        ? JSON.stringify(JSON.parse(json), null, 2)
        : JSON.stringify(json, null, 2);
  } catch {
    formatted = String(json);
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-magenta/70 hover:text-magenta transition-colors"
      >
        {open ? 'Hide API Response' : 'Show API Response'}
      </button>
      {open && (
        <pre className="mt-1 p-3 bg-white/3 border border-white/5 rounded-lg text-xs overflow-auto max-h-48 text-white/50 font-mono">
          {formatted}
        </pre>
      )}
    </div>
  );
}

export default function BuildDetailRow({ buildId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/builds/${buildId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load build details');
        return r.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [buildId]);

  if (loading) {
    return (
      <tr>
        <td colSpan={6} className="bg-white/3 px-6 py-4 text-sm text-white/20 border-b border-white/5">
          Loading steps...
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr>
        <td colSpan={6} className="bg-white/3 px-6 py-4 text-sm text-red-400 border-b border-white/5">
          {error}
        </td>
      </tr>
    );
  }

  const steps = data?.steps ?? [];
  const isPaused = data?.status === 'paused';
  const pauseContext = (() => {
    if (!data?.pause_context) return null;
    try { return JSON.parse(data.pause_context); } catch { return null; }
  })();
  const isAwaitingWebsite = isPaused && pauseContext?.reason === 'awaiting_website';

  async function handleResume() {
    try {
      await fetch(`/api/builds/${buildId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const res = await fetch(`/api/builds/${buildId}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('Resume failed:', err);
    }
  }

  return (
    <tr>
      <td colSpan={6} className="bg-white/3 border-b border-white/5 px-6 py-4">
        {isAwaitingWebsite && (
          <AwaitingWebsiteBanner
            pauseInfo={{ context: pauseContext }}
            onResume={async (payload) => {
              await fetch(`/api/builds/${buildId}/resume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              const res = await fetch(`/api/builds/${buildId}`);
              if (res.ok) setData(await res.json());
            }}
            resuming={false}
            buildId={buildId}
          />
        )}
        {isPaused && !isAwaitingWebsite && (
          <div className="mb-3 glass rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-amber-400">Waiting to continue</p>
              <p className="text-xs text-white/30 mt-0.5">
                This build is paused at step {data?.paused_at_step}. Click Continue to proceed.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResume}
              className="text-sm font-bold px-5 py-2 rounded-lg bg-brand-gradient text-white shadow-lg shadow-magenta/20 hover:opacity-90 transition"
            >
              Continue
            </button>
          </div>
        )}
        <div className="space-y-3">
          {steps.map((step, i) => {
            const name = step.step_name ?? STEP_NAMES[i] ?? `Step ${i + 1}`;
            const startedAt = step.started_at
              ? new Date(step.started_at).toLocaleString()
              : '—';
            const durationSec =
              step.duration_ms != null
                ? (step.duration_ms / 1000).toFixed(1) + 's'
                : '—';

            return (
              <div key={step.id ?? i} className="flex flex-col gap-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-bold text-white/20 w-5 text-right">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-white/70 min-w-36">
                    {name}
                  </span>
                  <StepBadge status={step.status} />
                  <span className="text-xs text-white/20">{startedAt}</span>
                  <span className="text-xs text-white/20">{durationSec}</span>
                </div>
                {step.error_message && (
                  <p className="ml-8 text-xs text-red-400">{step.error_message}</p>
                )}
                {step.api_response && (
                  <div className="ml-8">
                    <CollapsibleCode json={step.api_response} />
                  </div>
                )}
              </div>
            );
          })}
          {steps.length === 0 && (
            <p className="text-sm text-white/20">No step details available.</p>
          )}
        </div>

        {/* Page links + CSS for completed builds */}
        {data?.status === 'completed' && (data?.privacy_policy_url || data?.site_css) && (
          <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap gap-4 items-start">
            {(data.privacy_policy_url || data.terms_url || data.faq_url) && (
              <div className="flex gap-3">
                {data.privacy_policy_url && (
                  <a href={data.privacy_policy_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-accent-teal hover:text-accent-teal/80 transition">PP ↗</a>
                )}
                {data.terms_url && (
                  <a href={data.terms_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-accent-teal hover:text-accent-teal/80 transition">ToS ↗</a>
                )}
                {data.faq_url && (
                  <a href={data.faq_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-accent-teal hover:text-accent-teal/80 transition">FAQ ↗</a>
                )}
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

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
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">
        ✓ Success
      </span>
    );
  }
  if (status === 'failed' || status === 'error') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-600">
        ✗ Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-500">
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
        className="text-xs text-navy underline hover:text-magenta transition-colors"
      >
        {open ? 'Hide API Response' : 'Show API Response'}
      </button>
      {open && (
        <pre className="mt-1 p-3 bg-white border border-gray-200 rounded text-xs overflow-auto max-h-48 text-gray-700 font-mono">
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
        <td colSpan={6} className="bg-gray-50 px-6 py-4 text-sm text-gray-400 border-t">
          Loading steps...
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr>
        <td colSpan={6} className="bg-gray-50 px-6 py-4 text-sm text-red-400 border-t">
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
      // Reload this row's data
      const res = await fetch(`/api/builds/${buildId}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('Resume failed:', err);
    }
  }

  return (
    <tr>
      <td colSpan={6} className="bg-gray-50 border-t px-6 py-4">
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
          />
        )}
        {isPaused && !isAwaitingWebsite && (
          <div className="mb-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-yellow-800">Waiting to continue</p>
              <p className="text-xs text-yellow-700 mt-0.5">
                This build is paused at step {data?.paused_at_step}. Click Continue to proceed.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResume}
              style={{ backgroundColor: '#d6336c', color: '#ffffff' }}
              className="text-sm font-bold px-5 py-2 rounded-md shadow hover:opacity-90"
            >
              ▶ Continue
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
                  <span className="text-xs font-bold text-gray-400 w-5 text-right">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-700 min-w-36">
                    {name}
                  </span>
                  <StepBadge status={step.status} />
                  <span className="text-xs text-gray-400">{startedAt}</span>
                  <span className="text-xs text-gray-400">{durationSec}</span>
                </div>
                {step.error_message && (
                  <p className="ml-8 text-xs text-red-500">{step.error_message}</p>
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
            <p className="text-sm text-gray-400">No step details available.</p>
          )}
        </div>
      </td>
    </tr>
  );
}

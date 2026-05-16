import { useEffect, useState } from 'react';

const STEP_NAMES = ['Create Sub-Account'];

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

  return (
    <tr>
      <td colSpan={6} className="bg-white/3 border-b border-white/5 px-6 py-4">
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

      </td>
    </tr>
  );
}

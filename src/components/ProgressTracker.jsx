import { useState, useEffect } from 'react';
import { useSSE } from '../hooks/useSSE';

const STATUS_CONFIG = {
  pending:   { bg: 'bg-white/5', border: 'border-white/10', text: 'text-white/25', label: 'Pending',  glow: '' },
  running:   { bg: 'bg-magenta/15', border: 'border-magenta/40', text: 'text-magenta', label: 'Running', glow: 'glow-magenta' },
  completed: { bg: 'bg-green-500/15', border: 'border-green-500/40', text: 'text-green-400', label: 'Done', glow: 'glow-green' },
  warning:   { bg: 'bg-amber-500/15', border: 'border-amber-500/40', text: 'text-amber-400', label: 'Warning', glow: 'glow-amber' },
  paused:    { bg: 'bg-amber-500/15', border: 'border-amber-500/40', text: 'text-amber-400', label: 'Waiting', glow: 'glow-amber' },
  failed:    { bg: 'bg-red-500/15', border: 'border-red-500/40', text: 'text-red-400', label: 'Failed', glow: 'glow-red' },
  skipped:   { bg: 'bg-white/5', border: 'border-white/10', text: 'text-white/30', label: 'Skipped', glow: '' },
};

function StepIcon({ status }) {
  if (status === 'running') {
    return (
      <svg className="animate-spin w-5 h-5 text-magenta" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    );
  }
  if (status === 'completed' || status === 'warning') {
    return (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (status === 'paused') {
    return (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </svg>
    );
  }
  if (status === 'failed') {
    return (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  return null;
}

function formatDuration(ms) {
  if (ms == null) return '';
  return (ms / 1000).toFixed(1) + 's';
}

export default function ProgressTracker({ buildId, onRetry }) {
  const { steps, buildStatus, buildResult, reconnect } = useSSE(buildId);

  const completedCount = steps.filter((s) => s.status === 'completed' || s.status === 'warning' || s.status === 'skipped').length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  async function handleRetry(stepNumber) {
    try {
      await fetch(`/api/builds/${buildId}/retry/${stepNumber}`, { method: 'POST' });
      reconnect();
      if (onRetry) onRetry();
    } catch (err) {
      console.error('Retry failed:', err);
    }
  }

  return (
    <div className="space-y-6">
      {/* Overall progress bar */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">Overall Progress</span>
          <span className="text-xs font-bold text-white/50">{completedCount}/{steps.length} steps</span>
        </div>
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-gradient transition-all duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Horizontal step cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {steps.map((step) => {
          const cfg = STATUS_CONFIG[step.status] || STATUS_CONFIG.pending;
          const isActive = step.status === 'running' || step.status === 'paused';
          return (
            <div
              key={step.step}
              className={`rounded-xl border p-4 transition-all duration-300 ${cfg.bg} ${cfg.border} ${cfg.glow} ${
                isActive ? 'scale-[1.02]' : ''
              } ${step.status === 'pending' ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${cfg.text}`}>
                  Step {step.step}
                </span>
                <div className={cfg.text}>
                  <StepIcon status={step.status} />
                </div>
              </div>
              <p className={`text-sm font-semibold ${step.status === 'pending' ? 'text-white/25' : 'text-white/80'}`}>
                {step.name}
              </p>
              <div className="mt-2">
                {step.status === 'pending' && (
                  <p className="text-xs text-white/15">Waiting...</p>
                )}
                {step.status === 'running' && (
                  <p className="text-xs text-magenta/70">In progress...</p>
                )}
                {step.status === 'paused' && (
                  <p className="text-xs text-amber-400/70">Waiting for your input</p>
                )}
                {step.status === 'completed' && step.duration_ms != null && (
                  <p className="text-xs text-green-400/60">Done in {formatDuration(step.duration_ms)}</p>
                )}
                {step.status === 'warning' && (
                  <p className="text-xs text-amber-400/60">Done with warning</p>
                )}
                {step.status === 'failed' && (
                  <div>
                    <p className="text-xs text-red-400/70 break-words">{step.error || 'Failed'}</p>
                    <button
                      onClick={() => handleRetry(step.step)}
                      className="mt-2 text-xs font-semibold text-white bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 transition px-3 py-1 rounded-md"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Build complete */}
      {buildStatus === 'complete' && buildResult && (
        <div className="space-y-4">
          <div className="glass rounded-xl p-5 glow-green">
            <p className="text-base font-bold text-green-400">Sub-Account Created!</p>
            <p className="text-sm text-white/40 mt-1">The GHL sub-account is ready.</p>
            {buildResult.total_duration_ms != null && (
              <p className="text-xs text-white/20 mt-2">
                Total time: {formatDuration(buildResult.total_duration_ms)}
              </p>
            )}
          </div>

          {/* Manual reminder */}
          <div className="glass rounded-xl p-5 border border-amber-500/20">
            <p className="text-sm font-bold text-amber-400">Manual Steps Required</p>
            <ul className="mt-2 space-y-2 text-sm text-white/40">
              <li>1. Go to the sub-account → <strong className="text-white/60">Settings → My Staff</strong> → Add yourself as admin</li>
              <li>2. Install the <strong className="text-white/60">LeadConnector</strong> plugin manually from the GHL sub-account</li>
            </ul>
          </div>

        </div>
      )}

      {/* Build failed */}
      {buildStatus === 'failed' && buildResult && (
        <div className="glass rounded-xl p-5 glow-red">
          <p className="text-base font-bold text-red-400">Build Failed</p>
          {buildResult.error && (
            <p className="text-sm text-red-400/60 mt-1 break-words">{buildResult.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

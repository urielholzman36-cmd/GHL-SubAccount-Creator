import { useState } from 'react';
import { useSSE } from '../hooks/useSSE';

function StepCircle({ status, stepNumber }) {
  if (status === 'pending') {
    return (
      <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 opacity-50">
        <span className="text-xs font-semibold text-gray-500">{stepNumber}</span>
      </div>
    );
  }
  if (status === 'running') {
    return (
      <div className="w-7 h-7 rounded-full bg-magenta flex items-center justify-center flex-shrink-0">
        <svg className="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }
  if (status === 'completed') {
    return (
      <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold">✓</span>
      </div>
    );
  }
  if (status === 'warning') {
    return (
      <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold">!</span>
      </div>
    );
  }
  if (status === 'failed') {
    return (
      <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
        <span className="text-white text-xs font-bold">✗</span>
      </div>
    );
  }
  return null;
}

function formatDuration(ms) {
  if (ms == null) return '';
  return (ms / 1000).toFixed(1) + 's';
}

function phaseStatusLabel(phase) {
  const done = (s) => s.status === 'completed' || s.status === 'warning';
  if (phase.steps.every(done)) return 'Completed';
  if (phase.steps.some((s) => s.status === 'failed')) return 'Failed';
  if (phase.steps.some((s) => s.status === 'running')) return 'In Progress';
  if (phase.steps.every((s) => s.status === 'pending')) return 'Pending';
  return 'In Progress';
}

export default function ProgressTracker({ buildId, onRetry }) {
  const { phases, buildStatus, buildResult, pauseInfo, reconnect } = useSSE(buildId);
  const [resuming, setResuming] = useState(false);

  async function handleRetry(stepNumber) {
    try {
      await fetch(`/api/builds/${buildId}/retry/${stepNumber}`, { method: 'POST' });
      reconnect();
      if (onRetry) onRetry();
    } catch (err) {
      console.error('Retry failed:', err);
    }
  }

  async function handleResume() {
    setResuming(true);
    try {
      await fetch(`/api/builds/${buildId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      reconnect();
    } catch (err) {
      console.error('Resume failed:', err);
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow p-5">
      <h2 className="text-sm font-bold text-navy mb-4">Build Progress</h2>

      {buildStatus === 'paused' && pauseInfo && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm font-bold text-yellow-800">Waiting to continue</p>
          <p className="text-xs text-yellow-700 mt-1">
            {pauseInfo.context?.message || 'This build is paused. Click Continue to proceed.'}
          </p>
          <button
            onClick={handleResume}
            disabled={resuming}
            className="mt-2 text-xs font-semibold text-white bg-magenta hover:opacity-90 disabled:opacity-50 px-4 py-1.5 rounded-md"
          >
            {resuming ? 'Resuming…' : 'Continue'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {phases.map((phase) => (
          <div key={phase.id}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-navy">
                Phase {phase.id}: {phase.name}
              </h3>
              <span className="text-[10px] text-gray-500">{phaseStatusLabel(phase)}</span>
            </div>
            <div className="flex flex-col gap-3 pl-2 border-l-2 border-gray-100">
              {phase.steps.map((step) => (
                <div key={step.step} className={`flex gap-3 items-start ${step.status === 'pending' ? 'opacity-50' : ''}`}>
                  <StepCircle status={step.status} stepNumber={step.step} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-tight ${
                      step.status === 'pending'   ? 'text-gray-500' :
                      step.status === 'running'   ? 'text-magenta' :
                      step.status === 'completed' ? 'text-gray-800' :
                      step.status === 'warning'   ? 'text-gray-800' :
                      step.status === 'failed'    ? 'text-gray-800' : 'text-gray-500'
                    }`}>
                      {step.name}
                    </p>
                    {step.status === 'running' && (
                      <p className="text-xs text-magenta mt-0.5">Running...</p>
                    )}
                    {step.status === 'completed' && step.duration_ms != null && (
                      <p className="text-xs text-green-600 mt-0.5">
                        Completed · {formatDuration(step.duration_ms)}
                      </p>
                    )}
                    {step.status === 'warning' && (
                      <div className="mt-1">
                        <p className="text-xs text-yellow-700 font-semibold">
                          Completed with warning
                        </p>
                        {step.error && (
                          <p className="text-xs text-yellow-600 mt-0.5 break-words">{step.error}</p>
                        )}
                      </div>
                    )}
                    {step.status === 'failed' && (
                      <div className="mt-1">
                        <p className="text-xs text-red-500 break-words">{step.error || 'Step failed'}</p>
                        <button
                          onClick={() => handleRetry(step.step)}
                          className="mt-1.5 text-xs font-semibold text-white bg-magenta hover:opacity-90 transition-opacity px-3 py-1 rounded-md"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {buildStatus === 'complete' && buildResult && (
        <div className="mt-5 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">🎉</span>
            <div>
              <p className="text-sm font-bold text-green-800">Build Complete!</p>
              {buildResult.location_id && (
                <p className="text-xs text-green-700 mt-0.5">
                  Location ID: <span className="font-mono font-semibold">{buildResult.location_id}</span>
                </p>
              )}
              {buildResult.total_duration_ms != null && (
                <p className="text-xs text-green-600 mt-0.5">
                  Total time: {formatDuration(buildResult.total_duration_ms)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {buildStatus === 'failed' && buildResult && (
        <div className="mt-5 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none">⚠️</span>
            <div>
              <p className="text-sm font-bold text-red-800">Build Failed</p>
              {buildResult.error && (
                <p className="text-xs text-red-600 mt-0.5 break-words">{buildResult.error}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

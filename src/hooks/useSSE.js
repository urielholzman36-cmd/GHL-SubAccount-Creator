import { useState, useEffect, useRef } from 'react';

const DEFAULT_PHASES = [
  {
    id: 1,
    name: 'GHL Sub-Account Setup',
    steps: [
      { step: 1, name: 'Create Sub-Account' },
      { step: 2, name: 'Send Welcome Comms' },
    ],
  },
  {
    id: 2,
    name: 'Website Build',
    steps: [
      { step: 3, name: 'Website Creation (Manual)' },
    ],
  },
];

function initialPhases() {
  return DEFAULT_PHASES.map((p) => ({
    ...p,
    steps: p.steps.map((s) => ({ ...s, status: 'pending', duration_ms: null, error: null })),
  }));
}

export function useSSE(buildId) {
  const [phases, setPhases] = useState(initialPhases);
  const [buildStatus, setBuildStatus] = useState(null);
  const [buildResult, setBuildResult] = useState(null);
  const [pauseInfo, setPauseInfo] = useState(null);
  const [connectKey, setConnectKey] = useState(0);
  const eventSourceRef = useRef(null);

  function reconnect() {
    setConnectKey((k) => k + 1);
  }

  useEffect(() => {
    if (!buildId) return;

    setPhases(initialPhases());
    setBuildStatus(null);
    setBuildResult(null);
    setPauseInfo(null);

    const es = new EventSource(`/api/builds/${buildId}/stream`);
    eventSourceRef.current = es;

    const updateStep = (stepNumber, patch) => {
      setPhases((prev) =>
        prev.map((p) => ({
          ...p,
          steps: p.steps.map((s) => (s.step === stepNumber ? { ...s, ...patch } : s)),
        }))
      );
    };

    es.addEventListener('step-update', (e) => {
      const data = JSON.parse(e.data);
      const patch = { status: data.status };
      if (data.duration_ms != null) patch.duration_ms = data.duration_ms;
      if (data.error != null) patch.error = data.error;
      updateStep(data.step, patch);
    });

    es.addEventListener('build-paused', (e) => {
      const data = JSON.parse(e.data);
      setBuildStatus('paused');
      setPauseInfo({ step: data.step, context: data.context });
    });

    es.addEventListener('build-complete', (e) => {
      const data = JSON.parse(e.data);
      setBuildStatus('complete');
      setBuildResult(data);
      setPauseInfo(null);
      es.close();
    });

    es.addEventListener('build-failed', (e) => {
      const data = JSON.parse(e.data);
      setBuildStatus('failed');
      setBuildResult(data);
      es.close();
    });

    es.onerror = () => {};

    return () => es.close();
  }, [buildId, connectKey]);

  const steps = phases.flatMap((p) => p.steps);

  return { phases, steps, buildStatus, buildResult, pauseInfo, reconnect };
}

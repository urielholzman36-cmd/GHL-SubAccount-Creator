import { useState, useEffect, useRef } from 'react';

const STEP_NAMES = [
  'Create Sub-Account',
  'Provision Phone',
  'Set Custom Values',
  'Create Pipeline',
  'Create Admin User',
  'Send Welcome Comms',
];

export function useSSE(buildId) {
  const [steps, setSteps] = useState(
    STEP_NAMES.map((name, i) => ({ step: i + 1, name, status: 'pending', duration_ms: null, error: null }))
  );
  const [buildStatus, setBuildStatus] = useState(null);
  const [buildResult, setBuildResult] = useState(null);
  const [connectKey, setConnectKey] = useState(0);
  const eventSourceRef = useRef(null);

  function reconnect() {
    setConnectKey(k => k + 1);
  }

  useEffect(() => {
    if (!buildId) return;

    setSteps(STEP_NAMES.map((name, i) => ({ step: i + 1, name, status: 'pending', duration_ms: null, error: null })));
    setBuildStatus(null);
    setBuildResult(null);

    const es = new EventSource(`/api/builds/${buildId}/stream`);
    eventSourceRef.current = es;

    es.addEventListener('step-update', (e) => {
      const data = JSON.parse(e.data);
      setSteps(prev => prev.map(s =>
        s.step === data.step ? { ...s, status: data.status, duration_ms: data.duration_ms || s.duration_ms, error: data.error || s.error } : s
      ));
    });

    es.addEventListener('build-complete', (e) => {
      const data = JSON.parse(e.data);
      setBuildStatus('complete');
      setBuildResult(data);
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

  return { steps, buildStatus, buildResult, reconnect };
}

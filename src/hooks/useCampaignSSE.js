import { useState, useEffect, useCallback, useRef } from 'react';

export default function useCampaignSSE(campaignId) {
  const [status, setStatus] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [stepStatuses, setStepStatuses] = useState({});
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [pauseInfo, setPauseInfo] = useState(null);
  const esRef = useRef(null);

  const connect = useCallback(() => {
    if (!campaignId) return;
    if (esRef.current) esRef.current.close();
    const es = new EventSource(`/api/campaigns/${campaignId}/stream`);
    esRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'state-replay':
          setStatus(data.status);
          setCurrentStep(data.current_step);
          if (data.stepStatuses) setStepStatuses(data.stepStatuses);
          break;
        case 'step-update':
          setStepStatuses(prev => ({ ...prev, [data.step]: data.status }));
          if (data.status === 'running') setCurrentStep(data.step);
          break;
        case 'step-progress':
          setProgress({ step: data.step, current: data.current, total: data.total, message: data.message });
          break;
        case 'campaign-paused':
          setStatus(data.status || 'paused');
          setCurrentStep(data.step);
          setPauseInfo(data);
          break;
        case 'manus-pause':
          setStatus('manus_pause');
          setPauseInfo(data);
          break;
        case 'campaign-complete':
          setStatus('complete');
          es.close();
          break;
        case 'campaign-failed':
          setStatus('failed');
          setError(data.error);
          break;
      }
    };

    es.onerror = () => { es.close(); setTimeout(connect, 3000); };
  }, [campaignId]);

  useEffect(() => {
    connect();
    return () => { if (esRef.current) esRef.current.close(); };
  }, [connect]);

  const reconnect = useCallback(() => {
    if (esRef.current) esRef.current.close();
    setStepStatuses({});
    setProgress(null);
    setError(null);
    setPauseInfo(null);
    connect();
  }, [connect]);

  return { status, currentStep, stepStatuses, progress, error, pauseInfo, reconnect };
}

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useCampaignSSE from '../hooks/useCampaignSSE';
import StrategyReview from '../components/social/StrategyReview';
import FinalReview from '../components/social/FinalReview';
import ManusPasteModal from '../components/social/ManusPasteModal';

const STEPS = [
  { number: 1, name: 'Monthly Brief', phase: 'Setup' },
  { number: 2, name: 'Research', phase: 'Strategy' },
  { number: 3, name: 'Strategy Pack', phase: 'Strategy' },
  { number: 4, name: 'Review Strategy', phase: 'Strategy' },
  { number: 5, name: 'Generate Images', phase: 'Content' },
  { number: 6, name: 'Watermark + Upload', phase: 'Content' },
  { number: 7, name: 'Review Final + Export CSV', phase: 'Content' },
];

const STATUS_ICON = {
  pending: { bg: 'bg-white/10', text: 'text-white/30', ring: '' },
  running: { bg: 'bg-blue-500/20', text: 'text-blue-400', ring: 'ring-2 ring-blue-500/40 animate-pulse' },
  completed: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', ring: '' },
  failed: { bg: 'bg-red-500/20', text: 'text-red-400', ring: '' },
  paused: { bg: 'bg-amber-500/20', text: 'text-amber-400', ring: '' },
};

function StepStatusBadge({ status }) {
  const s = STATUS_ICON[status] || STATUS_ICON.pending;
  const label = (status || 'pending').charAt(0).toUpperCase() + (status || 'pending').slice(1);
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full ${s.bg} ${s.text} ${s.ring}`}>
      {label}
    </span>
  );
}

export default function CampaignDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { status: sseStatus, currentStep, stepStatuses, progress, error, pauseInfo, reconnect } =
    useCampaignSSE(id);

  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);

  // Step 1 form state
  const [month, setMonth] = useState('');
  const [theme, setTheme] = useState('');
  const [startDate, setStartDate] = useState('');
  const [postCount, setPostCount] = useState(30);
  const [starting, setStarting] = useState(false);

  function fetchCampaign() {
    return fetch(`/api/campaigns/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const c = data.campaign || data;
        setCampaign(c);
        if (c.month) setMonth(c.month);
        if (c.theme) setTheme(c.theme);
        if (c.start_date) setStartDate(c.start_date);
        return c;
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchCampaign(); }, [id]);

  // Refetch when SSE status changes (posts are created during pipeline)
  useEffect(() => {
    if (sseStatus && sseStatus !== 'draft') {
      fetchCampaign();
    }
  }, [sseStatus]);

  async function startPipeline() {
    setStarting(true);
    try {
      await fetch(`/api/campaigns/${id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, theme, start_date: startDate, post_count: postCount }),
      });
      reconnect();
    } catch {
      alert('Failed to start pipeline');
    } finally {
      setStarting(false);
    }
  }

  async function retryStep(step) {
    try {
      await fetch(`/api/campaigns/${id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step }),
      });
      reconnect();
    } catch {
      alert('Failed to retry step');
    }
  }

  async function resumeAfterManus() {
    try {
      await fetch(`/api/campaigns/${id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      reconnect();
    } catch {
      alert('Failed to resume');
    }
  }

  function getStepStatus(stepNum) {
    if (stepStatuses[stepNum]) return stepStatuses[stepNum];
    if (currentStep > stepNum) return 'completed';
    if (currentStep === stepNum && (sseStatus === 'running' || sseStatus === 'manus_pause' || sseStatus === 'paused'))
      return stepNum === currentStep && sseStatus === 'manus_pause' ? 'paused' : stepNum === currentStep ? 'running' : 'pending';
    return 'pending';
  }

  function getStepDuration(stepNum) {
    const stepData = campaign?.steps?.[stepNum];
    if (!stepData?.duration) return null;
    return stepData.duration;
  }

  if (loading) return <div className="p-8 pl-16 text-white/50">Loading campaign...</div>;

  const effectiveStatus = sseStatus || campaign?.status || 'draft';
  const isDraft = effectiveStatus === 'draft';
  const isManusP = effectiveStatus === 'manus_pause';
  const isStrategyReview = effectiveStatus === 'review_strategy';
  const isFinalReview = effectiveStatus === 'review_final';

  return (
    <div className="p-8 pl-16 text-white min-h-screen">
      {/* Manus paste overlay */}
      {isManusP && (
        <ManusPasteModal
          campaignId={id}
          pauseInfo={pauseInfo}
          onContinue={() => reconnect()}
          onSkip={() => resumeAfterManus()}
        />
      )}

      {/* Back button + header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            const clientId = campaign?.client_id;
            navigate(clientId ? `/social/client/${clientId}/campaigns` : '/social');
          }}
          className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white/60"
        >
          ←
        </button>
        <div>
          <h1 className="text-2xl font-bold">{campaign?.client_name || 'Campaign'}</h1>
          <p className="text-white/40 text-sm">
            {campaign?.month || 'No month set'}
            {campaign?.theme ? ` — ${campaign.theme}` : ''}
          </p>
        </div>
        <StepStatusBadge status={effectiveStatus === 'complete' ? 'completed' : effectiveStatus} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Step cards */}
      <div className="space-y-3">
        {STEPS.map((step) => {
          const stepStatus = getStepStatus(step.number);
          const duration = getStepDuration(step.number);
          const showProgress =
            (step.number === 5 || step.number === 6) &&
            progress?.step === step.number &&
            stepStatus === 'running';

          return (
            <div
              key={step.number}
              className={`bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 transition-all duration-200 ${
                stepStatus === 'completed'
                  ? 'shadow-sm shadow-emerald-500/20'
                  : stepStatus === 'running'
                  ? 'shadow-sm shadow-blue-500/20 border-blue-500/20'
                  : ''
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Step number circle */}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    stepStatus === 'completed'
                      ? 'bg-gradient-to-br from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white'
                      : stepStatus === 'running'
                      ? 'bg-blue-500/20 text-blue-400 animate-pulse'
                      : stepStatus === 'failed'
                      ? 'bg-red-500/20 text-red-400'
                      : stepStatus === 'paused'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-white/10 text-white/30'
                  }`}
                >
                  {stepStatus === 'completed' ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : step.number}
                </div>

                {/* Name + phase */}
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{step.name}</p>
                  <p className="text-xs text-white/30">{step.phase}</p>
                </div>

                {/* Status badge */}
                <StepStatusBadge status={stepStatus} />

                {/* Duration */}
                {duration && stepStatus === 'completed' && (
                  <span className="text-xs text-white/30">{duration}</span>
                )}

                {/* Retry button */}
                {stepStatus === 'failed' && (
                  <button
                    onClick={() => retryStep(step.number)}
                    className="text-xs px-3 py-1 rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                  >
                    Retry
                  </button>
                )}
              </div>

              {/* Progress bar for steps 5-6 */}
              {showProgress && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-white/40">{progress.message || 'Processing...'}</span>
                    <span className="text-xs text-white/50">
                      {progress.current}/{progress.total}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Step 1 inline form */}
              {step.number === 1 && isDraft && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-white/40 block mb-1">Month</label>
                      <input
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/40 block mb-1">Start Date</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-white/40 block mb-1">Theme</label>
                    <textarea
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-y"
                      placeholder="e.g. Summer fitness motivation, new client offers..."
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/40 block mb-1">Posts</label>
                    <div className="flex gap-2">
                      {[1, 10, 30].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setPostCount(n)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                            postCount === n
                              ? 'bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white'
                              : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/10'
                          }`}
                        >
                          {n === 1 ? '1 (test)' : n === 10 ? '10' : '30 (full)'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={startPipeline}
                    disabled={starting || !month}
                    className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
                  >
                    {starting ? 'Starting...' : `Start Pipeline (${postCount} post${postCount > 1 ? 's' : ''})`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Strategy Review panel */}
      {isStrategyReview && campaign?.posts && (
        <StrategyReview
          campaignId={id}
          posts={campaign.posts}
          onApprove={() => reconnect()}
        />
      )}

      {/* Final Review panel */}
      {isFinalReview && campaign?.posts && (
        <FinalReview
          campaignId={id}
          posts={campaign.posts}
          clientName={campaign.client_name}
          onExport={() => {}}
        />
      )}
    </div>
  );
}

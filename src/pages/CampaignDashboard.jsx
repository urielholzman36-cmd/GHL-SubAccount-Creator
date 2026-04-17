import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useCampaignSSE from '../hooks/useCampaignSSE';
import StrategyReview from '../components/social/StrategyReview';
import FinalReview from '../components/social/FinalReview';
// ManusPasteModal removed — Manus research is now inline on the campaign form

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
  const [manusResearch, setManusResearch] = useState('');
  const [showManus, setShowManus] = useState(false);
  const [starting, setStarting] = useState(false);

  // Campaign-level content strategy (separate plan per campaign)
  const [contentPillars, setContentPillars] = useState(['PAIN', 'SOLUTION', 'AUTHORITY', 'PROOF', 'CTA']);
  const [hashtagBank, setHashtagBank] = useState('');
  const [ctaStyle, setCtaStyle] = useState('');
  const [platformsSel, setPlatformsSel] = useState(['facebook', 'instagram']);
  const [showStrategy, setShowStrategy] = useState(false);

  // Monthly Recap (Mode B)
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapBusy, setRecapBusy] = useState(false);
  const [recapCopied, setRecapCopied] = useState(false);

  async function handleGenerateRecap() {
    const already = !!campaign?.monthly_recap;
    if (already && !window.confirm('This month already has a recap. Regenerate and replace it?')) return;
    setRecapBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/generate-recap`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(`Recap generation failed: ${data.details || data.error || res.status}`);
        return;
      }
      setCampaign((c) => ({
        ...c,
        monthly_recap: data.recap,
        monthly_recap_generated_at: data.generated_at,
      }));
      setRecapOpen(true);
    } catch (err) {
      alert(`Recap generation failed: ${err?.message || 'network error'}`);
    } finally {
      setRecapBusy(false);
    }
  }

  async function handleCopyRecap() {
    if (!campaign?.monthly_recap) return;
    try {
      await navigator.clipboard.writeText(campaign.monthly_recap);
      setRecapCopied(true);
      setTimeout(() => setRecapCopied(false), 1800);
    } catch {
      alert('Copy failed — open it and select manually.');
    }
  }

  function parsePillars(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw) return null;
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : null; } catch { return null; }
  }
  function parsePlatforms(raw) {
    if (Array.isArray(raw)) return raw;
    if (!raw) return null;
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : null; } catch { return null; }
  }
  function hashtagsToSpace(raw) {
    if (!raw) return '';
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v.join(' ') : String(raw); } catch { return String(raw); }
  }

  function fetchCampaign() {
    return fetch(`/api/campaigns/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const c = data.campaign || data;
        setCampaign(c);
        if (c.month) setMonth(c.month);
        if (c.theme) setTheme(c.theme);
        if (c.start_date) setStartDate(c.start_date);
        const p = parsePillars(c.content_pillars);
        if (p && p.length) setContentPillars(p);
        setHashtagBank(hashtagsToSpace(c.hashtag_bank));
        if (c.cta_style) setCtaStyle(c.cta_style);
        const pl = parsePlatforms(c.platforms);
        if (pl && pl.length) setPlatformsSel(pl);
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
        body: JSON.stringify({
          month,
          theme,
          start_date: startDate,
          post_count: postCount,
          manus_research: manusResearch || null,
          content_pillars: JSON.stringify(contentPillars.filter(Boolean)),
          hashtag_bank: JSON.stringify(hashtagBank.split(/\s+/).filter(Boolean)),
          cta_style: ctaStyle,
          platforms: JSON.stringify(platformsSel),
        }),
      });
      reconnect();
    } catch {
      alert('Failed to start pipeline');
    } finally {
      setStarting(false);
    }
  }

  function setPillarAt(idx, val) {
    setContentPillars((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
  }
  function togglePlatform(p) {
    setPlatformsSel((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
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


  // Campaign-level statuses that mean a specific step is actively running.
  // The social-runner writes these to DB when long-running work is in progress
  // (research, strategy gen, image gen, watermarking). Treat them as "running"
  // for the matching step so progress bars render correctly after SSE reconnect.
  const LIVE_STATUSES = {
    researching: 2,
    generating_strategy: 3,
    generating_images: 5,
    watermarking: 6,
  };

  function getStepStatus(stepNum) {
    if (stepStatuses[stepNum]) return stepStatuses[stepNum];
    if (currentStep > stepNum) return 'completed';
    if (LIVE_STATUSES[sseStatus] === stepNum) return 'running';
    if (currentStep === stepNum && (sseStatus === 'running' || sseStatus === 'paused')) return 'running';
    if (currentStep === stepNum && sseStatus === 'manus_pause') return 'paused';
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
  const isStrategyReview = effectiveStatus === 'review_strategy';
  const isFinalReview = effectiveStatus === 'review_final';

  return (
    <div className="p-8 pl-16 text-white min-h-screen">
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
        <div className="flex items-center gap-2">
          <a
            href={`/api/campaigns/${id}/images-zip`}
            className="text-xs font-medium text-white/30 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white/50 hover:bg-white/5 transition"
          >
            Download Images
          </a>
          <button
            onClick={async () => {
              const url = `${window.location.origin}/preview/${id}`;
              try {
                await navigator.clipboard.writeText(url);
                alert('Preview link copied!');
              } catch {
                prompt('Copy this link:', url);
              }
            }}
            className="text-xs font-medium text-white/30 border border-white/10 px-3 py-1.5 rounded-lg hover:text-white/50 hover:bg-white/5 transition"
          >
            Share Preview
          </button>
          <StepStatusBadge status={effectiveStatus === 'complete' ? 'completed' : effectiveStatus} />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Monthly Recap (Mode B) — available once the campaign has posts */}
      {campaign?.posts && campaign.posts.length > 0 && (
        <div className="mb-5 p-5 rounded-xl bg-gradient-to-r from-[#2dd4bf]/5 via-[#3b82f6]/5 to-[#a855f7]/5 border border-white/10">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Monthly Recap</h2>
              <p className="text-xs text-white/50 mt-1">
                End-of-month memory document that Manus reads before planning next month. 9 sections. Pulls every prior recap for this client so repetition risk is cumulative.
              </p>
              {campaign.monthly_recap_generated_at && (
                <p className="text-[11px] text-white/30 mt-1">
                  Generated {new Date(campaign.monthly_recap_generated_at).toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {campaign.monthly_recap && (
                <>
                  <button
                    onClick={handleCopyRecap}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10"
                  >
                    {recapCopied ? 'Copied ✓' : 'Copy'}
                  </button>
                  <a
                    href={`/api/campaigns/${id}/recap.md`}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10"
                  >
                    Download .md
                  </a>
                </>
              )}
              <button
                onClick={() => setRecapOpen((o) => !o)}
                disabled={!campaign.monthly_recap}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10 disabled:opacity-40"
              >
                {recapOpen ? 'Hide' : 'View'}
              </button>
              <button
                onClick={handleGenerateRecap}
                disabled={recapBusy}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40"
              >
                {recapBusy ? 'Generating…' : campaign.monthly_recap ? 'Regenerate' : 'Generate Recap'}
              </button>
            </div>
          </div>
          {recapOpen && campaign.monthly_recap && (
            <pre className="mt-3 p-4 rounded-lg bg-black/40 border border-white/5 text-white/80 text-xs leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-[420px] overflow-y-auto font-mono">
{campaign.monthly_recap}
            </pre>
          )}
        </div>
      )}

      {/* Step cards */}
      <div className="space-y-3">
        {STEPS.map((step) => {
          const stepStatus = getStepStatus(step.number);
          const duration = getStepDuration(step.number);
          const showProgress =
            (step.number === 2 || step.number === 3 || step.number === 5 || step.number === 6) &&
            stepStatus === 'running' &&
            (progress?.step === step.number || !progress);

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

              {/* Progress bar for long-running steps */}
              {showProgress && (() => {
                const cur = progress?.current ?? 0;
                const tot = progress?.total ?? 0;
                const pct = tot > 0 ? Math.min(100, Math.round((cur / tot) * 100)) : null;
                const fallback = step.number === 5
                  ? 'Generating images…'
                  : step.number === 6 ? 'Watermarking & uploading…'
                  : step.number === 3 ? 'Generating strategy…'
                  : 'Running…';
                return (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-white/40">{progress?.message || fallback}</span>
                      <span className="text-xs text-white/50">
                        {tot > 0 ? `${cur}/${tot}` : cur > 0 ? `${cur}` : ''}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] rounded-full transition-all duration-500 ${pct == null ? 'animate-pulse' : ''}`}
                        style={{ width: pct != null ? `${pct}%` : '15%' }}
                      />
                    </div>
                  </div>
                );
              })()}

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
                  {/* Content Strategy — per-campaign, seeded from client defaults */}
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                    <button
                      type="button"
                      onClick={() => setShowStrategy(!showStrategy)}
                      className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition-colors cursor-pointer w-full"
                    >
                      <span className={`transition-transform ${showStrategy ? 'rotate-90' : ''}`}>&#9654;</span>
                      <span>Content strategy (pillars, hashtags, CTA, platforms)</span>
                      <span className="text-white/20 ml-auto">seeded from client</span>
                    </button>
                    {showStrategy && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="text-xs text-white/40 block mb-1">Content Pillars (5)</label>
                          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                            {contentPillars.map((p, i) => (
                              <input
                                key={i}
                                value={p}
                                onChange={(e) => setPillarAt(i, e.target.value)}
                                placeholder={`Pillar ${i + 1}`}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                              />
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-white/40 block mb-1">Hashtag Bank (space-separated)</label>
                          <textarea
                            rows={2}
                            value={hashtagBank}
                            onChange={(e) => setHashtagBank(e.target.value)}
                            placeholder="#example1 #example2 #example3"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50 resize-y"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-white/40 block mb-1">CTA Style</label>
                          <input
                            value={ctaStyle}
                            onChange={(e) => setCtaStyle(e.target.value)}
                            placeholder="e.g. DM us to learn more"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-purple-500/50"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-white/40 block mb-1">Platforms</label>
                          <div className="flex flex-wrap gap-3">
                            {['facebook', 'instagram', 'linkedin', 'tiktok'].map((p) => (
                              <label key={p} className="flex items-center gap-2 text-sm text-white/70 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={platformsSel.includes(p)}
                                  onChange={() => togglePlatform(p)}
                                  className="rounded bg-white/10 border-white/20 text-purple-500 focus:ring-purple-500/30"
                                />
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                              </label>
                            ))}
                          </div>
                        </div>
                        <p className="text-xs text-white/30">These override the client's defaults for this campaign only.</p>
                      </div>
                    )}
                  </div>

                  {/* Manus research — casual optional add-on */}
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                    <button
                      type="button"
                      onClick={() => setShowManus(!showManus)}
                      className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition-colors cursor-pointer w-full"
                    >
                      <span className={`transition-transform ${showManus ? 'rotate-90' : ''}`}>&#9654;</span>
                      <span>Have Manus research to add?</span>
                      <span className="text-white/20 ml-auto">optional</span>
                    </button>
                    {showManus && (
                      <div className="mt-3">
                        <textarea
                          value={manusResearch}
                          onChange={(e) => setManusResearch(e.target.value)}
                          rows={4}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50 resize-y"
                          placeholder="Paste Manus AI trend research here — Instagram trends, hashtag data, competitor insights..."
                        />
                        <p className="text-xs text-white/20 mt-1">This gets merged with the AI research to produce better content.</p>
                      </div>
                    )}
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
          onApprove={() => {
            setTimeout(() => {
              fetchCampaign();
              reconnect();
            }, 1000);
          }}
        />
      )}

      {/* Final Review panel */}
      {isFinalReview && campaign?.posts && (
        <FinalReview
          campaignId={id}
          posts={campaign.posts}
          clientName={campaign.client_name}
          onExport={() => {
            setTimeout(() => {
              fetchCampaign();
              reconnect();
            }, 1000);
          }}
        />
      )}
    </div>
  );
}

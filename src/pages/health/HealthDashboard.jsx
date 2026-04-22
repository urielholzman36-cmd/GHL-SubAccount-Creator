import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import HealthGauge from '../../components/health/HealthGauge.jsx';
import StatusBadge from '../../components/health/StatusBadge.jsx';

function SummaryCard({ label, value, accent }) {
  return (
    <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
      <p className="text-white/30 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color: accent || '#fff' }}>{value}</p>
    </div>
  );
}

function AlertBanner({ alerts, onAcknowledge }) {
  if (!alerts.length) return null;
  return (
    <div className="mb-6 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#ef4444]">
          {alerts.length} Active Alert{alerts.length === 1 ? '' : 's'}
        </h3>
      </div>
      <ul className="space-y-2">
        {alerts.slice(0, 5).map(a => (
          <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
            <div className="text-white/80">
              <span className="text-white/40 text-xs uppercase tracking-wide mr-2">{a.rule.replace(/_/g, ' ')}</span>
              {a.message}
            </div>
            <button
              onClick={() => onAcknowledge(a.id)}
              className="shrink-0 text-xs text-white/40 hover:text-white/80"
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClientCard({ row }) {
  return (
    <Link
      to={`/health/${row.id}`}
      className="p-5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all flex flex-col"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-white font-semibold truncate">{row.name}</p>
            {row.has_ghl_api_key && row.location_id ? (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-[#2dd4bf]/10 text-[#2dd4bf] border border-[#2dd4bf]/20 uppercase tracking-wider">Live</span>
            ) : (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 border border-white/10 uppercase tracking-wider">Mock</span>
            )}
          </div>
          <p className="text-white/30 text-xs truncate">{row.industry || 'No industry set'}</p>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="flex items-center gap-4">
        <HealthGauge score={row.score != null ? Number(row.score) : null} status={row.status} size={80} stroke={6} />
        <div className="flex-1 text-xs text-white/40 space-y-1">
          {row.score != null ? (
            <>
              <p>Leads: {row.metric_new_leads}</p>
              <p>Pipeline: {row.metric_pipeline_movement}</p>
              <p>Convos: {row.metric_conversation_activity}</p>
            </>
          ) : (
            <p className="text-white/20">No score yet — run refresh.</p>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function HealthDashboard() {
  const [scores, setScores] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        fetch('/api/health/scores').then(r => r.json()),
        fetch('/api/health/alerts').then(r => r.json()),
      ]);
      setScores(Array.isArray(s) ? s : []);
      setAlerts(Array.isArray(a) ? a : []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/health/refresh', { method: 'POST' });
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAcknowledge(id) {
    await fetch(`/api/health/alerts/${id}/acknowledge`, { method: 'POST' });
    setAlerts(prev => prev.filter(a => a.id !== id));
  }

  const counts = scores.reduce(
    (acc, r) => {
      if (!r.status) acc.unscored++;
      else acc[r.status]++;
      return acc;
    },
    { green: 0, yellow: 0, red: 0, unscored: 0 }
  );
  const avgScore = (() => {
    const scored = scores.filter(r => r.score != null).map(r => Number(r.score));
    if (!scored.length) return '—';
    return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);
  })();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Health Monitor</h1>
          <p className="text-white/30 text-sm mt-1">Per-client health scores, metrics, and churn alerts.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh All'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-2 text-sm text-[#ef4444]">
          {error}
        </div>
      )}

      <AlertBanner alerts={alerts} onAcknowledge={handleAcknowledge} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <SummaryCard label="Total" value={scores.length} />
        <SummaryCard label="Healthy" value={counts.green} accent="#2dd4bf" />
        <SummaryCard label="At Risk" value={counts.yellow} accent="#f59e0b" />
        <SummaryCard label="Critical" value={counts.red} accent="#ef4444" />
        <SummaryCard label="Avg Score" value={avgScore} />
      </div>

      {loading ? (
        <p className="text-white/30 text-sm">Loading health data…</p>
      ) : scores.length === 0 ? (
        <p className="text-white/30 text-sm">No clients found. Add a client first, then run Refresh.</p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scores.map(row => (
            <ClientCard key={row.id} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

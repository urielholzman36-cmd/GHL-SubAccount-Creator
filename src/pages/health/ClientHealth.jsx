import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import HealthGauge from '../../components/health/HealthGauge.jsx';
import StatusBadge from '../../components/health/StatusBadge.jsx';

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const METRIC_LABELS = {
  new_leads: 'New Leads',
  pipeline_movement: 'Pipeline Movement',
  conversation_activity: 'Conversation Activity',
  response_time: 'Response Time',
  appointments_booked: 'Appointments',
  review_requests: 'Review Requests',
};

function MetricBar({ name, metric }) {
  const notTracked = metric?.score == null;
  const score = metric?.score ?? 0;
  const color = notTracked
    ? 'rgba(255,255,255,0.15)'
    : score >= 70 ? '#2dd4bf' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className={notTracked ? 'text-white/40 text-sm' : 'text-white/70 text-sm'}>{name}</span>
        <span className="text-white/30 text-xs">{metric?.label || '—'}</span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: notTracked ? '100%' : `${score}%`, backgroundColor: color, opacity: notTracked ? 0.35 : 1 }}
        />
      </div>
    </div>
  );
}

export default function ClientHealth() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/health/scores/${id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/health/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: id }),
      });
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading && !data) return <div className="p-6 text-white/30 text-sm">Loading…</div>;
  if (!data) return <div className="p-6 text-white/30 text-sm">{error || 'Not found'}</div>;

  const { client, latest, history, alerts, breakdown } = data;
  const metrics = breakdown?.metrics || {};
  const chartData = history.map(h => ({
    date: formatDate(h.calculated_at),
    score: Number(h.score),
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link to="/health" className="text-white/40 hover:text-white/70 text-sm">← Back to Health Monitor</Link>

      <div className="flex items-center justify-between mt-3 mb-6">
        <div className="flex items-center gap-4">
          {client.logo_path ? (
            <img src={`/${client.logo_path}`} alt="" className="w-14 h-14 rounded-xl object-cover bg-white/5" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center text-white/20 text-lg font-bold">
              {(client.name || '?')[0]}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-white">{client.name}</h1>
            <p className="text-white/30 text-sm">{client.industry || 'No industry'}</p>
          </div>
          {latest && <StatusBadge status={latest.status} />}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing…' : 'Refresh Now'}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-2 text-sm text-[#ef4444]">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-[240px_1fr] gap-6 mb-6">
        <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col items-center justify-center">
          <HealthGauge
            score={latest ? Number(latest.score) : null}
            status={latest?.status}
            size={140}
            stroke={10}
          />
          <p className="text-white/30 text-xs mt-3">
            {latest ? `Updated ${formatDate(latest.calculated_at)}` : 'Not yet scored'}
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">30-Day Trend</h2>
          {chartData.length < 2 ? (
            <p className="text-white/30 text-sm">More history required to draw trend. Trigger Refresh again tomorrow.</p>
          ) : (
            <div style={{ width: '100%', height: 180 }}>
              <ResponsiveContainer>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="healthArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={11} />
                  <YAxis domain={[0, 100]} stroke="rgba(255,255,255,0.3)" fontSize={11} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                    labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
                  />
                  <Area type="monotone" dataKey="score" stroke="#3b82f6" fill="url(#healthArea)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5 space-y-3">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-2">Metric Breakdown</h2>
          {Object.keys(metrics).length === 0 ? (
            <p className="text-white/30 text-sm">Run Refresh to populate metrics.</p>
          ) : (
            Object.entries(METRIC_LABELS).map(([k, label]) => (
              <MetricBar key={k} name={label} metric={metrics[k]} />
            ))
          )}
        </div>

        <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Recent Alerts</h2>
          {alerts.length === 0 ? (
            <p className="text-white/30 text-sm">No alerts on record.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {alerts.map(a => (
                <li key={a.id} className="flex items-start gap-2">
                  <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${a.acknowledged ? 'bg-white/20' : 'bg-[#ef4444]'}`} />
                  <div>
                    <p className="text-white/70">{a.message}</p>
                    <p className="text-white/30 text-xs mt-0.5">
                      {a.rule.replace(/_/g, ' ')} · {formatDate(a.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

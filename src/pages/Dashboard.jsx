import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../components/health/StatusBadge.jsx';

function StatCard({ label, value, sub, to, accent }) {
  const inner = (
    <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all">
      <p className="text-white/30 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color: accent || '#fff' }}>{value}</p>
      {sub && <p className="text-white/20 text-xs mt-1">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function Dashboard() {
  const [stats, setStats] = useState({ clients: 0, builds: 0, completedBuilds: 0 });
  const [health, setHealth] = useState(null);
  const [needsAttention, setNeedsAttention] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/clients').then(r => r.json()),
      fetch('/api/stats').then(r => r.json()),
      fetch('/api/health/summary').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/health/scores').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/health/alerts').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([clients, buildStats, healthSummary, scores, unackAlerts]) => {
      setStats({
        clients: Array.isArray(clients) ? clients.length : 0,
        builds: buildStats.total || 0,
        completedBuilds: buildStats.successful || 0,
      });
      setHealth(healthSummary);
      setNeedsAttention(
        (Array.isArray(scores) ? scores : [])
          .filter(s => s.status === 'red' || s.status === 'yellow')
          .slice(0, 6)
      );
      setAlerts(Array.isArray(unackAlerts) ? unackAlerts.slice(0, 5) : []);
    }).catch(() => {});
  }, []);

  const healthSub = health
    ? `${health.green} healthy · ${health.yellow} risk · ${health.red} critical`
    : 'Run health refresh';

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-white/30 text-sm mt-1">VO360 Command Center overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Clients" value={stats.clients} to="/clients" />
        <StatCard label="Builds" value={stats.builds} sub={`${stats.completedBuilds || 0} completed`} to="/onboarding" />
        <StatCard
          label="Health"
          value={health ? `${health.green + health.yellow + health.red}/${health.total}` : '—'}
          sub={healthSub}
          to="/health"
        />
        <StatCard
          label="Active Alerts"
          value={health?.unacknowledged_alerts ?? '—'}
          sub={health?.unacknowledged_alerts > 0 ? 'Needs attention' : 'All clear'}
          accent={health?.unacknowledged_alerts > 0 ? '#ef4444' : undefined}
          to="/health"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">Clients Needing Attention</h2>
          {needsAttention.length === 0 ? (
            <p className="text-white/20 text-sm">Everyone looks healthy. Run Refresh in Health Monitor to update.</p>
          ) : (
            <ul className="space-y-2">
              {needsAttention.map(c => (
                <li key={c.id}>
                  <Link
                    to={`/health/${c.id}`}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{c.name}</p>
                      <p className="text-white/30 text-xs truncate">{c.industry || 'No industry'}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-white/50 text-sm font-semibold">{c.score}</span>
                      <StatusBadge status={c.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">Active Alerts</h2>
          {alerts.length === 0 ? (
            <p className="text-white/20 text-sm">No unacknowledged alerts.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map(a => (
                <li key={a.id} className="py-2 px-3 rounded-lg hover:bg-white/5">
                  <p className="text-white/80 text-sm">{a.message}</p>
                  <p className="text-white/30 text-xs mt-0.5">
                    {a.client_name || 'Client'} · {a.rule.replace(/_/g, ' ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

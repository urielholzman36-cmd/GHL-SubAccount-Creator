import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

function StatCard({ label, value, sub, to }) {
  const inner = (
    <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all">
      <p className="text-white/30 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-white/20 text-xs mt-1">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function Dashboard() {
  const [stats, setStats] = useState({ clients: 0, builds: 0 });

  useEffect(() => {
    Promise.all([
      fetch('/api/clients').then(r => r.json()),
      fetch('/api/stats').then(r => r.json()),
    ]).then(([clients, buildStats]) => {
      setStats({
        clients: Array.isArray(clients) ? clients.length : 0,
        builds: buildStats.total || 0,
        completedBuilds: buildStats.successful || 0,
      });
    }).catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-white/30 text-sm mt-1">VO360 Command Center overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Clients" value={stats.clients} to="/clients" />
        <StatCard label="Builds" value={stats.builds} sub={`${stats.completedBuilds || 0} completed`} to="/onboarding" />
        <StatCard label="Health" value="—" sub="Coming soon" to="/health" />
        <StatCard label="Reports" value="—" sub="Coming soon" to="/reports" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">Clients Needing Attention</h2>
          <p className="text-white/20 text-sm">Health Monitor data will appear here after Milestone 1.</p>
        </div>
        <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">Recent Activity</h2>
          <p className="text-white/20 text-sm">Activity feed will populate as modules are added.</p>
        </div>
      </div>
    </div>
  );
}

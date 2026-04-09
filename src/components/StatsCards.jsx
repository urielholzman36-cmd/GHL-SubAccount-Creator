import { useEffect, useState } from 'react';

export default function StatsCards() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch stats');
        return r.json();
      })
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  const avgSeconds =
    stats && stats.avg_duration_ms != null
      ? (stats.avg_duration_ms / 1000).toFixed(1) + 's'
      : '—';

  const cards = [
    {
      label: 'Total Builds',
      value: stats ? stats.total ?? 0 : '—',
      glow: 'glow-blue',
      accent: 'text-accent-blue',
    },
    {
      label: 'Successful',
      value: stats ? stats.successful ?? 0 : '—',
      glow: 'glow-green',
      accent: 'text-green-400',
    },
    {
      label: 'Failed',
      value: stats ? stats.failed ?? 0 : '—',
      glow: 'glow-red',
      accent: 'text-red-400',
    },
    {
      label: 'Avg Build Time',
      value: stats ? avgSeconds : '—',
      glow: 'glow-magenta',
      accent: 'text-magenta',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(({ label, value, glow, accent }) => (
        <div
          key={label}
          className={`glass rounded-xl p-5 flex flex-col items-center text-center transition-all duration-300 hover:bg-white/6 ${glow}`}
        >
          <span className={`text-3xl font-bold ${accent}`}>{value}</span>
          <span className="text-xs text-white/30 mt-1 font-medium">{label}</span>
          {error && label === 'Total Builds' && (
            <span className="text-xs text-red-400 mt-1">{error}</span>
          )}
        </div>
      ))}
    </div>
  );
}

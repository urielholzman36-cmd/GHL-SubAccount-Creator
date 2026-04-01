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
      color: 'text-navy',
    },
    {
      label: 'Successful',
      value: stats ? stats.successful ?? 0 : '—',
      color: 'text-green-600',
    },
    {
      label: 'Failed',
      value: stats ? stats.failed ?? 0 : '—',
      color: 'text-red-500',
    },
    {
      label: 'Avg Build Time',
      value: stats ? avgSeconds : '—',
      color: 'text-magenta',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(({ label, value, color }) => (
        <div
          key={label}
          className="bg-white rounded-xl shadow p-5 flex flex-col items-center text-center"
        >
          <span className={`text-3xl font-bold ${color}`}>{value}</span>
          <span className="text-xs text-gray-400 mt-1">{label}</span>
          {error && label === 'Total Builds' && (
            <span className="text-xs text-red-400 mt-1">{error}</span>
          )}
        </div>
      ))}
    </div>
  );
}

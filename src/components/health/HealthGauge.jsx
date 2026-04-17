const COLORS = {
  green: '#2dd4bf',
  yellow: '#f59e0b',
  red: '#ef4444',
  none: '#4b5563',
};

export default function HealthGauge({ score, status, size = 96, stroke = 8 }) {
  const validScore = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : null;
  const color = COLORS[status] || COLORS.none;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = validScore == null ? circumference : circumference * (1 - validScore / 100);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          fill="none"
        />
        {validScore != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 600ms ease' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-bold text-white"
          style={{ fontSize: size * 0.28, color: validScore == null ? 'rgba(255,255,255,0.2)' : '#fff' }}
        >
          {validScore == null ? '—' : validScore}
        </span>
        {validScore != null && (
          <span className="text-[10px] uppercase tracking-widest" style={{ color }}>
            {status}
          </span>
        )}
      </div>
    </div>
  );
}

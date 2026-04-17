const STYLES = {
  green:  'bg-[#2dd4bf]/15 text-[#2dd4bf] border-[#2dd4bf]/30',
  yellow: 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/30',
  red:    'bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/30',
  none:   'bg-white/5 text-white/30 border-white/10',
};

const LABELS = {
  green: 'Healthy',
  yellow: 'At Risk',
  red: 'Critical',
};

export default function StatusBadge({ status }) {
  const style = STYLES[status] || STYLES.none;
  const label = LABELS[status] || 'No Data';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${style}`}>
      {label}
    </span>
  );
}

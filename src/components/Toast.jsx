const icons = {
  success: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const accentColors = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
};

const iconColors = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  info: 'text-blue-400',
};

export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-3 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto max-w-[350px] w-full flex overflow-hidden rounded-lg
            bg-white/5 backdrop-blur-xl border border-white/10 shadow-lg shadow-black/20
            transition-all duration-300 ease-out
            ${t.exiting ? 'translate-x-[120%] opacity-0' : 'translate-x-0 opacity-100 animate-slide-in-right'}`}
        >
          {/* Color accent bar */}
          <div className={`w-1 shrink-0 ${accentColors[t.type] || accentColors.info}`} />

          <div className="flex items-start gap-3 px-4 py-3 flex-1 min-w-0">
            <span className={`mt-0.5 ${iconColors[t.type] || iconColors.info}`}>
              {icons[t.type] || icons.info}
            </span>
            <p className="text-sm text-white/90 leading-snug flex-1 min-w-0 break-words">
              {t.message}
            </p>
            <button
              onClick={() => onDismiss(t.id)}
              className="shrink-0 mt-0.5 text-white/30 hover:text-white/60 transition-colors duration-200"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

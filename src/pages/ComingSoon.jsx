import { useLocation } from 'react-router-dom';

export default function ComingSoon() {
  const { pathname } = useLocation();
  const name = pathname.slice(1).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Page';

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.34-3.08a1.5 1.5 0 010-2.6l5.34-3.08a1.5 1.5 0 011.58 0l5.34 3.08a1.5 1.5 0 010 2.6l-5.34 3.08a1.5 1.5 0 01-1.58 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-white/70 mb-2">{name}</h2>
        <p className="text-sm text-white/30">This module is coming soon.</p>
      </div>
    </div>
  );
}

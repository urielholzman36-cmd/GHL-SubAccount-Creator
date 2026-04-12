import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const menuItems = [
  { label: 'Build', path: '/', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Social Planner', path: '/social', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
];

export default function HamburgerNav() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const close = useCallback(() => setOpen(false), []);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  function handleNav(path) {
    navigate(path);
    close();
  }

  function isActive(path) {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  }

  return (
    <>
      {/* Hamburger button — fixed top-left */}
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="fixed top-5 left-[12.5rem] z-50 w-8 h-8 flex flex-col items-center justify-center gap-1 rounded-lg bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors"
      >
        <span className={`block w-4 h-0.5 bg-white/70 transition-all duration-300 ${open ? 'translate-y-1.5 rotate-45' : ''}`} />
        <span className={`block w-4 h-0.5 bg-white/70 transition-all duration-300 ${open ? 'opacity-0' : ''}`} />
        <span className={`block w-4 h-0.5 bg-white/70 transition-all duration-300 ${open ? '-translate-y-1.5 -rotate-45' : ''}`} />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 z-45 h-full w-64 bg-gradient-to-b from-[#0a1628] to-[#0d1f3c] border-r border-white/10 backdrop-blur-xl transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ zIndex: 45 }}
      >
        {/* Brand header */}
        <div className="px-4 pt-20 pb-6">
          <img src={new URL('../assets/vo360-logo.png', import.meta.url).href} alt="VO360" className="w-36 h-auto" />
          <p className="gradient-text text-xs mt-1.5 font-semibold pl-1">Client Onboarding Hub</p>
        </div>

        <div className="mx-5 h-px bg-brand-gradient-r opacity-20 mb-3" />

        {/* Menu items */}
        <nav className="px-3 space-y-1">
          {menuItems.map(({ label, path, icon }) => (
            <button
              key={path}
              onClick={() => handleNav(path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive(path)
                  ? 'bg-gradient-to-r from-[#2dd4bf]/15 via-[#3b82f6]/15 to-[#a855f7]/15 text-white shadow-sm shadow-[#3b82f6]/20 border border-[#3b82f6]/20'
                  : 'text-white/35 hover:text-white/70 hover:bg-white/4'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
              {label}
            </button>
          ))}
        </nav>
      </div>
    </>
  );
}

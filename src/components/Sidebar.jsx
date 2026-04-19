import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

const overviewItems = [
  { label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1', to: '/' },
  { label: 'Clients', icon: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197', to: '/clients' },
];

const operationsItems = [
  { label: 'Onboarding', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6', to: '/onboarding' },
  { label: 'Page Generator', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', to: '/pages' },
  { label: 'Social Planner', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', to: '/social' },
  { label: 'Health Monitor', icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605', to: '/health' },
  { label: 'Reports', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z', to: '/reports' },
];

const salesItems = [
  { label: 'Proposals', icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25', to: '/proposals' },
];

const internalItems = [
  { label: 'Knowledge Base', icon: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25', to: '/kb' },
  { label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', to: '/settings' },
  { label: 'Users', icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z', to: '/users' },
];

function NavIcon({ d }) {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="px-3 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/20">
      {children}
    </p>
  );
}

function NavItem({ label, icon, to }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-gradient-to-r from-[#2dd4bf]/15 via-[#3b82f6]/15 to-[#a855f7]/15 text-white shadow-sm shadow-[#3b82f6]/20 border border-[#3b82f6]/20'
            : 'text-white/35 hover:text-white/70 hover:bg-white/4',
        ].join(' ')
      }
    >
      <NavIcon d={icon} />
      {label}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }) {
  const { logout } = useAuth();

  function handleLogout() {
    if (onNavigate) onNavigate();
    logout();
  }

  return (
    <>
      <div className="px-4 py-5">
        <img src={new URL('../assets/vo360-logo.png', import.meta.url).href} alt="VO360" className="w-40 h-auto" />
        <p className="gradient-text text-xs mt-1.5 font-semibold pl-1">Command Center</p>
      </div>

      <div className="mx-5 h-px bg-brand-gradient-r opacity-20 mb-1" />

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto" onClick={onNavigate}>
        <SectionLabel>Overview</SectionLabel>
        {overviewItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <SectionLabel>Operations</SectionLabel>
        {operationsItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <SectionLabel>Sales</SectionLabel>
        {salesItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <SectionLabel>Internal</SectionLabel>
        {internalItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      <div className="px-3 pb-5 pt-1">
        <div className="mx-2 h-px bg-white/5 mb-2" />
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg text-sm text-white/25 hover:text-white/50 hover:bg-white/4 transition-all duration-200"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>
    </>
  );
}

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') closeMobile();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, closeMobile]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const sidebarClasses = 'w-56 bg-sidebar/80 backdrop-blur-xl flex flex-col min-h-screen shrink-0 border-r border-white/5';
  const borderStyle = { borderImage: 'linear-gradient(to bottom, rgba(45,212,191,0.15), rgba(59,130,246,0.1), transparent) 1' };

  return (
    <>
      <button
        onClick={() => setMobileOpen((prev) => !prev)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        className="fixed top-4 left-4 z-50 md:hidden w-9 h-9 flex flex-col items-center justify-center gap-1 rounded-lg bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors"
      >
        <span className={`block w-4 h-0.5 bg-white/70 transition-all duration-300 ${mobileOpen ? 'translate-y-1.5 rotate-45' : ''}`} />
        <span className={`block w-4 h-0.5 bg-white/70 transition-all duration-300 ${mobileOpen ? 'opacity-0' : ''}`} />
        <span className={`block w-4 h-0.5 bg-white/70 transition-all duration-300 ${mobileOpen ? '-translate-y-1.5 -rotate-45' : ''}`} />
      </button>

      <div className={`hidden md:flex ${sidebarClasses}`} style={borderStyle}>
        <SidebarContent />
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed top-0 left-0 z-45 h-full md:hidden ${sidebarClasses} transform transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ ...borderStyle, zIndex: 45 }}
      >
        <div className="h-2" />
        <SidebarContent onNavigate={closeMobile} />
      </div>
    </>
  );
}

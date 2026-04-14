import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

const buildItems = [
  { label: 'New Build', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6', to: '/' },
  { label: 'Build History', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', to: '/history' },
];

const socialItems = [
  { label: 'Social Planner', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', to: '/social' },
];

const bottomItems = [
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
      {/* Brand */}
      <div className="px-4 py-5">
        <img src={new URL('../assets/vo360-logo.png', import.meta.url).href} alt="VO360" className="w-40 h-auto" />
        <p className="gradient-text text-xs mt-1.5 font-semibold pl-1">Client Onboarding Hub</p>
      </div>

      {/* Gradient divider */}
      <div className="mx-5 h-px bg-brand-gradient-r opacity-20 mb-1" />

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-0.5" onClick={onNavigate}>
        <SectionLabel>Build</SectionLabel>
        {buildItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <SectionLabel>Social</SectionLabel>
        {socialItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Bottom items */}
      <div className="px-3 pb-2 space-y-0.5" onClick={onNavigate}>
        <div className="mx-2 h-px bg-white/5 mb-2" />
        {bottomItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </div>

      {/* Logout */}
      <div className="px-3 pb-5 pt-1">
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

  // Close on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') closeMobile();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, closeMobile]);

  // Lock body scroll when mobile drawer is open
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
      {/* Mobile hamburger button — only visible below md */}
      <button
        onClick={() => setMobileOpen((prev) => !prev)}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        className="fixed top-4 left-4 z-50 md:hidden w-9 h-9 flex flex-col items-center justify-center gap-1 rounded-lg bg-white/5 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-colors"
      >
        <span className={`block w-4 h-0.5 bg-white/70 transition-all duration-300 ${mobileOpen ? 'translate-y-1.5 rotate-45' : ''}`} />
        <span className={`block w-4 h-0.5 bg-white/70 transition-all duration-300 ${mobileOpen ? 'opacity-0' : ''}`} />
        <span className={`block w-4 h-0.5 bg-white/70 transition-all duration-300 ${mobileOpen ? '-translate-y-1.5 -rotate-45' : ''}`} />
      </button>

      {/* Desktop sidebar — always visible at md+ */}
      <div className={`hidden md:flex ${sidebarClasses}`} style={borderStyle}>
        <SidebarContent />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed top-0 left-0 z-45 h-full md:hidden ${sidebarClasses} transform transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ ...borderStyle, zIndex: 45 }}
      >
        {/* Spacer so content doesn't overlap hamburger */}
        <div className="h-2" />
        <SidebarContent onNavigate={closeMobile} />
      </div>
    </>
  );
}

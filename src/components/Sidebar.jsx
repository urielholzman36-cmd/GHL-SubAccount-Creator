import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

const navItems = [
  { label: 'New Build', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6', to: '/' },
  { label: 'Build History', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', to: '/history' },
  { label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', to: '/settings' },
];

function NavIcon({ d }) {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

export default function Sidebar() {
  const { logout } = useAuth();

  return (
    <div className="w-56 bg-sidebar/80 backdrop-blur-xl flex flex-col min-h-screen shrink-0 border-r border-white/5">
      {/* Brand */}
      <div className="px-4 py-5">
        <img src={new URL('../assets/vo360-logo.png', import.meta.url).href} alt="VO360" className="h-10 w-auto" />
        <p className="text-white/25 text-xs mt-1.5 font-medium pl-1">Client Onboarding Hub</p>
      </div>

      {/* Gradient divider */}
      <div className="mx-5 h-px bg-brand-gradient-r opacity-20 mb-3" />

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map(({ label, icon, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-white/8 text-white shadow-sm shadow-magenta/10'
                  : 'text-white/35 hover:text-white/70 hover:bg-white/4',
              ].join(' ')
            }
          >
            <NavIcon d={icon} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-5 border-t border-white/5">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg text-sm text-white/25 hover:text-white/50 hover:bg-white/4 transition-all duration-200"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Logout
        </button>
      </div>
    </div>
  );
}

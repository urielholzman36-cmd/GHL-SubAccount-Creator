import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

const navItems = [
  { label: '🏗️ New Build', to: '/' },
  { label: '📋 Build History', to: '/history' },
  { label: '⚙️ Settings', to: '/settings' },
];

export default function Sidebar() {
  const { logout } = useAuth();

  return (
    <div className="w-52 bg-sidebar flex flex-col min-h-screen shrink-0">
      {/* Brand */}
      <div className="px-5 py-6">
        <h1 className="text-magenta font-bold text-lg tracking-wide">VO360</h1>
        <p className="text-white/40 text-xs mt-0.5">Client Onboarding Hub</p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map(({ label, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-magenta/20 border-l-2 border-magenta text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/5',
              ].join(' ')
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 py-5">
        <button
          onClick={logout}
          className="w-full text-left px-3 py-2 rounded-md text-sm text-white/40 hover:text-white hover:bg-white/5 transition-colors"
        >
          🚪 Logout
        </button>
      </div>
    </div>
  );
}

# Milestone 0: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Onboarding Hub sidebar, routing, and data model into the foundation for the VO360 Command Center — add Dashboard, Client Detail page, clients table upgrade, and shared services scaffold.

**Architecture:** Evolve the existing `ghl-sub-account-builder` Express + React + Vite + Turso app. Update sidebar navigation to the Command Center structure, add new pages for Dashboard and Client Detail, extend the clients table with unified columns, and scaffold shared service directories.

**Tech Stack:** Express.js, React 19, React Router, Vite, Turso (@libsql/client), Tailwind CSS

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `src/components/Sidebar.jsx` | Restructure nav into OVERVIEW / OPERATIONS / SALES / INTERNAL sections |
| Modify | `src/App.jsx` | Add routes for Dashboard, Clients list, Client detail, and placeholder pages |
| Create | `src/pages/Dashboard.jsx` | Home overview with summary cards, activity feed, alerts |
| Create | `src/pages/ClientList.jsx` | Shared client directory with search/filter |
| Create | `src/pages/ClientDetail.jsx` | Single client profile with quick actions |
| Create | `src/pages/ComingSoon.jsx` | Placeholder for unbuilt modules (Health, KB, Proposals, Reports) |
| Create | `src/components/ClientSelector.jsx` | Shared dropdown for selecting a client (used by future modules) |
| Modify | `server/db/index.js` | Add migration for new client columns |
| Modify | `server/db/queries.js` | Add client CRUD queries (get, list with filters, update) |
| Modify | `server/routes/clients.js` | Add GET /api/clients/:id, PUT /api/clients/:id for detail + edit |
| Create | `server/shared/brand.js` | VO360 brand constants (colors, fonts, logo path) |
| Create | `server/routes/activity.js` | GET /api/activity — recent actions feed |

---

### Task 1: Restructure Sidebar Navigation

**Files:**
- Modify: `src/components/Sidebar.jsx`

- [ ] **Step 1: Replace the navigation item arrays**

Replace the three arrays (`buildItems`, `socialItems`, `bottomItems`) and the nav rendering with the new Command Center structure. Replace lines 5-17 and lines 74-93 of `src/components/Sidebar.jsx`.

Replace the entire file content with:

```jsx
import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

// ── Navigation structure ─────────────────────────────────────────────────────

const overviewItems = [
  { label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1', to: '/' },
  { label: 'Clients', icon: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197', to: '/clients' },
];

const operationsItems = [
  { label: 'Onboarding', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6', to: '/onboarding' },
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

// ── Sub-components ───────────────────────────────────────────────────────────

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

// ── SidebarContent ───────────────────────────────────────────────────────────

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
        <p className="gradient-text text-xs mt-1.5 font-semibold pl-1">Command Center</p>
      </div>

      {/* Gradient divider */}
      <div className="mx-5 h-px bg-brand-gradient-r opacity-20 mb-1" />

      {/* Nav links */}
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

      {/* Logout */}
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

// ── Main Sidebar ─────────────────────────────────────────────────────────────

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
```

- [ ] **Step 2: Verify sidebar renders in dev**

Run: `cd ~/ghl-sub-account-builder && npm run dev`
Open browser to http://localhost:5173 — sidebar should show OVERVIEW, OPERATIONS, SALES, INTERNAL sections. Dashboard and Clients links should be visible. Health Monitor, Reports, Proposals, Knowledge Base links should appear (they'll 404 until we add routes).

- [ ] **Step 3: Commit**

```bash
cd ~/ghl-sub-account-builder
git add src/components/Sidebar.jsx
git commit -m "feat(m0): restructure sidebar for Command Center navigation"
```

---

### Task 2: Update Routes and Add Placeholder Pages

**Files:**
- Modify: `src/App.jsx`
- Create: `src/pages/Dashboard.jsx`
- Create: `src/pages/ClientList.jsx`
- Create: `src/pages/ComingSoon.jsx`

- [ ] **Step 1: Create the ComingSoon placeholder page**

Create `src/pages/ComingSoon.jsx`:

```jsx
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
```

- [ ] **Step 2: Create the ClientList page**

Create `src/pages/ClientList.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function ClientList() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(data => { setClients(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = clients.filter(c =>
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.industry || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Clients</h1>
        <Link
          to="/social/client/new"
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + New Client
        </Link>
      </div>

      <input
        type="text"
        placeholder="Search clients..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full mb-6 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#3b82f6]/50"
      />

      {loading ? (
        <p className="text-white/30 text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-white/30 text-sm">No clients found.</p>
          <p className="text-white/20 text-xs mt-1">Create one via Onboarding or the Social Planner.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(client => (
            <Link
              key={client.id}
              to={`/clients/${client.id}`}
              className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all"
            >
              <div className="flex items-center gap-4">
                {client.logo_path ? (
                  <img src={`/${client.logo_path}`} alt="" className="w-10 h-10 rounded-lg object-cover bg-white/5" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white/20 text-sm font-bold">
                    {(client.name || '?')[0]}
                  </div>
                )}
                <div>
                  <p className="text-white font-medium text-sm">{client.name}</p>
                  <p className="text-white/30 text-xs">{client.industry || 'No industry set'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {client.location && <span className="text-white/20 text-xs">{client.location}</span>}
                <svg className="w-4 h-4 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create a minimal Dashboard page**

Create `src/pages/Dashboard.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

function StatCard({ label, value, sub, to }) {
  const inner = (
    <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all">
      <p className="text-white/30 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-white/20 text-xs mt-1">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function Dashboard() {
  const [stats, setStats] = useState({ clients: 0, builds: 0 });

  useEffect(() => {
    Promise.all([
      fetch('/api/clients').then(r => r.json()),
      fetch('/api/stats').then(r => r.json()),
    ]).then(([clients, buildStats]) => {
      setStats({
        clients: Array.isArray(clients) ? clients.length : 0,
        builds: buildStats.total || 0,
        completedBuilds: buildStats.successful || 0,
      });
    }).catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-white/30 text-sm mt-1">VO360 Command Center overview</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Clients" value={stats.clients} to="/clients" />
        <StatCard label="Builds" value={stats.builds} sub={`${stats.completedBuilds || 0} completed`} to="/onboarding" />
        <StatCard label="Health" value="—" sub="Coming soon" to="/health" />
        <StatCard label="Reports" value="—" sub="Coming soon" to="/reports" />
      </div>

      {/* Placeholder sections */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">Clients Needing Attention</h2>
          <p className="text-white/20 text-sm">Health Monitor data will appear here after Milestone 1.</p>
        </div>
        <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">Recent Activity</h2>
          <p className="text-white/20 text-sm">Activity feed will populate as modules are added.</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update App.jsx with new routes**

Replace `src/App.jsx` with:

```jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import { ToastProvider } from './hooks/useToast.jsx';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ClientList from './pages/ClientList';
import ClientDetail from './pages/ClientDetail';
import NewBuild from './pages/NewBuild';
import BuildHistory from './pages/BuildHistory';
import SocialPlanner from './pages/SocialPlanner';
import ClientProfile from './pages/ClientProfile';
import ClientCampaigns from './pages/ClientCampaigns';
import CampaignDashboard from './pages/CampaignDashboard';
import Users from './pages/Users';
import Settings from './pages/Settings';
import ComingSoon from './pages/ComingSoon';
import Sidebar from './components/Sidebar';
import Spinner from './components/Spinner';

function ProtectedLayout() {
  const { authenticated, username } = useAuth();
  if (authenticated === null)
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center text-white/30">
        <div className="flex items-center gap-3">
          <Spinner />
          <span className="text-sm font-medium">Loading…</span>
        </div>
      </div>
    );
  if (!authenticated) return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-navy flex">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-auto md:ml-0">
        <header className="flex justify-end items-center px-6 py-3 border-b border-white/5">
          <div className="flex items-center gap-4 text-sm">
            {username && <span className="text-white/30">{username}</span>}
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Routes>
            {/* Overview */}
            <Route path="/" element={<Dashboard />} />
            <Route path="/clients" element={<ClientList />} />
            <Route path="/clients/:id" element={<ClientDetail />} />

            {/* Operations */}
            <Route path="/onboarding" element={<NewBuild />} />
            <Route path="/onboarding/history" element={<BuildHistory />} />
            <Route path="/social" element={<SocialPlanner />} />
            <Route path="/social/client/new" element={<ClientProfile />} />
            <Route path="/social/client/:id" element={<ClientProfile />} />
            <Route path="/social/client/:id/campaigns" element={<ClientCampaigns />} />
            <Route path="/social/campaign/:id" element={<CampaignDashboard />} />
            <Route path="/health" element={<ComingSoon />} />
            <Route path="/reports" element={<ComingSoon />} />

            {/* Sales */}
            <Route path="/proposals" element={<ComingSoon />} />

            {/* Internal */}
            <Route path="/kb" element={<ComingSoon />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<Users />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
```

Note: `ClientDetail` is imported but not yet created — that's Task 4. For now, create a one-line stub at `src/pages/ClientDetail.jsx`:

```jsx
export default function ClientDetail() {
  return <div className="p-6 text-white/30">Loading client detail...</div>;
}
```

- [ ] **Step 5: Verify all routes work in dev**

Run dev server. Test: Dashboard (`/`), Clients (`/clients`), Onboarding (`/onboarding`), Social Planner (`/social`), Settings (`/settings`). Health/Reports/Proposals/KB should show "Coming Soon".

- [ ] **Step 6: Commit**

```bash
cd ~/ghl-sub-account-builder
git add src/pages/Dashboard.jsx src/pages/ClientList.jsx src/pages/ClientDetail.jsx src/pages/ComingSoon.jsx src/App.jsx
git commit -m "feat(m0): add Dashboard, ClientList, ComingSoon pages and update routing"
```

---

### Task 3: Upgrade Clients Table Schema

**Files:**
- Modify: `server/db/index.js`

- [ ] **Step 1: Add client column migrations to initializeDb**

In `server/db/index.js`, after the existing M2b migrations block and before the users table creation, add a new migration block. Add this code after the `m2bCols` for-loop closing brace (after the line that closes the M2b migrations):

```js
  // Unified Command Center client columns
  const ccCols = [
    ['contact_name', 'TEXT'],
    ['email', 'TEXT'],
    ['phone', 'TEXT'],
    ['address', 'TEXT'],
    ['city', 'TEXT'],
    ['state', 'TEXT'],
    ['zip', 'TEXT'],
    ['country', 'TEXT DEFAULT \'US\''],
    ['location_id', 'TEXT'],
    ['brand_colors_json', 'TEXT'],
    ['design_style', 'TEXT'],
    ['timezone', 'TEXT DEFAULT \'America/New_York\''],
    ['start_date', 'TEXT'],
    ['active', 'INTEGER DEFAULT 1'],
    ['onboarding_status', 'TEXT DEFAULT \'pending\''],
    ['updated_at', 'DATETIME DEFAULT (datetime(\'now\'))'],
  ];
  const ccColsResult = await db.execute("PRAGMA table_info(clients)");
  const ccExisting = ccColsResult.rows.map(c => c.name);
  for (const [name, type] of ccCols) {
    if (!ccExisting.includes(name)) {
      await db.execute(`ALTER TABLE clients ADD COLUMN ${name} ${type}`);
    }
  }
```

- [ ] **Step 2: Test that the server starts without errors**

Run: `cd ~/ghl-sub-account-builder && node server/index.js`
Expected: Server starts, no migration errors. The new columns are added to the existing clients table.
Verify: `turso db shell onboarding-hub "PRAGMA table_info(clients)"` — should show all new columns.

- [ ] **Step 3: Commit**

```bash
cd ~/ghl-sub-account-builder
git add server/db/index.js
git commit -m "feat(m0): add unified client columns to clients table"
```

---

### Task 4: Client Detail Page and API

**Files:**
- Modify: `server/routes/clients.js`
- Modify: `server/db/social-queries.js`
- Rewrite: `src/pages/ClientDetail.jsx`

- [ ] **Step 1: Add updateClient to use new columns in social-queries.js**

The existing `updateClient` in `server/db/social-queries.js` already supports updating arbitrary client fields via the `CLIENT_FIELDS` allowlist. Add the new fields to the allowlist. Find the `CLIENT_FIELDS` Set at the top of the file and replace it:

```js
const CLIENT_FIELDS = new Set([
  'name', 'industry', 'location', 'website', 'logo_path',
  'cloudinary_folder', 'platforms', 'posting_time', 'brand_tone',
  'brand_description', 'target_audience', 'services', 'content_pillars',
  'hashtag_bank', 'cta_style', 'uses_manus', 'watermark_position',
  'watermark_opacity',
  // Unified Command Center fields
  'contact_name', 'email', 'phone', 'address', 'city', 'state', 'zip',
  'country', 'location_id', 'brand_colors_json', 'design_style',
  'timezone', 'start_date', 'active', 'onboarding_status',
]);
```

- [ ] **Step 2: Build the ClientDetail page**

Replace `src/pages/ClientDetail.jsx` with the full implementation:

```jsx
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-white/30 text-xs uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-white text-sm">{value}</p>
    </div>
  );
}

function QuickAction({ label, to, icon }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-sm hover:bg-white/10 hover:text-white transition-all"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      {label}
    </Link>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/clients/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setClient(data);
          setForm(data);
        }
      });
  }, [id]);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/clients/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setClient({ ...client, ...form });
      setEditing(false);
    }
    setSaving(false);
  }

  if (!client) {
    return <div className="p-6 text-white/30 text-sm">Loading client...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          {client.logo_path ? (
            <img src={`/${client.logo_path}`} alt="" className="w-14 h-14 rounded-xl object-cover bg-white/5" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center text-white/20 text-lg font-bold">
              {(client.name || '?')[0]}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-white">{client.name}</h1>
            <p className="text-white/30 text-sm">{client.industry || 'No industry'}{client.location ? ` — ${client.location}` : ''}</p>
          </div>
        </div>
        <button
          onClick={() => setEditing(!editing)}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/50 text-sm hover:bg-white/10 transition-all"
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        <QuickAction label="Social Planner" to={`/social/client/${id}/campaigns`} icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        <QuickAction label="Health" to="/health" icon="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5" />
        <QuickAction label="Generate Report" to="/reports" icon="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5" />
        <QuickAction label="Create Proposal" to="/proposals" icon="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192" />
      </div>

      {/* Profile Card */}
      {editing ? (
        <div className="p-6 rounded-xl bg-white/[0.03] border border-white/5 space-y-4">
          <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-2">Edit Client</h2>
          <div className="grid grid-cols-2 gap-4">
            {['name', 'industry', 'contact_name', 'email', 'phone', 'website', 'location', 'city', 'state', 'zip', 'timezone'].map(field => (
              <div key={field}>
                <label className="block text-white/30 text-xs uppercase mb-1">{field.replace(/_/g, ' ')}</label>
                <input
                  type="text"
                  value={form[field] || ''}
                  onChange={e => setForm({ ...form, [field]: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#3b82f6]/50"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={() => { setEditing(false); setForm(client); }} className="px-5 py-2 rounded-lg bg-white/5 text-white/50 text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5 space-y-3">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-2">Contact Info</h2>
            <Field label="Contact Name" value={client.contact_name} />
            <Field label="Email" value={client.email} />
            <Field label="Phone" value={client.phone} />
            <Field label="Website" value={client.website} />
            <Field label="Location" value={[client.city, client.state].filter(Boolean).join(', ') || client.location} />
            <Field label="Timezone" value={client.timezone} />
          </div>
          <div className="p-5 rounded-xl bg-white/[0.03] border border-white/5 space-y-3">
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-2">Brand & Services</h2>
            <Field label="Industry" value={client.industry} />
            <Field label="Brand Tone" value={client.brand_tone} />
            <Field label="Target Audience" value={client.target_audience} />
            <Field label="Brand Description" value={client.brand_description} />
            <Field label="Onboarding Status" value={client.onboarding_status} />
            <Field label="Start Date" value={client.start_date} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add PUT /api/clients/:id route for editing**

In `server/routes/clients.js`, the `PUT /:id` route already exists (it handles multipart form uploads for logo). We need to also handle JSON body updates. The existing route uses `uploadLogo` middleware which expects multipart. Add a separate JSON-only update route before the multipart PUT. Find the `router.put('/:id'` route and add this before it:

```js
  // PUT /:id/profile — update client profile (JSON body, no file upload)
  router.put('/:id/profile', async (req, res) => {
    const { id } = req.params;
    const existing = await socialQueries.getClient(db, id);
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    try {
      await socialQueries.updateClient(db, id, req.body);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update client', details: err.message });
    }
  });
```

Then update the `ClientDetail.jsx` save handler to use `/api/clients/${id}/profile` instead of `/api/clients/${id}`.

In `ClientDetail.jsx`, change the fetch URL in `handleSave`:
```js
    const res = await fetch(`/api/clients/${id}/profile`, {
```

- [ ] **Step 4: Verify client detail page works**

Open a client from the Clients list. Profile should show. Click Edit, change a field, save — should persist.

- [ ] **Step 5: Commit**

```bash
cd ~/ghl-sub-account-builder
git add src/pages/ClientDetail.jsx server/routes/clients.js server/db/social-queries.js
git commit -m "feat(m0): add Client Detail page with edit support"
```

---

### Task 5: Shared Brand Service

**Files:**
- Create: `server/shared/brand.js`

- [ ] **Step 1: Create the brand constants file**

Create `server/shared/brand.js`:

```js
/**
 * VO360 brand constants — shared across PDF generators, email templates, and reports.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const brand = {
  name: 'VO360',
  tagline: 'Unified Business Execution',
  website: 'https://vo360.net',
  email: 'hello@vo360.net',

  colors: {
    navy: '#0f172a',
    navyLight: '#1e293b',
    indigo: '#6366f1',
    violet: '#8b5cf6',
    cyan: '#06b6d4',
    teal: '#2dd4bf',
    white: '#ffffff',
    gray: '#94a3b8',
    gradient: ['#2dd4bf', '#3b82f6', '#a855f7'],
  },

  fonts: {
    heading: 'Plus Jakarta Sans',
    body: 'Plus Jakarta Sans',
  },

  /** Returns the logo as a Buffer. Cache it — don't re-read per request. */
  get logoBuffer() {
    if (!this._logoBuffer) {
      try {
        this._logoBuffer = readFileSync(resolve(__dirname, '../../src/assets/vo360-logo.png'));
      } catch {
        this._logoBuffer = null;
      }
    }
    return this._logoBuffer;
  },
  _logoBuffer: null,
};
```

- [ ] **Step 2: Commit**

```bash
mkdir -p ~/ghl-sub-account-builder/server/shared
cd ~/ghl-sub-account-builder
git add server/shared/brand.js
git commit -m "feat(m0): add shared brand constants for VO360"
```

---

### Task 6: Final Verification and Deploy

**Files:** None new — integration test.

- [ ] **Step 1: Test the full flow locally**

Run: `cd ~/ghl-sub-account-builder && npm run dev`

Verify:
1. Dashboard (`/`) shows summary cards with client count and build stats
2. Clients (`/clients`) lists all clients with search
3. Client Detail (`/clients/:id`) shows profile, edit works
4. Onboarding (`/onboarding`) shows the build form (existing)
5. Social Planner (`/social`) works as before
6. Health, Reports, Proposals, KB all show "Coming Soon"
7. Settings and Users still work
8. Sidebar shows all sections: OVERVIEW, OPERATIONS, SALES, INTERNAL

- [ ] **Step 2: Commit any remaining changes**

```bash
cd ~/ghl-sub-account-builder
git add -A
git commit -m "feat(m0): Foundation milestone complete — Command Center shell"
```

- [ ] **Step 3: Deploy to Vercel**

```bash
cd ~/ghl-sub-account-builder
git push origin main
vercel --prod
```

- [ ] **Step 4: Verify production**

Test login at https://ghl-sub-account-builder.vercel.app
Verify Dashboard, Clients list, sidebar navigation all work.

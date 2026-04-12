import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import Login from './pages/Login';
import NewBuild from './pages/NewBuild';
import BuildHistory from './pages/BuildHistory';
import SocialPlanner from './pages/SocialPlanner';
import ClientProfile from './pages/ClientProfile';
import ClientCampaigns from './pages/ClientCampaigns';
import CampaignDashboard from './pages/CampaignDashboard';
import Sidebar from './components/Sidebar';
import HamburgerNav from './components/HamburgerNav';

function ProtectedLayout() {
  const { authenticated, logout } = useAuth();
  if (authenticated === null)
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center text-white/30">
        <div className="flex items-center gap-3">
          <svg className="animate-spin w-5 h-5 text-magenta" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm font-medium">Loading...</span>
        </div>
      </div>
    );
  if (!authenticated) return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-navy flex">
      <HamburgerNav />
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        <header className="flex justify-end items-center px-6 py-3 border-b border-white/5">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/30">Team</span>
            <button
              onClick={logout}
              className="text-white/20 hover:text-white/50 transition-colors text-xs"
            >
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<NewBuild />} />
            <Route path="/history" element={<BuildHistory />} />
            <Route
              path="/settings"
              element={
                <div className="p-6">
                  <h1 className="text-xl font-bold text-white">Settings</h1>
                  <p className="text-white/40 mt-1 text-sm">
                    Snapshot management — coming soon
                  </p>
                </div>
              }
            />
            <Route path="/social" element={<SocialPlanner />} />
            <Route path="/social/client/new" element={<ClientProfile />} />
            <Route path="/social/client/:id" element={<ClientProfile />} />
            <Route path="/social/client/:id/campaigns" element={<ClientCampaigns />} />
            <Route path="/social/campaign/:id" element={<CampaignDashboard />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
    </AuthProvider>
  );
}

import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import { ToastProvider } from './hooks/useToast.jsx';
import Login from './pages/Login';
import NewBuild from './pages/NewBuild';
import BuildHistory from './pages/BuildHistory';
import SocialPlanner from './pages/SocialPlanner';
import ClientProfile from './pages/ClientProfile';
import ClientCampaigns from './pages/ClientCampaigns';
import CampaignDashboard from './pages/CampaignDashboard';
import Users from './pages/Users';
import Settings from './pages/Settings';
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
            <Route path="/" element={<NewBuild />} />
            <Route path="/history" element={<BuildHistory />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<Users />} />
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
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}

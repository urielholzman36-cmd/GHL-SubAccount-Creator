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
import ManusImport from './pages/ManusImport';
import Users from './pages/Users';
import Settings from './pages/Settings';
import ComingSoon from './pages/ComingSoon';
import HealthDashboard from './pages/health/HealthDashboard';
import ClientHealth from './pages/health/ClientHealth';
import KnowledgeList from './pages/kb/KnowledgeList';
import NewDocument from './pages/kb/NewDocument';
import DocumentView from './pages/kb/DocumentView';
import DocumentHistory from './pages/kb/DocumentHistory';
import ProposalsList from './pages/proposals/ProposalsList';
import NewProposal from './pages/proposals/NewProposal';
import ImportClientResearch from './pages/ImportClientResearch';
import CampaignPreview from './pages/CampaignPreview';
import PageGenerator from './pages/PageGenerator';
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
            <Route path="/clients/import" element={<ImportClientResearch />} />
            <Route path="/clients/:id" element={<ClientDetail />} />

            {/* Operations */}
            <Route path="/onboarding" element={<NewBuild />} />
            <Route path="/onboarding/history" element={<BuildHistory />} />
            <Route path="/social" element={<SocialPlanner />} />
            <Route path="/social/client/new" element={<ClientProfile />} />
            <Route path="/social/client/:id" element={<ClientProfile />} />
            <Route path="/social/client/:id/campaigns" element={<ClientCampaigns />} />
            <Route path="/social/campaign/:id" element={<CampaignDashboard />} />
            <Route path="/social/campaign/:id/import" element={<ManusImport />} />
            <Route path="/health" element={<HealthDashboard />} />
            <Route path="/health/:id" element={<ClientHealth />} />
            <Route path="/reports" element={<ComingSoon />} />
            <Route path="/pages" element={<PageGenerator />} />
            <Route path="/pages/:id" element={<PageGenerator />} />

            {/* Sales */}
            <Route path="/proposals" element={<ProposalsList />} />
            <Route path="/proposals/new" element={<NewProposal />} />

            {/* Internal */}
            <Route path="/kb" element={<KnowledgeList />} />
            <Route path="/kb/new" element={<NewDocument />} />
            <Route path="/kb/doc/:id" element={<DocumentView />} />
            <Route path="/kb/doc/:id/history" element={<DocumentHistory />} />
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
          <Route path="/preview/:id" element={<CampaignPreview />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}

import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import Login from './pages/Login';
import NewBuild from './pages/NewBuild';
import BuildHistory from './pages/BuildHistory';
import Sidebar from './components/Sidebar';

function ProtectedLayout() {
  const { authenticated, logout } = useAuth();
  if (authenticated === null)
    return (
      <div className="min-h-screen bg-page-bg flex items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  if (!authenticated) return <Navigate to="/login" />;

  return (
    <div className="min-h-screen bg-page-bg flex">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        <header className="flex justify-end items-center px-6 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>👤 Team</span>
            <button onClick={logout} className="text-gray-400 hover:text-gray-600">
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
                  <h1 className="text-xl font-bold text-navy">Settings</h1>
                  <p className="text-gray-500 mt-1">
                    Snapshot management — coming soon
                  </p>
                </div>
              }
            />
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

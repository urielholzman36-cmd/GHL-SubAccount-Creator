import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SocialPlanner() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [builds, setBuilds] = useState([]);
  const [importing, setImporting] = useState(false);

  function loadClients() {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : data.clients || []))
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadClients(); }, []);

  function openImportModal() {
    setShowImport(true);
    fetch('/api/clients/builds-available')
      .then((r) => r.json())
      .then((data) => setBuilds(Array.isArray(data) ? data : []))
      .catch(() => setBuilds([]));
  }

  async function importBuild(buildId) {
    setImporting(true);
    try {
      const res = await fetch('/api/clients/import-from-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ build_id: buildId }),
      });
      const data = await res.json();
      if (data.id) {
        setShowImport(false);
        navigate(`/social/client/${data.id}/campaigns`);
      }
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      setImporting(false);
    }
  }

  const gradientColors = [
    'from-purple-500 to-pink-500',
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-amber-500',
    'from-rose-500 to-red-500',
    'from-indigo-500 to-violet-500',
  ];

  function getGradient(name) {
    const idx = (name || '').charCodeAt(0) % gradientColors.length;
    return gradientColors[idx];
  }

  return (
    <div className="p-8 pl-16 text-white min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Social Planner</h1>
          <p className="text-white/50 text-sm mt-1">Manage client campaigns and content</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={openImportModal}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors"
          >
            Import from Build
          </button>
          <button
            onClick={() => navigate('/social/client/new')}
            className="px-4 py-2 bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + New Client
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <p className="text-white/50 text-sm">Loading clients...</p>
      )}

      {/* Empty state */}
      {!loading && clients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <span className="text-2xl text-white/30">👤</span>
          </div>
          <p className="text-white/50 mb-4">No clients yet</p>
          <button
            onClick={() => navigate('/social/client/new')}
            className="px-4 py-2 bg-gradient-to-r from-[#2dd4bf] via-[#3b82f6] to-[#a855f7] rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Create your first client
          </button>
        </div>
      )}

      {/* Client grid */}
      {!loading && clients.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients.map((client) => (
            <button
              key={client.id}
              onClick={() => navigate(`/social/client/${client.id}/campaigns`)}
              className="bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 rounded-xl p-5 text-left transition-all group"
            >
              <div className="flex items-center gap-4">
                {/* Logo initial */}
                <div
                  className={`w-12 h-12 rounded-full bg-gradient-to-br ${getGradient(client.name)} flex items-center justify-center text-white font-bold text-lg shrink-0`}
                >
                  {(client.name || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-white group-hover:text-purple-300 transition-colors truncate">
                    {client.name}
                  </h3>
                  {client.industry && (
                    <p className="text-white/40 text-sm truncate">{client.industry}</p>
                  )}
                  {client.location && (
                    <p className="text-white/30 text-xs mt-0.5 truncate">{client.location}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {/* Import from Build Modal */}
      {showImport && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowImport(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-[#0d1f3c] border border-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-white">Import from Build</h2>
                <button onClick={() => setShowImport(false)} className="text-white/40 hover:text-white/80 text-xl">&times;</button>
              </div>
              <p className="text-white/50 text-sm mb-4">Select a build to import as a Social Planner client. All business info, audience, and logo will be carried over.</p>
              {builds.length === 0 ? (
                <p className="text-white/40 text-sm py-8 text-center">No builds found</p>
              ) : (
                <div className="space-y-2">
                  {builds.map((build) => (
                    <button
                      key={build.id}
                      onClick={() => importBuild(build.id)}
                      disabled={importing}
                      className="w-full text-left p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold shrink-0">
                          {(build.business_name || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-white font-medium truncate">{build.business_name}</h3>
                          <p className="text-white/40 text-xs truncate">
                            {[build.industry_text || build.industry, build.city, build.state].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

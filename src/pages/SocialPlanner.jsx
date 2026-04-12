import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SocialPlanner() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data) => setClients(Array.isArray(data) ? data : data.clients || []))
      .catch(() => setClients([]))
      .finally(() => setLoading(false));
  }, []);

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
        <button
          onClick={() => navigate('/social/client/new')}
          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          + New Client
        </button>
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
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
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
    </div>
  );
}

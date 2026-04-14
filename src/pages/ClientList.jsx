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

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const STATUS_STYLES = {
  draft: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  researching: 'bg-blue-500/20 text-blue-300 border-blue-500/30 animate-pulse',
  generating_strategy: 'bg-blue-500/20 text-blue-300 border-blue-500/30 animate-pulse',
  generating_images: 'bg-blue-500/20 text-blue-300 border-blue-500/30 animate-pulse',
  watermarking: 'bg-blue-500/20 text-blue-300 border-blue-500/30 animate-pulse',
  review_strategy: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  review_final: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  exported: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

function statusLabel(s) {
  return (s || 'draft').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ClientCampaigns() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/clients/${id}`).then((r) => r.json()),
      fetch(`/api/campaigns/client/${id}`).then((r) => r.json()),
    ])
      .then(([clientData, campData]) => {
        setClient(clientData.client || clientData);
        setCampaigns(Array.isArray(campData) ? campData : campData.campaigns || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function createCampaign() {
    setCreating(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: Number(id) }),
      });
      const data = await res.json();
      const newId = data.id || data.campaign?.id;
      if (newId) navigate(`/social/campaign/${newId}`);
    } catch {
      alert('Failed to create campaign');
    } finally {
      setCreating(false);
    }
  }

  async function deleteCampaign(campId, e) {
    e.stopPropagation();
    if (!confirm('Delete this campaign? This cannot be undone.')) return;
    try {
      await fetch(`/api/campaigns/${campId}`, { method: 'DELETE' });
      setCampaigns((prev) => prev.filter((c) => c.id !== campId));
    } catch {
      alert('Failed to delete campaign');
    }
  }

  function downloadCSV(campId, e) {
    e.stopPropagation();
    window.open(`/api/campaigns/${campId}/csv`, '_blank');
  }

  if (loading) return <div className="p-8 pl-16 text-white/50">Loading campaigns...</div>;

  return (
    <div className="p-8 pl-16 text-white min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate('/social')}
          className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white/60"
        >
          ←
        </button>
        <div>
          <h1 className="text-2xl font-bold">{client?.name || 'Client'}</h1>
          {client?.industry && <p className="text-white/40 text-sm">{client.industry}</p>}
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between mt-6 mb-6">
        <p className="text-white/40 text-sm">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/social/client/${id}`)}
            className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white/60 hover:bg-white/10 transition-colors"
          >
            Edit Profile
          </button>
          <button
            onClick={createCampaign}
            disabled={creating}
            className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {creating ? 'Creating...' : '+ New Campaign'}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24">
          <p className="text-white/50 mb-4">No campaigns yet</p>
          <button
            onClick={createCampaign}
            disabled={creating}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Create your first campaign
          </button>
        </div>
      )}

      {/* Campaign list */}
      {campaigns.length > 0 && (
        <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-5 py-3 border-b border-white/10 text-xs text-white/40 uppercase tracking-wider">
            <span>Month</span>
            <span>Theme</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {/* Rows */}
          {campaigns.map((camp) => (
            <div
              key={camp.id}
              onClick={() => navigate(`/social/campaign/${camp.id}`)}
              className="grid grid-cols-[1fr_1fr_auto_auto] gap-4 px-5 py-3.5 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors items-center"
            >
              <span className="text-sm text-white/80">{camp.month || '-'}</span>
              <span className="text-sm text-white/60 truncate">{camp.theme || '-'}</span>
              <span
                className={`text-xs px-2.5 py-1 rounded-full border ${STATUS_STYLES[camp.status] || STATUS_STYLES.draft}`}
              >
                {statusLabel(camp.status)}
              </span>
              <div className="flex gap-2">
                {camp.status === 'exported' && (
                  <button
                    onClick={(e) => downloadCSV(camp.id, e)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                  >
                    CSV
                  </button>
                )}
                <button
                  onClick={(e) => deleteCampaign(camp.id, e)}
                  className="text-xs px-2.5 py-1 rounded-lg bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

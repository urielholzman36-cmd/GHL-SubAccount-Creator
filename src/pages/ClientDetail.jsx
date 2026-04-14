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
    const res = await fetch(`/api/clients/${id}/profile`, {
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

      <div className="flex flex-wrap gap-3 mb-8">
        <QuickAction label="Social Planner" to={`/social/client/${id}/campaigns`} icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        <QuickAction label="Health" to="/health" icon="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5" />
        <QuickAction label="Generate Report" to="/reports" icon="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5" />
        <QuickAction label="Create Proposal" to="/proposals" icon="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192" />
      </div>

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

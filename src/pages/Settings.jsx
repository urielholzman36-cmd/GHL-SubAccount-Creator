import { useState, useEffect } from 'react';

const SNAPSHOT_ID = 'SnbFmqepikqgzI5tgEZ6';

export default function Settings() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/settings/status')
      .then((r) => r.json())
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const services = status
    ? [
        { name: 'GHL API', connected: status.ghl },
        { name: 'Anthropic AI', connected: status.anthropic },
        { name: 'Cloudinary', connected: status.cloudinary },
      ]
    : [];

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* Snapshot Management */}
      <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 space-y-3">
        <h2 className="text-lg font-semibold text-white">Snapshot Management</h2>
        <div className="text-sm text-white/60">
          <span className="text-white/40">Current snapshot:</span>{' '}
          <span className="font-mono text-white/80">{SNAPSHOT_ID}</span>
        </div>
        <p className="text-xs text-white/30">Contact admin to change the snapshot ID</p>
      </section>

      {/* API Configuration */}
      <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">API Configuration</h2>
        {loading ? (
          <p className="text-sm text-white/30">Checking connections...</p>
        ) : (
          <div className="space-y-3">
            {services.map((svc) => (
              <div key={svc.name} className="flex items-center gap-3">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    svc.connected
                      ? 'bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]'
                      : 'bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.5)]'
                  }`}
                />
                <span className="text-sm text-white/70">{svc.name}</span>
                <span className="text-xs text-white/30 ml-auto">
                  {svc.connected ? 'Connected' : 'Not configured'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* About */}
      <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 space-y-2">
        <h2 className="text-lg font-semibold text-white">About</h2>
        <div className="text-sm text-white/60 space-y-1">
          <p>
            <span className="text-white/40">Version:</span>{' '}
            <span className="text-white/80">1.0.0</span>
          </p>
          <p className="text-white/40">VO360 Client Onboarding Hub</p>
        </div>
      </section>
    </div>
  );
}

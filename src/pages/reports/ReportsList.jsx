import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../../hooks/useToast.jsx';
import NarrativeEditor from '../../components/NarrativeEditor';

const inputClass = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500/50';
const selectClass = `${inputClass} appearance-none`;

function monthOptions() {
  const out = [];
  const now = new Date();
  now.setUTCDate(1);
  for (let i = 0; i < 18; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' });
    out.push({ value: key, label });
  }
  return out;
}

export default function ReportsList() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const months = useMemo(monthOptions, []);

  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState(searchParams.get('client_id') || '');
  const [month, setMonth] = useState(searchParams.get('month') || '');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    fetch('/api/clients').then((r) => r.json()).then(setClients).catch(() => {});
    fetch('/api/reports/defaults').then((r) => r.json()).then((d) => {
      if (!searchParams.get('month')) setMonth(d.month);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!clientId) { setHistory([]); return; }
    fetch(`/api/reports?client_id=${clientId}`).then((r) => r.json()).then(setHistory).catch(() => {});
  }, [clientId]);

  const selectedClient = clients.find((c) => String(c.id) === String(clientId));
  const canPull = selectedClient && selectedClient.location_id && month;

  async function pullData() {
    if (!canPull) return;
    setLoading(true);
    setReport(null);
    try {
      const res = await fetch('/api/reports/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: Number(clientId), month }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Pull failed');
      setReport(data);
      toast(`Data pulled (${data.data_source}).`, 'success');
      const list = await fetch(`/api/reports?client_id=${clientId}`).then((r) => r.json());
      setHistory(list);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function saveNarrative(narrative) {
    if (!report?.id) return;
    setReport((r) => ({ ...r, narrative_json: JSON.stringify(narrative) }));
    await fetch(`/api/reports/${report.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ narrative }),
    });
  }

  async function buildPdf() {
    if (!report?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${report.id}/build`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Build failed');
      setReport(data);
      toast('PDF built.', 'success');
      const list = await fetch(`/api/reports?client_id=${clientId}`).then((r) => r.json());
      setHistory(list);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function openReport(id) {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Load failed');
      setReport(data);
      if (data.month && data.month !== month) setMonth(data.month);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function deleteReport(id) {
    if (!confirm('Delete this report (including the stored PDF)?')) return;
    const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setHistory((h) => h.filter((r) => r.id !== id));
      if (report?.id === id) setReport(null);
      toast('Deleted.', 'success');
    } else {
      toast('Failed to delete.', 'error');
    }
  }

  const narrative = report?.narrative_json ? JSON.parse(report.narrative_json) : null;
  const data = report?.data_snapshot_json ? JSON.parse(report.data_snapshot_json) : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Reports</h1>
        <p className="text-white/40 text-sm mt-1">Monthly AI-narrated PDF reports for your clients.</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm text-white/60 mb-1">Client</span>
            <select className={selectClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {selectedClient && !selectedClient.location_id && (
              <p className="text-amber-400 text-xs mt-1">This client has no GHL location — connect it first.</p>
            )}
          </label>
          <label className="block">
            <span className="block text-sm text-white/60 mb-1">Month</span>
            <select className={selectClass} value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-end">
          <button
            onClick={pullData}
            disabled={loading || !canPull}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium disabled:opacity-40"
          >
            {loading ? 'Working…' : 'Pull Data'}
          </button>
        </div>
      </div>

      {data && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-2 text-white/80 text-sm">
          <h2 className="font-semibold text-white">Data Snapshot</h2>
          <p>Leads: <span className="font-semibold text-white">{data.leads_count}</span>{data.leads_mom_pct !== null && data.leads_mom_pct !== undefined && (
            <span className="text-white/60"> ({data.leads_mom_pct >= 0 ? '+' : ''}{data.leads_mom_pct}% vs prior)</span>
          )}</p>
          <p>Top source: <span className="font-semibold text-white">{data.lead_sources?.[0]?.source || '—'}</span> ({data.lead_sources?.[0]?.pct || 0}%)</p>
          <p>Appointments: <span className="font-semibold text-white">{data.appointments_booked}</span> · Show rate: <span className="font-semibold text-white">{data.show_rate_pct}%</span> · Converted: <span className="font-semibold text-white">{data.converted_rate_pct}%</span></p>
        </div>
      )}

      {narrative && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <h2 className="font-semibold text-white">Narrative (editable)</h2>
          <NarrativeEditor value={narrative} onChange={saveNarrative} disabled={loading} />
          <div className="flex gap-2 justify-end">
            <button onClick={buildPdf} disabled={loading} className="px-5 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium disabled:opacity-40">
              {loading ? 'Building…' : 'Build PDF'}
            </button>
          </div>
        </div>
      )}

      {report?.pdf_url && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-3">
          <h2 className="font-semibold text-white">PDF</h2>
          <iframe src={report.pdf_url} className="w-full h-[500px] bg-white rounded-lg" title="Report PDF" />
          <div className="flex gap-2 justify-end">
            <a href={report.pdf_url} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm">Download PDF</a>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <h2 className="font-semibold text-white mb-3">Past Reports</h2>
          <div className="space-y-2">
            {history.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5">
                <div className="min-w-0">
                  <p className="text-sm text-white/80">{r.month}</p>
                  <p className="text-xs text-white/40">{r.status} · {new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button onClick={() => openReport(r.id)} className="text-xs text-cyan-300 hover:underline">Open</button>
                  {r.pdf_url && <a href={r.pdf_url} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 hover:underline">Download</a>}
                  <button onClick={() => deleteReport(r.id)} className="text-xs text-red-400 hover:underline">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Pure data-transform: takes raw GHL data (same shape as mock-puller/real-puller output)
// and a 'YYYY-MM' month string, returns a monthly aggregate suitable for the report.

function monthKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function priorMonth(month) {
  const [y, m] = month.split('-').map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, '0')}`;
}

function roundPct(num, den) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

function aggregateSources(contacts) {
  const counts = new Map();
  for (const c of contacts) {
    const src = c.source || 'Unknown';
    counts.set(src, (counts.get(src) || 0) + 1);
  }
  const total = contacts.length;
  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, count]) => ({ source, count, pct: roundPct(count, total) }));
  return sorted;
}

export function buildMonthlyAggregate(raw, month) {
  const contacts = (raw.contacts || []).filter((c) => monthKey(c.dateAdded) === month);
  const appointments = (raw.appointments || []).filter((a) => monthKey(a.startTime) === month);
  const opportunities = (raw.opportunities || []).filter((o) => monthKey(o.updatedAt) === month && o.status === 'won');

  const prior = priorMonth(month);
  const priorContacts = (raw.contacts || []).filter((c) => monthKey(c.dateAdded) === prior);

  const appointmentsShowed = appointments.filter((a) => a.status === 'showed').length;

  return {
    month,
    leads_count: contacts.length,
    lead_sources: aggregateSources(contacts),
    appointments_booked: appointments.length,
    appointments_showed: appointmentsShowed,
    show_rate_pct: roundPct(appointmentsShowed, appointments.length),
    converted_count: opportunities.length,
    converted_rate_pct: roundPct(opportunities.length, contacts.length),
    prior_month: prior,
    prior_leads_count: priorContacts.length,
    leads_mom_pct: priorContacts.length
      ? Math.round(((contacts.length - priorContacts.length) / priorContacts.length) * 100)
      : null,
  };
}

// Convenience: fetch raw data via the provided puller and aggregate for the given month.
// The `puller` is either mockPuller or realPuller (both expose a `pull(locationId, token)` method).
export async function fetchMonthlyAggregate(puller, locationId, token, month) {
  // Pull a wide window so both `month` and `priorMonth(month)` are fully covered.
  const sinceIso = `${priorMonth(month)}-01T00:00:00Z`;
  const raw = await puller.pull({ locationId, token, sinceIso });
  return buildMonthlyAggregate(raw, month);
}

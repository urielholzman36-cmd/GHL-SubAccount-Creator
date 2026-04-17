import { DEFAULT_ALERTS } from './defaults.js';

const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / 864e5;

function maxContactAgeDays(data) {
  if (!data.contacts.length) return Infinity;
  return Math.min(...data.contacts.map(c => daysSince(c.dateAdded)));
}

function daysSinceLastConversation(data) {
  const stamps = [];
  for (const c of data.conversations) {
    if (c.lastInboundAt) stamps.push(daysSince(c.lastInboundAt));
    if (c.lastOutboundAt) stamps.push(daysSince(c.lastOutboundAt));
  }
  return stamps.length ? Math.min(...stamps) : Infinity;
}

const TEMPLATES = {
  score_drop: (name, prev, curr) =>
    `${name}'s health score dropped from ${prev} to ${curr} — a ${prev - curr}-point decline.`,
  critical_zone: (name, score) =>
    `${name} is in the critical zone at ${score}/100. Immediate attention recommended.`,
  zero_leads: (name, days) =>
    `${name} hasn't received a new lead in ${days} days.`,
  dead_conversations: (name, days) =>
    `${name} has had no conversation activity in ${days} days.`,
  recovery: (name, score) =>
    `Good news: ${name} has recovered to a green score of ${score}/100.`,
};

export function checkAlerts(client, prev, curr, rawData, recentAlerts = [], config = DEFAULT_ALERTS) {
  if (!config.enabled) return [];
  const suppressed = new Set(recentAlerts.map(a => `${a.client_id}:${a.rule}`));
  const name = client.name || client.business_name || 'Client';
  const out = [];

  const push = (rule, message) => {
    if (suppressed.has(`${client.id}:${rule}`)) return;
    out.push({ client_id: client.id, rule, message, score_at_alert: curr.score });
  };

  if (prev && (prev.score - curr.score) >= config.rules.score_drop_threshold) {
    push('score_drop', TEMPLATES.score_drop(name, prev.score, curr.score));
  }

  if (curr.score < config.rules.critical_zone_score) {
    push('critical_zone', TEMPLATES.critical_zone(name, curr.score));
  }

  const contactAge = maxContactAgeDays(rawData);
  if (contactAge >= config.rules.zero_leads_days) {
    const d = Math.floor(isFinite(contactAge) ? contactAge : config.rules.zero_leads_days);
    push('zero_leads', TEMPLATES.zero_leads(name, d));
  }

  const convoAge = daysSinceLastConversation(rawData);
  if (convoAge >= config.rules.dead_conversations_days) {
    const d = Math.floor(isFinite(convoAge) ? convoAge : config.rules.dead_conversations_days);
    push('dead_conversations', TEMPLATES.dead_conversations(name, d));
  }

  if (prev && prev.status !== 'green' && curr.score >= 70) {
    push('recovery', TEMPLATES.recovery(name, curr.score));
  }

  return out;
}

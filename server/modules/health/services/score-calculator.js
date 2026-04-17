import { DEFAULT_SCORING } from './defaults.js';

const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / 864e5;

function scoreNewLeads(data, config, niche) {
  const within30 = data.contacts.filter(c => daysSince(c.dateAdded) <= 30).length;
  const baseline = config.niche_baselines[niche]?.avg_monthly_leads ?? 15;
  const ratio = within30 / baseline;
  let score;
  if (within30 === 0) score = 0;
  else if (within30 <= 5) score = 40;
  else if (within30 <= 15) score = 70;
  else score = 100;
  score = Math.min(100, Math.round(score * Math.max(0.8, Math.min(1.2, ratio))));
  return { score, raw_value: within30, label: `${within30} new leads in 30d` };
}

function scorePipelineMovement(data) {
  const moves = data.opportunities.filter(o => daysSince(o.stageChangedAt) <= 30).length;
  let score;
  if (moves === 0) score = 0;
  else if (moves <= 2) score = 40;
  else if (moves <= 5) score = 70;
  else score = 100;
  return { score, raw_value: moves, label: `${moves} stage changes in 30d` };
}

function scoreConversationActivity(data) {
  const latest = data.conversations.map(c => {
    const days = [c.lastInboundAt, c.lastOutboundAt].filter(Boolean).map(daysSince);
    return days.length ? Math.min(...days) : Infinity;
  });
  const minDays = latest.length ? Math.min(...latest) : Infinity;
  let score;
  if (minDays > 14) score = 0;
  else if (minDays > 7) score = 40;
  else if (minDays > 3) score = 70;
  else score = 100;
  const label = minDays === Infinity ? 'No conversations' : `Active ${Math.floor(minDays)}d ago`;
  return { score, raw_value: isFinite(minDays) ? Math.floor(minDays) : 999, label };
}

function scoreResponseTime(data) {
  const values = data.conversations.map(c => c.avgResponseMinutes).filter(x => x != null);
  if (values.length === 0) return { score: null, raw_value: null, label: 'Not tracked' };
  const avgHours = (values.reduce((a, b) => a + b, 0) / values.length) / 60;
  let score;
  if (avgHours > 24) score = 0;
  else if (avgHours > 8) score = 40;
  else if (avgHours > 4) score = 70;
  else if (avgHours > 1) score = 85;
  else score = 100;
  return { score, raw_value: Number(avgHours.toFixed(2)), label: `Avg ${avgHours.toFixed(1)}h response` };
}

function scoreAppointments(data) {
  const within30 = data.appointments.filter(a => daysSince(a.startTime) <= 30).length;
  let score;
  if (within30 === 0) score = 0;
  else if (within30 <= 3) score = 50;
  else if (within30 <= 10) score = 80;
  else score = 100;
  return { score, raw_value: within30, label: `${within30} appointments in 30d` };
}

function scoreReviewRequests(data) {
  const n = data.reviewRequestsSent;
  let score;
  if (n === 0) score = 0;
  else if (n <= 3) score = 70;
  else if (n <= 10) score = 85;
  else score = 100;
  return { score, raw_value: n, label: `${n} review requests sent` };
}

export function calculateScore(data, niche, config = DEFAULT_SCORING) {
  const metrics = {
    new_leads: scoreNewLeads(data, config, niche),
    pipeline_movement: scorePipelineMovement(data),
    conversation_activity: scoreConversationActivity(data),
    response_time: scoreResponseTime(data),
    appointments_booked: scoreAppointments(data),
    review_requests: scoreReviewRequests(data),
  };

  // Weight renormalization: if a metric returns score=null ("not tracked"),
  // drop it from the mix and redistribute its weight proportionally across
  // the remaining metrics. This way a missing signal doesn't unfairly tank
  // an otherwise healthy client.
  const weightMap = {
    new_leads: config.weights.new_leads,
    pipeline_movement: config.weights.pipeline_movement,
    conversation_activity: config.weights.conversation_activity,
    response_time: config.weights.response_time,
    appointments_booked: config.weights.appointments_booked,
    review_requests: config.weights.review_requests,
  };
  const active = Object.entries(weightMap).filter(([k]) => metrics[k].score != null);
  const totalWeight = active.reduce((a, [, w]) => a + w, 0) || 1;
  const weighted = active.reduce(
    (sum, [k, w]) => sum + metrics[k].score * (w / totalWeight),
    0
  );

  const score = Math.round(weighted);
  const { green_min, yellow_min } = config.thresholds;
  const status = score >= green_min ? 'green' : score >= yellow_min ? 'yellow' : 'red';

  return { score, status, metrics };
}

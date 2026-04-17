export const DEFAULT_SCORING = {
  weights: {
    new_leads: 0.25,
    pipeline_movement: 0.20,
    conversation_activity: 0.20,
    response_time: 0.15,
    appointments_booked: 0.10,
    review_requests: 0.10,
  },
  thresholds: { green_min: 70, yellow_min: 40 },
  niche_baselines: {
    plumbing:     { avg_monthly_leads: 15, avg_monthly_appointments: 8 },
    electrical:   { avg_monthly_leads: 12, avg_monthly_appointments: 6 },
    cleaning:     { avg_monthly_leads: 25, avg_monthly_appointments: 15 },
    hvac:         { avg_monthly_leads: 10, avg_monthly_appointments: 5 },
    construction: { avg_monthly_leads: 8,  avg_monthly_appointments: 4 },
    landscaping:  { avg_monthly_leads: 18, avg_monthly_appointments: 10 },
    roofing:      { avg_monthly_leads: 10, avg_monthly_appointments: 5 },
  },
};

export const DEFAULT_ALERTS = {
  enabled: true,
  rules: {
    score_drop_threshold: 15,
    critical_zone_score: 40,
    zero_leads_days: 14,
    dead_conversations_days: 14,
  },
  cooldown_hours: 24,
};

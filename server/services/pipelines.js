const PIPELINE_STAGES = {
  construction: ['New Lead', 'Site Visit', 'Estimate Sent', 'Negotiation', 'Contract Signed', 'In Progress', 'Completed'],
  plumbing: ['Emergency', 'Scheduled', 'Dispatched', 'Completed', 'Invoice Sent', 'Paid'],
  electrical: ['Emergency', 'Scheduled', 'Dispatched', 'Completed', 'Invoice Sent', 'Paid'],
  cleaning: ['New Lead', 'Quote Sent', 'Booked', 'Recurring', 'Cancelled'],
  general: ['New Lead', 'Contacted', 'Estimate Sent', 'Follow Up', 'Won', 'Lost'],
};

export function getStagesForIndustry(industry) {
  const names = PIPELINE_STAGES[industry];
  if (!names) throw new Error(`Unknown industry: ${industry}`);
  return names.map((name, i) => ({ name, position: i }));
}

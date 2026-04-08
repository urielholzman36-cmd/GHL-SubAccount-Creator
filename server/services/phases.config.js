export const PHASES = [
  {
    id: 1,
    name: 'GHL Sub-Account Setup',
    steps: [
      { number: 1, name: 'Create Sub-Account' },
      { number: 2, name: 'Provision Phone' },
      { number: 3, name: 'Set Custom Values' },
      { number: 4, name: 'Create Pipeline' },
      { number: 5, name: 'Create Admin User' },
      { number: 6, name: 'Send Welcome Comms' },
    ],
  },
  {
    id: 2,
    name: 'Website Build',
    steps: [
      { number: 7, name: 'Website Creation (Manual)', pausesForManualInput: true },
    ],
  },
];

export function getAllSteps() {
  return PHASES.flatMap((p) => p.steps);
}

export function getPhaseForStep(stepNumber) {
  for (const p of PHASES) {
    if (p.steps.some((s) => s.number === stepNumber)) return p.id;
  }
  return null;
}

export function getStepName(stepNumber) {
  const step = getAllSteps().find((s) => s.number === stepNumber);
  return step ? step.name : null;
}

export function getTotalStepCount() {
  return getAllSteps().length;
}

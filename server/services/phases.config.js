export const PHASES = [
  {
    id: 1,
    name: 'GHL Sub-Account Setup',
    steps: [
      { number: 1, name: 'Create Sub-Account' },
      { number: 2, name: 'Send Welcome Comms', optional: true },
    ],
  },
  {
    id: 2,
    name: 'Website Build',
    steps: [
      { number: 3, name: 'Website Creation (Manual)', pausesForManualInput: true },
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

export function isStepOptional(stepNumber) {
  const step = getAllSteps().find((s) => s.number === stepNumber);
  return step ? step.optional === true : false;
}

export function getTotalStepCount() {
  return getAllSteps().length;
}

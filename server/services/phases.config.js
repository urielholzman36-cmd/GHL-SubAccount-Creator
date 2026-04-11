export const PHASES = [
  {
    id: 1,
    name: 'GHL Sub-Account Setup',
    steps: [
      { number: 1, name: 'Create Sub-Account' },
    ],
  },
  {
    id: 2,
    name: 'Website Build',
    steps: [
      { number: 2, name: 'Generate 10web Prompt' },
      { number: 3, name: 'Website Creation (Manual)', pausesForManualInput: true },
    ],
  },
  {
    id: 3,
    name: 'WordPress Setup',
    steps: [
      { number: 4, name: 'Validate WordPress' },
      { number: 5, name: 'Install Plugins' },
      { number: 6, name: 'Upload Logo' },
      { number: 7, name: 'Fix Header', optional: true },
      { number: 8, name: 'Generate Legal Pages' },
      { number: 9, name: 'Generate FAQ' },
      { number: 10, name: 'Publish Pages' },
      { number: 11, name: 'Apply Site CSS', optional: true },
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

export const WIZARD_STEP_IDENTITY = 0
export const WIZARD_STEP_MAP = 1
export const WIZARD_STEP_TICKETS = 2
export const WIZARD_STEP_CONFIG = 3
export const WIZARD_STEP_AGENDA = 4

export const WIZARD_STEP_COUNT = 5

export type WizardVisibility = {
  hasSeatingPlan: boolean
  hasSchedule: boolean
}

/** Orden visual. Los índices internos no se reenumeran para no romper drafts. */
export const WIZARD_DISPLAY_ORDER = [
  WIZARD_STEP_IDENTITY,
  WIZARD_STEP_AGENDA,
  WIZARD_STEP_MAP,
  WIZARD_STEP_TICKETS,
  WIZARD_STEP_CONFIG,
] as const

export function isWizardStepVisible(
  step: number,
  flags: WizardVisibility,
): boolean {
  if (step === WIZARD_STEP_MAP) return flags.hasSeatingPlan
  if (step === WIZARD_STEP_AGENDA) return flags.hasSchedule
  return (
    step === WIZARD_STEP_IDENTITY ||
    step === WIZARD_STEP_TICKETS ||
    step === WIZARD_STEP_CONFIG
  )
}

export function visibleWizardSteps(flags: WizardVisibility): number[] {
  return WIZARD_DISPLAY_ORDER.filter((step) => isWizardStepVisible(step, flags))
}

export function clampWizardStep(
  step: number,
  flags: WizardVisibility,
): number {
  const bounded = Math.min(WIZARD_STEP_COUNT - 1, Math.max(0, step))
  if (isWizardStepVisible(bounded, flags)) return bounded
  return WIZARD_STEP_IDENTITY
}

export function nextWizardStep(
  current: number,
  flags: WizardVisibility,
): number {
  const visible = visibleWizardSteps(flags)
  const from = clampWizardStep(current, flags)
  const index = visible.indexOf(from)
  return visible[index + 1] ?? from
}

export function prevWizardStep(
  current: number,
  flags: WizardVisibility,
): number {
  const visible = visibleWizardSteps(flags)
  const from = clampWizardStep(current, flags)
  const index = visible.indexOf(from)
  return visible[index - 1] ?? from
}

export function isLastVisibleWizardStep(
  current: number,
  flags: WizardVisibility,
): boolean {
  const from = clampWizardStep(current, flags)
  return nextWizardStep(from, flags) === from
}

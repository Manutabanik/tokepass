export const WIZARD_STEP_IDENTITY = 0
export const WIZARD_STEP_MAP = 1
export const WIZARD_STEP_TICKETS = 2
export const WIZARD_STEP_CONFIG = 3
export const WIZARD_STEP_AGENDA = 4

export const WIZARD_STEP_COUNT = 5

export type WizardVisibility = {
  hasSeatingPlan: boolean
  hasSchedule: boolean
  /** Edición de evento: mismos 3 pasos del Studio. */
  editWorkspace?: boolean
}

export type EditWorkspaceStepKey = "info" | "map" | "pricing"

const STUDIO_STEPS = [
  WIZARD_STEP_IDENTITY,
  WIZARD_STEP_MAP,
  WIZARD_STEP_TICKETS,
] as const

const EDIT_WORKSPACE_STEP_META: Record<
  (typeof STUDIO_STEPS)[number],
  { key: EditWorkspaceStepKey; title: string; description: string }
> = {
  [WIZARD_STEP_IDENTITY]: {
    key: "info",
    title: "Identidad",
    description: "Nombre, flyer y categoría",
  },
  [WIZARD_STEP_MAP]: {
    key: "map",
    title: "Cita y lugar",
    description: "Fechas, horarios y ubicación",
  },
  [WIZARD_STEP_TICKETS]: {
    key: "pricing",
    title: "Entradas",
    description: "Tarifas y cupos",
  },
}

export function parseEditWorkspaceStep(
  raw: string | string[] | null | undefined,
): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  const key = (value ?? "").trim().toLowerCase()
  if (
    key === "info" ||
    key === "identity" ||
    key === "datos" ||
    key === "0"
  ) {
    return WIZARD_STEP_IDENTITY
  }
  if (
    key === "map" ||
    key === "place" ||
    key === "cita" ||
    key === "lugar" ||
    key === "architecture" ||
    key === "arquitectura" ||
    key === "1"
  ) {
    return WIZARD_STEP_MAP
  }
  if (
    key === "pricing" ||
    key === "prices" ||
    key === "tickets" ||
    key === "tarifas" ||
    key === "2"
  ) {
    return WIZARD_STEP_TICKETS
  }
  return WIZARD_STEP_IDENTITY
}

export function editWorkspaceStepKey(step: number): EditWorkspaceStepKey {
  if (step === WIZARD_STEP_MAP) return "map"
  if (step === WIZARD_STEP_TICKETS) return "pricing"
  return "info"
}

export function editWorkspaceStepMeta(step: number) {
  if (step === WIZARD_STEP_MAP) return EDIT_WORKSPACE_STEP_META[WIZARD_STEP_MAP]
  if (step === WIZARD_STEP_TICKETS) {
    return EDIT_WORKSPACE_STEP_META[WIZARD_STEP_TICKETS]
  }
  return EDIT_WORKSPACE_STEP_META[WIZARD_STEP_IDENTITY]
}

/** Orden visual del Event Studio. Los índices internos no se reenumeran. */
export const WIZARD_DISPLAY_ORDER = [
  WIZARD_STEP_IDENTITY,
  WIZARD_STEP_MAP,
  WIZARD_STEP_TICKETS,
] as const

export function isWizardStepVisible(step: number): boolean {
  return (
    step === WIZARD_STEP_IDENTITY ||
    step === WIZARD_STEP_MAP ||
    step === WIZARD_STEP_TICKETS
  )
}

export function visibleWizardSteps(flags?: WizardVisibility): number[] {
  void flags
  return [...STUDIO_STEPS]
}

export function clampWizardStep(
  step: number,
  flags?: WizardVisibility,
): number {
  void flags
  const bounded = Math.min(WIZARD_STEP_COUNT - 1, Math.max(0, step))
  if (bounded === WIZARD_STEP_AGENDA) return WIZARD_STEP_MAP
  if (bounded === WIZARD_STEP_CONFIG) return WIZARD_STEP_TICKETS
  if (isWizardStepVisible(bounded)) return bounded
  return WIZARD_STEP_IDENTITY
}

export function nextWizardStep(
  current: number,
  flags?: WizardVisibility,
): number {
  const visible = visibleWizardSteps(flags)
  const from = clampWizardStep(current, flags)
  const index = visible.indexOf(from)
  return visible[index + 1] ?? from
}

export function prevWizardStep(
  current: number,
  flags?: WizardVisibility,
): number {
  const visible = visibleWizardSteps(flags)
  const from = clampWizardStep(current, flags)
  const index = visible.indexOf(from)
  return visible[index - 1] ?? from
}

export function isLastVisibleWizardStep(
  current: number,
  flags?: WizardVisibility,
): boolean {
  const from = clampWizardStep(current, flags)
  return nextWizardStep(from, flags) === from
}

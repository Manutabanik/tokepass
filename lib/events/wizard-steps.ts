export const WIZARD_STEP_IDENTITY = 0
export const WIZARD_STEP_MAP = 1
export const WIZARD_STEP_TICKETS = 2
export const WIZARD_STEP_CONFIG = 3
export const WIZARD_STEP_AGENDA = 4

export const WIZARD_STEP_COUNT = 5

export type WizardVisibility = {
  hasSeatingPlan: boolean
  hasSchedule: boolean
  /** Edición de evento: Info / Arquitectura / Tarifas, sin esconder el mapa. */
  editWorkspace?: boolean
}

export type EditWorkspaceStepKey = "info" | "map" | "pricing"

const EDIT_WORKSPACE_STEPS = [
  WIZARD_STEP_IDENTITY,
  WIZARD_STEP_MAP,
  WIZARD_STEP_TICKETS,
] as const

const EDIT_WORKSPACE_STEP_META: Record<
  (typeof EDIT_WORKSPACE_STEPS)[number],
  { key: EditWorkspaceStepKey; title: string; description: string }
> = {
  [WIZARD_STEP_IDENTITY]: {
    key: "info",
    title: "Información Básica",
    description: "Título, fecha y flyer",
  },
  [WIZARD_STEP_MAP]: {
    key: "map",
    title: "Arquitectura",
    description: "Mapa, butacas y numeración",
  },
  [WIZARD_STEP_TICKETS]: {
    key: "pricing",
    title: "Tarifas / Precios",
    description: "Entradas y combos",
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
  if (flags.editWorkspace) {
    return (
      step === WIZARD_STEP_IDENTITY ||
      step === WIZARD_STEP_MAP ||
      step === WIZARD_STEP_TICKETS
    )
  }
  if (step === WIZARD_STEP_MAP) return flags.hasSeatingPlan
  if (step === WIZARD_STEP_AGENDA) return flags.hasSchedule
  return (
    step === WIZARD_STEP_IDENTITY ||
    step === WIZARD_STEP_TICKETS ||
    step === WIZARD_STEP_CONFIG
  )
}

export function visibleWizardSteps(flags: WizardVisibility): number[] {
  if (flags.editWorkspace) return [...EDIT_WORKSPACE_STEPS]
  return WIZARD_DISPLAY_ORDER.filter((step) => isWizardStepVisible(step, flags))
}

export function clampWizardStep(
  step: number,
  flags: WizardVisibility,
): number {
  const bounded = Math.min(WIZARD_STEP_COUNT - 1, Math.max(0, step))
  if (isWizardStepVisible(bounded, flags)) return bounded
  if (flags.editWorkspace) {
    if (bounded === WIZARD_STEP_CONFIG) return WIZARD_STEP_TICKETS
    return WIZARD_STEP_IDENTITY
  }
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

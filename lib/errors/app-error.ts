export const APP_ERROR_CODES = [
  "INVALID_DAY_SELECTION",
  "ERROR_FALTA_UBICACION",
  "MISSING_VENUE_NAME",
  "MISSING_TICKETS",
  "INVALID_EVENT_DATE",
  "INVENTORY_SYNC",
  "SEATING_SECTOR_MISMATCH",
  "CAPACITY_OVERFLOW",
  "PHASE_OVERFLOW",
  "PERMISSION_DENIED",
  "SESSION_REQUIRED",
  "EVENT_NOT_FOUND",
  "UNKNOWN",
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]

export type GuidedErrorAction = {
  step: 0 | 1 | 2 | 3 | 4
  label: string
}

export type AppError = {
  code: AppErrorCode
  message: string
  action?: GuidedErrorAction
}

export const GUIDED_ERROR_EVENT = "tokepass:guided-error"

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return (
    typeof value === "string" &&
    (APP_ERROR_CODES as readonly string[]).includes(value)
  )
}

export const APP_ERRORS: Record<AppErrorCode, AppError> = {
  INVALID_DAY_SELECTION: {
    code: "INVALID_DAY_SELECTION",
    message: "El día seleccionado no es válido.",
    action: { step: 2, label: "Ir a Entradas y combos" },
  },
  ERROR_FALTA_UBICACION: {
    code: "ERROR_FALTA_UBICACION",
    message: "Completá los datos del lugar antes de continuar.",
    action: { step: 1, label: "Ir a gestionar ubicaciones" },
  },
  MISSING_VENUE_NAME: {
    code: "MISSING_VENUE_NAME",
    message: "Ingresá el nombre del lugar.",
    action: { step: 1, label: "Ir a gestionar ubicaciones" },
  },
  MISSING_TICKETS: {
    code: "MISSING_TICKETS",
    message: "Configurá al menos un tipo de entrada con stock.",
    action: { step: 2, label: "Ir a Entradas y combos" },
  },
  INVALID_EVENT_DATE: {
    code: "INVALID_EVENT_DATE",
    message: "La fecha de inicio debe ser futura.",
    action: { step: 0, label: "Ir a Identidad" },
  },
  INVENTORY_SYNC: {
    code: "INVENTORY_SYNC",
    message: "Sincronizando inventario, por favor intente nuevamente.",
  },
  SEATING_SECTOR_MISMATCH: {
    code: "SEATING_SECTOR_MISMATCH",
    message: "El mapa y las entradas no coinciden. Revisá sectores y precios.",
    action: { step: 1, label: "Ir a Mapa y Sectores" },
  },
  CAPACITY_OVERFLOW: {
    code: "CAPACITY_OVERFLOW",
    message: "El aforo del evento está excedido.",
    action: { step: 2, label: "Ir a Entradas y combos" },
  },
  PHASE_OVERFLOW: {
    code: "PHASE_OVERFLOW",
    message:
      "La suma de los lotes de precio no puede superar la capacidad de la entrada.",
    action: { step: 2, label: "Ir a Entradas y combos" },
  },
  PERMISSION_DENIED: {
    code: "PERMISSION_DENIED",
    message: "No tenés permiso para esta acción.",
  },
  SESSION_REQUIRED: {
    code: "SESSION_REQUIRED",
    message: "Iniciá sesión para continuar.",
  },
  EVENT_NOT_FOUND: {
    code: "EVENT_NOT_FOUND",
    message: "Evento no encontrado.",
  },
  UNKNOWN: {
    code: "UNKNOWN",
    message: "Sincronizando inventario, por favor intente nuevamente.",
  },
}

export function wizardStepFromPath(path: ReadonlyArray<PropertyKey>): 0 | 1 | 2 | 3 | 4 {
  const root = String(path[0] ?? "")
  if (root === "lineup") return 4
  if (root === "basics") return 0
  if (root === "venue") return 1
  if (root === "tickets") return 2
  return 3
}

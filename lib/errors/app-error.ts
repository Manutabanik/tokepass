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
  "SAVE_FAILED",
  "INVALID_PROMO_PRICE",
  "MISSING_SCHEDULE_DAY",
  "INCOMPLETE_DAY_TICKETS",
  "FLYER_TOO_LARGE",
  "UNKNOWN",
] as const

export type AppErrorCode = (typeof APP_ERROR_CODES)[number]

export type GuidedErrorAction = {
  step: 0 | 1 | 2 | 3 | 4
  label: string
  field?: string
}

export type AppError = {
  code: AppErrorCode
  title: string
  message: string
  actionHint?: string
  action?: GuidedErrorAction
  field?: string
  retryable?: boolean
}

export const GUIDED_ERROR_EVENT = "tokepass:guided-error"

export const FIELD_REVIEW_HINT = "Revisá este valor antes de continuar."

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return (
    typeof value === "string" &&
    (APP_ERROR_CODES as readonly string[]).includes(value)
  )
}

export const APP_ERRORS: Record<AppErrorCode, AppError> = {
  INVALID_DAY_SELECTION: {
    code: "INVALID_DAY_SELECTION",
    title: "Error en jornadas",
    message: "Falta seleccionar la jornada obligatoria.",
    field: "tickets",
    action: { step: 2, label: "Corregir campo", field: "tickets" },
    retryable: true,
  },
  ERROR_FALTA_UBICACION: {
    code: "ERROR_FALTA_UBICACION",
    title: "Error en el lugar",
    message: "Completá los datos del lugar antes de continuar.",
    actionHint: "Buscá la dirección o escribí el nombre del recinto.",
    field: "venue.venueName",
    action: { step: 1, label: "Corregir campo", field: "venue.venueName" },
    retryable: true,
  },
  MISSING_VENUE_NAME: {
    code: "MISSING_VENUE_NAME",
    title: "Error en el lugar",
    message: "Ingresá el nombre del lugar.",
    field: "venue.venueName",
    action: { step: 1, label: "Corregir campo", field: "venue.venueName" },
    retryable: true,
  },
  MISSING_TICKETS: {
    code: "MISSING_TICKETS",
    title: "Error en entradas",
    message: "Configurá al menos un tipo de entrada con stock.",
    actionHint: "Creá una entrada con precio y cupo mayor a 0.",
    field: "tickets",
    action: { step: 2, label: "Corregir campo", field: "tickets" },
    retryable: true,
  },
  INVALID_EVENT_DATE: {
    code: "INVALID_EVENT_DATE",
    title: "Error en identidad",
    message: "La fecha de inicio debe ser futura.",
    field: "basics.date",
    action: { step: 0, label: "Corregir campo", field: "basics.date" },
    retryable: true,
  },
  INVENTORY_SYNC: {
    code: "INVENTORY_SYNC",
    title: "No pudimos guardar los cambios",
    message: "No pudimos actualizar las entradas. Revisá tu conexión e intentá guardar de nuevo.",
    retryable: true,
    action: { step: 2, label: "Revisar entradas" },
  },
  SEATING_SECTOR_MISMATCH: {
    code: "SEATING_SECTOR_MISMATCH",
    title: "Error en mapa y tarifas",
    message: "El mapa y las entradas no coinciden. Revisá sectores y precios.",
    field: "venue.venueMap",
    action: { step: 1, label: "Corregir campo", field: "venue.venueMap" },
    retryable: true,
  },
  CAPACITY_OVERFLOW: {
    code: "CAPACITY_OVERFLOW",
    title: "Error en aforo",
    message: "El cupo total supera el aforo permitido.",
    field: "tickets",
    action: { step: 2, label: "Corregir campo", field: "tickets" },
    retryable: true,
  },
  PHASE_OVERFLOW: {
    code: "PHASE_OVERFLOW",
    title: "Error en lotes de precio",
    message:
      "La suma de los lotes de precio no puede superar la capacidad de la entrada.",
    field: "tickets",
    action: { step: 2, label: "Corregir campo", field: "tickets" },
    retryable: true,
  },
  PERMISSION_DENIED: {
    code: "PERMISSION_DENIED",
    title: "Permiso insuficiente",
    message: "No tenés permiso para esta acción.",
  },
  SESSION_REQUIRED: {
    code: "SESSION_REQUIRED",
    title: "Sesión vencida",
    message: "Tu sesión venció por seguridad. Volvé a ingresar con tu cuenta",
  },
  EVENT_NOT_FOUND: {
    code: "EVENT_NOT_FOUND",
    title: "Evento no encontrado",
    message: "No encontramos este evento. Volvé al listado e intentá de nuevo.",
  },
  SAVE_FAILED: {
    code: "SAVE_FAILED",
    title: "No pudimos guardar los cambios",
    message: "No pudimos guardar los cambios. Revisá tu conexión a internet e intentá de nuevo.",
    actionHint: "Revisá tu conexión e intentá guardar de nuevo.",
    retryable: true,
    action: { step: 0, label: "Revisar formulario" },
  },
  INVALID_PROMO_PRICE: {
    code: "INVALID_PROMO_PRICE",
    title: "Error en promoción",
    message: "El precio promocional debe ser menor al precio de lista.",
    field: "tickets",
    action: { step: 2, label: "Corregir campo", field: "tickets" },
    retryable: true,
  },
  MISSING_SCHEDULE_DAY: {
    code: "MISSING_SCHEDULE_DAY",
    title: "Error en jornadas",
    message: "Falta seleccionar la jornada obligatoria.",
    field: "tickets",
    action: { step: 2, label: "Corregir campo", field: "tickets" },
    retryable: true,
  },
  INCOMPLETE_DAY_TICKETS: {
    code: "INCOMPLETE_DAY_TICKETS",
    title: "Error en jornadas",
    message:
      "Hay un día sin tarifas activas. Asigná un precio y cupo, o deshabilitá la venta de ese día.",
    field: "tickets",
    action: { step: 2, label: "Corregir campo", field: "tickets" },
    retryable: true,
  },
  FLYER_TOO_LARGE: {
    code: "FLYER_TOO_LARGE",
    title: "Error en identidad",
    message: "El flyer supera los 5MB. Comprimilo o elegí otra imagen.",
    actionHint: "Usá un JPG o PNG de menos de 5 MB.",
    field: "basics.flyerName",
    action: { step: 0, label: "Corregir campo", field: "basics.flyerName" },
    retryable: true,
  },
  UNKNOWN: {
    code: "SAVE_FAILED",
    title: "No pudimos guardar los cambios",
    message: "Tuvimos un problema técnico de nuestro lado. Volvé a intentar en un ratito",
    retryable: true,
    action: { step: 0, label: "Revisar formulario" },
  },
}

export function wizardStepFromPath(path: ReadonlyArray<PropertyKey>): 0 | 1 | 2 | 3 | 4 {
  const root = String(path[0] ?? "")
  const field = String(path[1] ?? "")
  if (root === "lineup") return 4
  if (root === "tickets") return 2
  if (
    root === "maxTicketsPerUser" ||
    root === "acceptsMercadoPago" ||
    root === "acceptsPosPayments" ||
    root === "defaultFeeStrategy" ||
    root === "refundPolicy"
  ) {
    return 3
  }
  if (root === "venue") return 0
  if (root === "basics") {
    if (
      field === "hasSeatingPlan" ||
      field === "hasSchedule" ||
      field === "visibility"
    ) {
      return 3
    }
    return 0
  }
  return 3
}

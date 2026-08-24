import { isRelationalIntegrityError } from "@/lib/events/sanitize-ticket-tiers"

import {
  APP_ERRORS,
  isAppErrorCode,
  type AppError,
  type AppErrorCode,
  type GuidedErrorAction,
  GUIDED_ERROR_EVENT,
} from "@/lib/errors/app-error"
import { isForbiddenUserCopy } from "@/lib/errors/form-field"

export {
  APP_ERRORS,
  APP_ERROR_CODES,
  GUIDED_ERROR_EVENT,
  isAppErrorCode,
  wizardStepFromPath,
  type AppError,
  type AppErrorCode,
  type GuidedErrorAction,
} from "@/lib/errors/app-error"

const SCREAMING_SNAKE = /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/
const ONLY_INTERNAL_CODE = /^[A-Z]+(_[A-Z0-9]+)+$/
const POSTGRES_OR_POSTGREST =
  /\b(PGRST\d+|22P02|23503|23505|23514|23P01|40001|42501|42703|42P01|P0001)\b/i
const RAW_SQL_LEAK =
  /column ["'].+["']|invalid input syntax|operator does not exist|relation ["'].+["'] does not exist|duplicate key value|violates (unique|foreign|check|not-null)|function .+ does not exist|permission denied for|SQLSTATE|HINT:|DETAIL:/i
const TECH_STACK_LEAK =
  /supabase|postgrest|postgres(?:ql)?|node_modules|\bat\s+\S+\s+\(|failed to fetch|econnrefused|etimedout|typeerror|referenceerror|undefined is not|cannot read propert|schema cache|json object|syntax error|rpc\s|could not find the/i
const SAFE_USER_COPY =
  /^[\p{L}\p{N}\s.,;:¡!¿?()/%€$'"+\-–—°#]+$/u
const MAX_SAFE_USER_COPY = 180

type ErrorRule = {
  code: AppErrorCode
  match: RegExp
}

const ERROR_RULES: ErrorRule[] = [
  {
    code: "FLYER_TOO_LARGE",
    match: /flyer supera|flyer no puede superar|5\s*mb/i,
  },
  {
    code: "INVALID_PROMO_PRICE",
    match:
      /precio promocional|promotional_price|list_price|listPrice|2\s*x\s*1|debe ser menor al precio/i,
  },
  {
    code: "MISSING_SCHEDULE_DAY",
    match:
      /jornada obligatoria|seleccionar la jornada|null value in column ["']day_id/i,
  },
  {
    code: "INCOMPLETE_DAY_TICKETS",
    match:
      /Cada jornada necesita al menos una entrada activa|Falta configurar:|no tiene tarifas activas|Asigna un precio o deshabilita la venta/i,
  },
  {
    code: "INVALID_DAY_SELECTION",
    match:
      /day_id|día seleccionado no es válido|jornada válida|abono completo/i,
  },
  {
    code: "ERROR_FALTA_UBICACION",
    match:
      /lugar \/ ubicación|datos del lugar|gestionar ubicaciones|Falta el pin|dirección en el buscador|venue_id|ERROR_FALTA_UBICACION/i,
  },
  {
    code: "MISSING_VENUE_NAME",
    match: /nombre del lugar/i,
  },
  {
    code: "MISSING_TICKETS",
    match:
      /al menos un tipo de entrada|Creá al menos un tipo de entrada|stock > 0/i,
  },
  {
    code: "INVALID_EVENT_DATE",
    match: /fecha de inicio debe ser futura|hora de inicio no es válida/i,
  },
  {
    code: "SEATING_SECTOR_MISMATCH",
    match:
      /SEATING_SECTOR_NOT_FOUND|SEATING_TIER_CONFIG_AMBIGUOUS|mapa y las entradas no coinciden|mapa y los tickets no coinciden|sillas del mapa|Revisá el mapa|sector general .+ necesita precio|sector reservado .+ necesita al menos una mesa/i,
  },
  {
    code: "CAPACITY_OVERFLOW",
    match: /aforo.*exced|capacidad del sector|Superás la capacidad/i,
  },
  {
    code: "PHASE_OVERFLOW",
    match: /lotes de precio|suma de los lotes/i,
  },
  {
    code: "PERMISSION_DENIED",
    match: /sin permiso|no tenés permiso|no tenes permiso/i,
  },
  {
    code: "SESSION_REQUIRED",
    match:
      /sesión requerida|debes iniciar sesión|iniciá sesión|unauthorized|token expired|jwt expired|sesión venció/i,
  },
  {
    code: "EVENT_NOT_FOUND",
    match: /evento no encontrado|evento inválido/i,
  },
  {
    code: "INVENTORY_SYNC",
    match: /schema cache|PGRST204|42703|promo_discount/i,
  },
  {
    code: "SAVE_FAILED",
    match: /descripción es obligatoria|description is required/i,
  },
  {
    code: "SAVE_FAILED",
    match:
      /duplicate key|unique constraint|null value in column|violates not-null|internal server error|error 500|error al procesar|\bunknown\b/i,
  },
]

const PUBLIC_CHECKOUT_CODE =
  /^(SEAT_UNAVAILABLE|SEAT_SELECTION_REQUIRED|GENERAL_STOCK_UNAVAILABLE|SECTOR_NOT_CONFIGURED|ERR_NO_STOCK|ERR_SEAT_TAKEN|ERR_SEAT_REQUIRED)(:.*)?$/i

export function containsInternalErrorCode(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (PUBLIC_CHECKOUT_CODE.test(trimmed)) return false
  if (ONLY_INTERNAL_CODE.test(trimmed)) return true
  if (SCREAMING_SNAKE.test(trimmed) && !PUBLIC_CHECKOUT_CODE.test(trimmed.split(":")[0] ?? "")) {
    return true
  }
  if (isRelationalIntegrityError(trimmed)) return true
  if (POSTGRES_OR_POSTGREST.test(trimmed)) return true
  if (RAW_SQL_LEAK.test(trimmed)) return true
  if (TECH_STACK_LEAK.test(trimmed)) return true
  return false
}

export function isSafeUserFacingCopy(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > MAX_SAFE_USER_COPY) return false
  if (containsInternalErrorCode(trimmed)) return false
  return SAFE_USER_COPY.test(trimmed)
}

function textFromUnknown(raw: unknown): string {
  if (raw == null) return ""
  if (typeof raw === "string") return raw.trim()
  if (raw instanceof Error) return raw.message.trim()
  if (typeof raw === "object") {
    const record = raw as {
      code?: unknown
      message?: unknown
      error?: unknown
    }
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim()
    }
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error.trim()
    }
    if (isAppErrorCode(record.code)) return record.code
  }
  return String(raw).trim()
}

function sanitizeMappedError(error: AppError): AppError {
  const code = error.code === "UNKNOWN" ? "SAVE_FAILED" : error.code
  const catalog = APP_ERRORS[code] ?? APP_ERRORS.SAVE_FAILED
  const title = error.title?.trim() || catalog.title
  const message = error.message.trim()
  const safeMessage =
    !message ||
    isForbiddenDisplay(message) ||
    containsInternalErrorCode(message)
      ? catalog.message
      : message
  return {
    ...catalog,
    ...error,
    code,
    title: isForbiddenDisplay(title) ? catalog.title : title,
    message: safeMessage,
  }
}

function isForbiddenDisplay(text: string): boolean {
  return isForbiddenUserCopy(text)
}

export function mapUnknownError(
  raw: unknown,
  fallback: AppError = APP_ERRORS.SAVE_FAILED,
): AppError {
  if (raw && typeof raw === "object" && "code" in raw) {
    const record = raw as { code?: unknown; message?: unknown; field?: unknown; title?: unknown }
    const code = record.code
    if (isAppErrorCode(code) && code !== "UNKNOWN") {
      const catalog = APP_ERRORS[code]
      const message =
        typeof record.message === "string" && isSafeUserFacingCopy(record.message)
          ? record.message.trim()
          : catalog.message
      const field =
        typeof record.field === "string" && record.field.trim()
          ? record.field.trim()
          : catalog.field
      const title =
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : catalog.title
      return sanitizeMappedError({ ...catalog, message, field, title })
    }
  }

  const text = textFromUnknown(raw)
  if (!text || isForbiddenDisplay(text)) {
    return sanitizeMappedError(fallback)
  }
  if (/legal_consent|LEGAL_CONSENT_REQUIRED/i.test(text)) {
    return sanitizeMappedError({
      ...APP_ERRORS.SAVE_FAILED,
      title: "Términos y condiciones",
      message: "Debés aceptar los términos y condiciones para continuar.",
    })
  }
  if (/descripción es obligatoria/i.test(text)) {
    return sanitizeMappedError({
      ...APP_ERRORS.SAVE_FAILED,
      message: "Completá la descripción del evento antes de guardar.",
      field: "basics.description",
      action: { step: 0, label: "Corregir descripción", field: "basics.description" },
    })
  }
  if (isAppErrorCode(text) && text !== "UNKNOWN") {
    return sanitizeMappedError(APP_ERRORS[text])
  }

  for (const rule of ERROR_RULES) {
    if (rule.match.test(text)) return sanitizeMappedError(APP_ERRORS[rule.code])
  }

  if (!isSafeUserFacingCopy(text)) {
    return sanitizeMappedError(fallback)
  }

  return sanitizeMappedError({
    ...APP_ERRORS.SAVE_FAILED,
    message: text,
  })
}

export function dispatchGuidedError(action: GuidedErrorAction) {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<GuidedErrorAction>(GUIDED_ERROR_EVENT, { detail: action }),
  )
}

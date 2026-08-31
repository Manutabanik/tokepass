export const SCANNER_SETUP_ERROR_CODES = [
  "auth_required",
  "network",
  "timeout",
  "forbidden",
  "unknown",
] as const

export type ScannerSetupErrorCode = (typeof SCANNER_SETUP_ERROR_CODES)[number]

export class ScannerSetupError extends Error {
  readonly code: ScannerSetupErrorCode

  constructor(code: ScannerSetupErrorCode, message: string) {
    super(message)
    this.name = "ScannerSetupError"
    this.code = code
  }
}

export function isScannerSetupError(error: unknown): error is ScannerSetupError {
  return error instanceof ScannerSetupError
}

export function classifyScannerSetupError(error: unknown): {
  code: ScannerSetupErrorCode
  message: string
} {
  if (isScannerSetupError(error)) {
    return { code: error.code, message: error.message }
  }

  const name =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : ""
  const message = error instanceof Error ? error.message : String(error ?? "")
  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false

  if (name === "AbortError" || /aborted|timeout|timed out/i.test(message)) {
    return {
      code: "timeout",
      message: "La red tardó demasiado. Reintentá la conexión.",
    }
  }
  if (
    /auth_required|401|expirad|token|sesi[oó]n/i.test(message)
  ) {
    return {
      code: "auth_required",
      message: "Sesión expirada. Volvé a iniciar sesión.",
    }
  }
  if (/forbidden|403|sin permiso|no tenés acceso|no tenes acceso/i.test(message)) {
    return {
      code: "forbidden",
      message: "No tenés permiso para controlar este evento.",
    }
  }
  if (
    offline ||
    name === "TypeError" ||
    /failed to fetch|network|load failed|error de red/i.test(message)
  ) {
    return {
      code: "network",
      message: "Error de red. Revisá la señal e intentá de nuevo.",
    }
  }
  return {
    code: "unknown",
    message: message.trim() || "No se pudieron cargar los eventos.",
  }
}

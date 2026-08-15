import type { IScannerError } from "@yudiel/react-qr-scanner"

export function scannerCameraErrorMessage(
  error: Pick<IScannerError, "kind" | "message"> | Error | { message?: string },
): string {
  const kind = "kind" in error ? error.kind : undefined

  switch (kind) {
    case "permission-denied":
      return "No pudimos usar la cámara. En el navegador, permití el acceso a la cámara para Tokepass y volvé a intentar."
    case "no-camera":
      return "Este dispositivo no tiene una cámara disponible."
    case "in-use":
      return "La cámara está ocupada por otra aplicación. Cerrala e intentá de nuevo."
    case "insecure-context":
      return "La cámara solo funciona en una conexión segura (HTTPS)."
    case "overconstrained":
      return "No encontramos la cámara pedida. Probá el otro modo o reintentá."
    case "unsupported":
      return "Este navegador no puede abrir la cámara."
    default:
      break
  }

  const message = "message" in error ? error.message?.trim() : ""
  if (message && /denied|permission|notallowed/i.test(message)) {
    return "No pudimos usar la cámara. En el navegador, permití el acceso a la cámara para Tokepass y volvé a intentar."
  }
  return message || "El navegador no pudo iniciar la cámara."
}

/** Maps PostgREST / Postgres transfer RPC errors to user-facing Spanish copy. */

export type ClaimTransferErrorCode =
  | "auth_required"
  | "email_mismatch"
  | "cancelled"
  | "not_found"
  | "not_pending"
  | "not_transferable"
  | "transfer_limit"
  | "max_tickets"
  | "self_transfer"
  | "unknown"

export type MappedClaimError = {
  error: string
  code: ClaimTransferErrorCode
}

export function mapClaimTransferError(message: string): MappedClaimError {
  const normalized = message.toUpperCase()

  if (normalized.includes("AUTH_REQUIRED")) {
    return {
      error: "Iniciá sesión para reclamar esta entrada.",
      code: "auth_required",
    }
  }
  if (normalized.includes("EMAIL_MISMATCH")) {
    return {
      error:
        "Esta entrada fue enviada a otro email. Ingresá con la cuenta destinataria.",
      code: "email_mismatch",
    }
  }
  if (normalized.includes("TRANSFER_CANCELLED")) {
    return {
      error: "El envío fue cancelado por quien te la transfirió.",
      code: "cancelled",
    }
  }
  if (
    normalized.includes("TRANSFER_NOT_FOUND") ||
    normalized.includes("INVALID_CLAIM_TOKEN")
  ) {
    return {
      error: "Este enlace es inválido o ya no está disponible.",
      code: "not_found",
    }
  }
  if (normalized.includes("TRANSFER_NOT_PENDING")) {
    return {
      error: "Esta transferencia ya no está pendiente de aceptación.",
      code: "not_pending",
    }
  }
  if (normalized.includes("TICKET_NOT_TRANSFERABLE")) {
    return {
      error:
        "La entrada ya no se puede reclamar (fue usada, anulada o cambió de titular).",
      code: "not_transferable",
    }
  }
  if (normalized.includes("TRANSFER_LIMIT_REACHED")) {
    return {
      error: "Esta entrada ya alcanzó el límite de transferencias.",
      code: "transfer_limit",
    }
  }
  if (normalized.includes("MAX_TICKETS_PER_USER")) {
    return {
      error: "Alcanzaste el máximo de entradas para este evento.",
      code: "max_tickets",
    }
  }
  if (normalized.includes("CANNOT_TRANSFER_TO_SELF")) {
    return {
      error: "No podés reclamar una entrada que ya es tuya.",
      code: "self_transfer",
    }
  }
  if (normalized.includes("TICKET_NOT_FOUND")) {
    return {
      error: "No encontramos la entrada asociada a esta transferencia.",
      code: "not_found",
    }
  }

  return {
    error: message.trim()
      ? `No se pudo reclamar la entrada: ${message.trim()}`
      : "No se pudo reclamar la entrada. Probá de nuevo.",
    code: "unknown",
  }
}

/**
 * Decode / resolve de payloads Living QR v2 + legacy + estáticos.
 * El lease de admisión offline (nonce device_id+ticket_id+timestamp)
 * vive en `lib/scanner/admission-lease.ts` y se persiste en IndexedDB.
 */

import {
  getTotpWindow,
  LIVING_QR_GRACE_BLOCKS,
  LIVING_QR_PERIOD_MS,
  STATIC_QR_PREFIX,
  verifyLivingQrMac,
  verifyStaticQrMac,
} from "@/lib/totp-offline"
import { canAcceptStaticTpsAtDoor } from "@/lib/tickets/static-tps-policy"
import type { QrType } from "@/types/database"

export type DecodedLivingV2 = {
  version: 2
  ticketId: string
  timestampBlock: number
  mac: string
}

export type DecodedStaticSigned = {
  version: "tps"
  ticketId: string
  mac: string
}

export type DecodedLivingLegacy = {
  version: 1
  totpSecret: string
  timestampBlock: number
}

export type DecodedLiving = DecodedLivingV2 | DecodedLivingLegacy

/** Secreto que deja execute_safe_transfer / claim en el ticket desacoplado. */
export const TRANSFER_DEAD_SECRET_PREFIX = "xfer_dead_"

export function isRetiredTransferSecret(secret: string | null | undefined): boolean {
  return (secret ?? "").trim().toLowerCase().startsWith(TRANSFER_DEAD_SECRET_PREFIX)
}

export function decodeStaticSignedPayload(
  rawPayload: string,
): DecodedStaticSigned | null {
  const cleaned = rawPayload.trim()
  if (!cleaned.startsWith(`${STATIC_QR_PREFIX}.`)) return null
  const parts = cleaned.split(".")
  if (parts.length !== 3) return null
  const ticketId = parts[1]
  const mac = parts[2]
  if (!ticketId || !mac) return null
  return { version: "tps", ticketId, mac }
}

export function decodeLivingPayload(rawPayload: string): DecodedLiving | null {
  const cleaned = rawPayload.trim()
  if (!cleaned) return null

  // v2: TP2.<uuid>.<window>.<mac>
  if (cleaned.startsWith("TP2.")) {
    const parts = cleaned.split(".")
    if (parts.length !== 4) return null
    const ticketId = parts[1]
    const timestampBlock = Number(parts[2])
    const mac = parts[3]
    if (
      !ticketId ||
      !mac ||
      !Number.isFinite(timestampBlock) ||
      !Number.isInteger(timestampBlock)
    ) {
      return null
    }
    return { version: 2, ticketId, timestampBlock, mac }
  }

  // Legacy v1: base64(secret-window)
  try {
    const decoded =
      typeof window !== "undefined" && typeof window.atob === "function"
        ? window.atob(cleaned)
        : Buffer.from(cleaned, "base64").toString("utf8")

    const separator = decoded.lastIndexOf("-")
    if (separator <= 0 || separator === decoded.length - 1) {
      return null
    }

    const totpSecret = decoded.slice(0, separator)
    const timestampBlock = Number(decoded.slice(separator + 1))

    if (
      !totpSecret ||
      !Number.isFinite(timestampBlock) ||
      !Number.isInteger(timestampBlock)
    ) {
      return null
    }

    return { version: 1, totpSecret, timestampBlock }
  } catch {
    return null
  }
}

export type ResolvedScan =
  | {
      mode: "v2"
      ticketId: string
      timestampBlock: number
      mac: string
      expired: boolean
      enforceFreshness: boolean
    }
  | {
      mode: "tps"
      ticketId: string
      mac: string
      expired: boolean
      enforceFreshness: boolean
    }
  | {
      mode: "secret"
      totpSecret: string
      expired: boolean
      enforceFreshness: boolean
    }

export function isLivingWindowAccepted(
  timestampBlock: number,
  currentBlock: number = getTotpWindow(),
): boolean {
  return (
    Number.isInteger(timestampBlock) &&
    Math.abs(timestampBlock - currentBlock) <= LIVING_QR_GRACE_BLOCKS
  )
}

export function resolveScanSecret(
  rawPayload: string,
  qrType: QrType,
  options?: {
    nowMs?: number
    /** Canal de emisión del ticket. Si se informa, un TPS online en evento Living QR se descarta. */
    issuanceChannel?: string | null
  },
): ResolvedScan | null {
  const cleaned = rawPayload.trim()
  if (!cleaned) return null
  if (isRetiredTransferSecret(cleaned)) return null

  const signed = decodeStaticSignedPayload(cleaned)
  if (signed) {
    if (
      options &&
      "issuanceChannel" in options &&
      !canAcceptStaticTpsAtDoor({
        qrType,
        issuanceChannel: options.issuanceChannel,
      })
    ) {
      return null
    }
    return {
      mode: "tps",
      ticketId: signed.ticketId,
      mac: signed.mac,
      expired: false,
      enforceFreshness: false,
    }
  }

  const living = decodeLivingPayload(cleaned)
  const currentBlock = getTotpWindow(options?.nowMs)

  if (living?.version === 1) {
    return null
  }

  if (qrType === "static") {
    if (living?.version === 2) {
      return {
        mode: "v2",
        ticketId: living.ticketId,
        timestampBlock: living.timestampBlock,
        mac: living.mac,
        expired: false,
        enforceFreshness: false,
      }
    }
    return {
      mode: "secret",
      totpSecret: cleaned,
      expired: false,
      enforceFreshness: false,
    }
  }

  if (!living) {
    // Fallback papel / boletería POS: secreto crudo (hex) sin ventana TOTP.
    // Compatible con tickets emitidos en /admin/pos (is_dynamic_qr=false).
    if (cleaned.length >= 16 && !cleaned.includes(".")) {
      return {
        mode: "secret",
        totpSecret: cleaned,
        expired: false,
        enforceFreshness: false,
      }
    }
    return null
  }
  // Rechaza tanto capturas vencidas como ventanas futuras manipuladas.
  const expired = !isLivingWindowAccepted(living.timestampBlock, currentBlock)

  if (living.version === 2) {
    return {
      mode: "v2",
      ticketId: living.ticketId,
      timestampBlock: living.timestampBlock,
      mac: living.mac,
      expired,
      enforceFreshness: true,
    }
  }

  return null
}

export async function assertLivingMac(
  totpSecret: string,
  resolved: Extract<ResolvedScan, { mode: "v2" }>,
): Promise<boolean> {
  if (!totpSecret?.trim()) return false
  return verifyLivingQrMac(
    totpSecret,
    resolved.ticketId,
    resolved.timestampBlock,
    resolved.mac,
  )
}

export async function assertStaticMac(
  totpSecret: string,
  resolved: Extract<ResolvedScan, { mode: "tps" }>,
): Promise<boolean> {
  if (!totpSecret?.trim()) return false
  return verifyStaticQrMac(totpSecret, resolved.ticketId, resolved.mac)
}

export { LIVING_QR_PERIOD_MS, LIVING_QR_GRACE_BLOCKS }
export { buildAdmissionLeaseHash } from "@/lib/scanner/admission-lease"

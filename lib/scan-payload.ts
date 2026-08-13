/**
 * Decode / resolve de payloads Living QR v2 + legacy + estáticos.
 */

import {
  getTotpWindow,
  LIVING_QR_GRACE_BLOCKS,
  LIVING_QR_PERIOD_MS,
  verifyLivingQrMac,
} from "@/lib/totp-offline"
import type { QrType } from "@/types/database"

export type DecodedLivingV2 = {
  version: 2
  ticketId: string
  timestampBlock: number
  mac: string
}

export type DecodedLivingLegacy = {
  version: 1
  totpSecret: string
  timestampBlock: number
}

export type DecodedLiving = DecodedLivingV2 | DecodedLivingLegacy

export function decodeLivingPayload(rawPayload: string): DecodedLiving | null {
  const cleaned = rawPayload.trim()
  if (!cleaned) return null

  // v2: TP2.<uuid>.<window>.<mac16>
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
): ResolvedScan | null {
  const cleaned = rawPayload.trim()
  if (!cleaned) return null

  const living = decodeLivingPayload(cleaned)
  const currentBlock = getTotpWindow()

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
    if (living?.version === 1) {
      return {
        mode: "secret",
        totpSecret: living.totpSecret,
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

  return {
    mode: "secret",
    totpSecret: living.totpSecret,
    expired,
    enforceFreshness: true,
  }
}

export async function assertLivingMac(
  totpSecret: string,
  resolved: Extract<ResolvedScan, { mode: "v2" }>,
): Promise<boolean> {
  return verifyLivingQrMac(
    totpSecret,
    resolved.ticketId,
    resolved.timestampBlock,
    resolved.mac,
  )
}

export { LIVING_QR_PERIOD_MS, LIVING_QR_GRACE_BLOCKS }

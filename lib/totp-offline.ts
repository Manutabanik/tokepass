/**
 * Firmas de puerta. El QR NUNCA embute totp_secret.
 *
 * Living (anti-captura): `TP2.<ticketId>.<window>.<mac>`
 *   MAC = HMAC-SHA256(totp_secret, ticketId:window), 32 hex (acepta 16 legacy).
 * Estatico (papel / wallet / POS): `TPS.<ticketId>.<mac32>`
 *   MAC = HMAC-SHA256(totp_secret, TPS:ticketId)
 *
 * No se usa un secreto global de servidor: iria en el manifiesto offline y
 * un telefono de puerta comprometido podria firmar cualquier ticket.
 */

export const LIVING_QR_PERIOD_MS = 15_000
/** ±3 bloques de 15s = ±45s de clock drift en puerta. */
export const LIVING_QR_GRACE_BLOCKS = 3

export function deviceClockOffsetMs(
  serverTimestampMs: number,
  deviceNowMs: number = Date.now(),
): number {
  const server = Number(serverTimestampMs)
  const device = Number(deviceNowMs)
  if (!Number.isFinite(server) || !Number.isFinite(device)) return 0
  return device - server
}

export function serverAlignedNowMs(
  clockOffsetMs: number | null | undefined,
  deviceNowMs: number = Date.now(),
): number {
  const offset = Number(clockOffsetMs)
  if (!Number.isFinite(offset)) return deviceNowMs
  return deviceNowMs - offset
}

export function getTotpWindow(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / LIVING_QR_PERIOD_MS)
}

export function getTotpWindowProgress(nowMs: number = Date.now()): number {
  const elapsed = nowMs % LIVING_QR_PERIOD_MS
  const remaining = LIVING_QR_PERIOD_MS - elapsed
  return Math.max(0, Math.min(100, (remaining / LIVING_QR_PERIOD_MS) * 100))
}

export function getTotpRemainingSeconds(nowMs: number = Date.now()): number {
  const remainingMs = LIVING_QR_PERIOD_MS - (nowMs % LIVING_QR_PERIOD_MS)
  return Math.max(1, Math.ceil(remainingMs / 1000))
}

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return Array.from(view)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(message),
    )
    return toHex(sig)
  }

  // Node / edge sin subtle en runtime raro
  const { createHmac } = await import("crypto")
  return createHmac("sha256", secret).update(message, "utf8").digest("hex")
}

export const LIVING_QR_MAC_HEX_LEN = 32
export const LIVING_QR_MAC_LEGACY_HEX_LEN = 16
export const STATIC_QR_PREFIX = "TPS"

export function timingSafeEqualHex(left: string, right: string): boolean {
  const a = left.toLowerCase()
  const b = right.toLowerCase()
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/** MAC Living QR: 32 hex (128 bits). verify acepta tambien 16 hex legacy. */
export async function livingQrMac(
  totpSecret: string,
  ticketId: string,
  windowIndex: number,
): Promise<string> {
  const full = await hmacSha256Hex(
    totpSecret.trim(),
    `${ticketId.trim()}:${windowIndex}`,
  )
  return full.slice(0, LIVING_QR_MAC_HEX_LEN)
}

export async function verifyLivingQrMac(
  totpSecret: string,
  ticketId: string,
  windowIndex: number,
  mac: string,
): Promise<boolean> {
  const presented = mac.trim().toLowerCase()
  if (
    presented.length !== LIVING_QR_MAC_HEX_LEN &&
    presented.length !== LIVING_QR_MAC_LEGACY_HEX_LEN
  ) {
    return false
  }
  const full = await hmacSha256Hex(
    totpSecret.trim(),
    `${ticketId.trim()}:${windowIndex}`,
  )
  return timingSafeEqualHex(full.slice(0, presented.length), presented)
}

function staticQrMessage(ticketId: string): string {
  return `${STATIC_QR_PREFIX}:${ticketId.trim()}`
}

export async function generateStaticQrPayload(
  ticketId: string,
  totpSecret: string,
): Promise<string> {
  const id = ticketId.trim()
  const secret = totpSecret.trim()
  if (!id || !secret) {
    throw new Error("ticketId/totp_secret vacíos")
  }
  const mac = (await hmacSha256Hex(secret, staticQrMessage(id))).slice(
    0,
    LIVING_QR_MAC_HEX_LEN,
  )
  return `${STATIC_QR_PREFIX}.${id}.${mac}`
}

export function signedDoorQrOrFallback(
  ticketId: string,
  totpSecret: string | null | undefined,
): string {
  const id = ticketId.trim()
  const secret = (totpSecret ?? "").trim()
  if (!id) return ""
  if (!secret) return id
  return generateStaticQrPayloadSync(id, secret)
}

/** Solo server / Node (Wallet, POS, print). */
export function generateStaticQrPayloadSync(
  ticketId: string,
  totpSecret: string,
): string {
  const id = ticketId.trim()
  const secret = totpSecret.trim()
  if (!id || !secret) {
    throw new Error("ticketId/totp_secret vacíos")
  }
  // HMAC sincrono: WebCrypto es async y este helper corre en POS/wallet (Node).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac } = require("node:crypto") as typeof import("crypto")
  const mac = createHmac("sha256", secret)
    .update(staticQrMessage(id), "utf8")
    .digest("hex")
    .slice(0, LIVING_QR_MAC_HEX_LEN)
  return `${STATIC_QR_PREFIX}.${id}.${mac}`
}

export async function verifyStaticQrMac(
  totpSecret: string,
  ticketId: string,
  mac: string,
): Promise<boolean> {
  const presented = mac.trim().toLowerCase()
  if (presented.length !== LIVING_QR_MAC_HEX_LEN) return false
  const full = await hmacSha256Hex(
    totpSecret.trim(),
    staticQrMessage(ticketId),
  )
  return timingSafeEqualHex(full.slice(0, LIVING_QR_MAC_HEX_LEN), presented)
}

/**
 * Genera payload Living QR v2 (async — WebCrypto / Node HMAC).
 */
export async function generateLivingQrPayload(
  ticketId: string,
  totpSecret: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const id = ticketId.trim()
  const secret = totpSecret.trim()
  if (!id || !secret) {
    throw new Error("ticketId/totp_secret vacíos")
  }

  const windowIndex = getTotpWindow(nowMs)
  const mac = await livingQrMac(secret, id, windowIndex)
  return `TP2.${id}.${windowIndex}.${mac}`
}

/** @deprecated Preferí generateLivingQrPayload(ticketId, secret). */
export async function generateOfflineTotpCode(
  totpSecret: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const windowIndex = getTotpWindow(nowMs)
  const mac = await livingQrMac(totpSecret, totpSecret, windowIndex)
  return mac.slice(0, 8).toUpperCase()
}

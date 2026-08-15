/**
 * Living QR v2: HMAC-SHA256(secret, ticketId:window).
 * El QR NUNCA embute el totp_secret en claro (a diferencia del legacy v1).
 *
 * Formato v2: `TP2.<ticketId>.<window>.<mac16>`
 * Legacy v1: base64(`${secret}-${window}`) — solo para compatibilidad de lectura.
 */

export const LIVING_QR_PERIOD_MS = 15_000
export const LIVING_QR_GRACE_BLOCKS = 1

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

/** MAC truncado (16 hex = 64 bits) — suficiente anti-captura + QR compacto. */
export async function livingQrMac(
  totpSecret: string,
  ticketId: string,
  windowIndex: number,
): Promise<string> {
  const full = await hmacSha256Hex(
    totpSecret.trim(),
    `${ticketId.trim()}:${windowIndex}`,
  )
  return full.slice(0, 16)
}

export async function verifyLivingQrMac(
  totpSecret: string,
  ticketId: string,
  windowIndex: number,
  mac: string,
): Promise<boolean> {
  const expected = await livingQrMac(totpSecret, ticketId, windowIndex)
  const a = expected.toLowerCase()
  const b = mac.trim().toLowerCase()
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
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

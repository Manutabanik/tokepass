export const STORE_QR_ROTATION_MS = 15_000
export const STORE_QR_GRACE_BLOCKS = 1

export function storeTimestampBlock(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / STORE_QR_ROTATION_MS)
}

export function storeQrRemainingMs(nowMs: number = Date.now()): number {
  const next = (storeTimestampBlock(nowMs) + 1) * STORE_QR_ROTATION_MS
  return Math.max(0, next - nowMs)
}

function toBase64Utf8(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64")
  }
  return btoa(value)
}

function fromBase64Utf8(value: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf8")
  }
  return atob(value)
}

/** Living QR de tienda: Base64(`token-timestampBlock`). */
export function encodeLivingStorePayload(
  token: string,
  nowMs: number = Date.now(),
): string {
  const clean = token.trim()
  if (!clean) return ""
  return toBase64Utf8(`${clean}-${storeTimestampBlock(nowMs)}`)
}

export function decodeLivingStorePayload(base64Payload: string): {
  token: string
  timestampBlock: number
} | null {
  try {
    const cleaned = base64Payload.trim()
    if (!cleaned || cleaned.startsWith("TP2.") || cleaned.startsWith("TPS.")) {
      return null
    }

    if (cleaned.startsWith("bar_") && !cleaned.includes(" ")) {
      return {
        token: cleaned,
        timestampBlock: storeTimestampBlock(),
      }
    }

    const decoded = fromBase64Utf8(cleaned)
    const separator = decoded.lastIndexOf("-")

    if (separator <= 0 || separator === decoded.length - 1) {
      return null
    }

    const token = decoded.slice(0, separator)
    const timestampBlock = Number(decoded.slice(separator + 1))

    if (
      !token ||
      token.startsWith("TP2.") ||
      !Number.isFinite(timestampBlock) ||
      !Number.isInteger(timestampBlock)
    ) {
      return null
    }

    return { token, timestampBlock }
  } catch {
    return null
  }
}

export type AuthAssuranceLevel = "aal1" | "aal2"

/** Reads `aal` from a JWT payload without verifying the signature. */
export function readJwtAal(
  accessToken: string | null | undefined,
): AuthAssuranceLevel | null {
  if (!accessToken) return null
  const parts = accessToken.split(".")
  if (parts.length < 2) return null
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
    const json = Buffer.from(padded + pad, "base64").toString("utf8")
    const payload = JSON.parse(json) as { aal?: unknown }
    if (payload.aal === "aal1" || payload.aal === "aal2") return payload.aal
    return null
  } catch {
    return null
  }
}

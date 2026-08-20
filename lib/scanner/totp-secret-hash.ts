/** SHA-256 hex del totp_secret. Sirve para comparar snapshot vs manifesto sin exponer el secreto. */
export async function hashTotpSecretSha256(secret: string): Promise<string> {
  const value = secret.trim()
  if (!value) return ""
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

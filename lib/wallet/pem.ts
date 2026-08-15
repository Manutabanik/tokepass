export function decodeCertEnv(raw: string | undefined | null): Buffer | null {
  if (!raw?.trim()) return null
  const value = raw.trim().replace(/\\n/g, "\n")
  if (value.includes("BEGIN")) return Buffer.from(value, "utf8")
  try {
    const decoded = Buffer.from(value, "base64")
    const asText = decoded.toString("utf8")
    if (asText.includes("BEGIN")) return Buffer.from(asText, "utf8")
    if (decoded.length > 32) return decoded
  } catch {
    return null
  }
  return null
}

export function parseGoogleServiceAccount(): {
  clientEmail: string
  privateKey: string
  privateKeyId?: string
} | null {
  const jsonRaw = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON?.trim()
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw) as {
        client_email?: string
        private_key?: string
        private_key_id?: string
      }
      if (parsed.client_email && parsed.private_key) {
        return {
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
          privateKeyId: parsed.private_key_id,
        }
      }
    } catch {
      return null
    }
  }

  const clientEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL?.trim()
  const keyBuf = decodeCertEnv(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_PRIVATE_KEY)
  if (!clientEmail || !keyBuf) return null

  return {
    clientEmail,
    privateKey: keyBuf.toString("utf8"),
    privateKeyId: process.env.GOOGLE_WALLET_SA_PRIVATE_KEY_ID?.trim(),
  }
}

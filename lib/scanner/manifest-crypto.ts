/**
 * Cifrado del manifiesto de puerta: totp_secret nunca queda en claro en IndexedDB.
 * Clave en memoria derivada del PIN de turno (PBKDF2 → AES-GCM + HMAC lookup).
 */

const VERIFIER_PLAINTEXT = "tokepass-scanner-vault-v1"
export const SCANNER_VAULT_ITERATIONS = 120_000
const HKDF_SALT = new TextEncoder().encode("tokepass-scanner-hkdf-v1")

export type EncryptedSecretBlob = {
  v: 1
  iv: string
  ct: string
}

export type ScannerVaultRecord = {
  id: "vault"
  saltB64: string
  iterations: number
  verifierIvB64: string
  verifierCtB64: string
}

let encKey: CryptoKey | null = null
let lookupKey: CryptoKey | null = null

export function isScannerVaultUnlocked(): boolean {
  return encKey != null && lookupKey != null
}

export function lockScannerVault(): void {
  encKey = null
  lookupKey = null
}

export class ScannerVaultError extends Error {
  constructor(
    readonly code: "pin_required" | "pin_invalid" | "crypto_unavailable" | "corrupt",
    message: string,
  ) {
    super(message)
    this.name = "ScannerVaultError"
  }
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function b64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return Array.from(view)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function requireSubtle(): SubtleCrypto {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new ScannerVaultError(
      "crypto_unavailable",
      "Web Crypto no disponible en este dispositivo",
    )
  }
  return crypto.subtle
}

export function normalizeScannerPin(pin: string): string {
  return pin.replace(/\s+/g, "").trim()
}

export function isValidScannerPin(pin: string): boolean {
  return /^\d{4,8}$/.test(normalizeScannerPin(pin))
}

async function deriveMasterKey(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const subtle = requireSubtle()
  const base = await subtle.importKey(
    "raw",
    new TextEncoder().encode(normalizeScannerPin(pin)),
    "PBKDF2",
    false,
    ["deriveBits"],
  )
  const bits = await subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations: Math.max(1_000, Math.floor(iterations) || SCANNER_VAULT_ITERATIONS),
    },
    base,
    256,
  )
  return subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"])
}

async function deriveNamedKey(
  master: CryptoKey,
  info: string,
  algorithm: AesKeyGenParams | HmacImportParams,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const subtle = requireSubtle()
  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: HKDF_SALT,
      info: new TextEncoder().encode(info),
    },
    master,
    algorithm,
    false,
    usages,
  )
}

async function deriveSessionKeys(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<{ enc: CryptoKey; lookup: CryptoKey }> {
  const master = await deriveMasterKey(pin, salt, iterations)
  const [enc, lookup] = await Promise.all([
    deriveNamedKey(
      master,
      "aes-gcm-totp",
      { name: "AES-GCM", length: 256 },
      ["encrypt", "decrypt"],
    ),
    deriveNamedKey(
      master,
      "hmac-secret-lookup",
      { name: "HMAC", hash: "SHA-256", length: 256 },
      ["sign"],
    ),
  ])
  return { enc, lookup }
}

async function encryptWithKey(
  key: CryptoKey,
  plaintext: string,
): Promise<{ ivB64: string; ctB64: string }> {
  const subtle = requireSubtle()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  return { ivB64: bytesToB64(iv), ctB64: bytesToB64(new Uint8Array(ct)) }
}

async function decryptWithKey(
  key: CryptoKey,
  ivB64: string,
  ctB64: string,
): Promise<string> {
  const subtle = requireSubtle()
  const iv = b64ToBytes(ivB64)
  const ct = b64ToBytes(ctB64)
  try {
    const plain = await subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ct as BufferSource,
    )
    return new TextDecoder().decode(plain)
  } catch {
    throw new ScannerVaultError("pin_invalid", "PIN de validador incorrecto")
  }
}

export async function encryptTotpSecret(plaintext: string): Promise<EncryptedSecretBlob> {
  if (!encKey) {
    throw new ScannerVaultError("pin_required", "Desbloquea el manifiesto con el PIN")
  }
  const { ivB64, ctB64 } = await encryptWithKey(encKey, plaintext)
  return { v: 1, iv: ivB64, ct: ctB64 }
}

export async function decryptTotpSecret(
  blob: EncryptedSecretBlob | string | null | undefined,
): Promise<string> {
  if (!encKey) {
    throw new ScannerVaultError("pin_required", "Desbloquea el manifiesto con el PIN")
  }
  if (!blob) return ""
  const parsed =
    typeof blob === "string"
      ? (JSON.parse(blob) as EncryptedSecretBlob)
      : blob
  if (!parsed?.iv || !parsed?.ct) return ""
  return decryptWithKey(encKey, parsed.iv, parsed.ct)
}

export function serializeEncryptedSecret(blob: EncryptedSecretBlob): string {
  return JSON.stringify(blob)
}

export function parseEncryptedSecret(
  raw: string | EncryptedSecretBlob | null | undefined,
): EncryptedSecretBlob | null {
  if (!raw) return null
  if (typeof raw !== "string") {
    return raw.v === 1 && raw.iv && raw.ct ? raw : null
  }
  const trimmed = raw.trim()
  if (!trimmed.startsWith("{")) return null
  try {
    const parsed = JSON.parse(trimmed) as EncryptedSecretBlob
    if (parsed?.v === 1 && parsed.iv && parsed.ct) return parsed
    return null
  } catch {
    return null
  }
}

/** HMAC del secreto: permite lookup v1/static sin guardar el secreto en claro. */
export async function totpSecretLookupHash(secret: string): Promise<string> {
  if (!lookupKey) {
    throw new ScannerVaultError("pin_required", "Desbloquea el manifiesto con el PIN")
  }
  const subtle = requireSubtle()
  const sig = await subtle.sign(
    "HMAC",
    lookupKey,
    new TextEncoder().encode(secret.trim()),
  )
  return toHex(sig)
}

export async function unlockOrCreateScannerVault(
  pin: string,
  vault: ScannerVaultRecord | null,
): Promise<{ record: ScannerVaultRecord; created: boolean }> {
  if (!isValidScannerPin(pin)) {
    throw new ScannerVaultError(
      "pin_invalid",
      "El PIN de validador debe tener 4 a 8 digitos",
    )
  }

  if (!vault) {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const keys = await deriveSessionKeys(pin, salt, SCANNER_VAULT_ITERATIONS)
    encKey = keys.enc
    lookupKey = keys.lookup
    const verifier = await encryptWithKey(keys.enc, VERIFIER_PLAINTEXT)
    return {
      created: true,
      record: {
        id: "vault",
        saltB64: bytesToB64(salt),
        iterations: SCANNER_VAULT_ITERATIONS,
        verifierIvB64: verifier.ivB64,
        verifierCtB64: verifier.ctB64,
      },
    }
  }

  const keys = await deriveSessionKeys(
    pin,
    b64ToBytes(vault.saltB64),
    vault.iterations || SCANNER_VAULT_ITERATIONS,
  )
  const check = await decryptWithKey(
    keys.enc,
    vault.verifierIvB64,
    vault.verifierCtB64,
  )
  if (check !== VERIFIER_PLAINTEXT) {
    throw new ScannerVaultError("corrupt", "Boveda de escáner corrupta")
  }
  encKey = keys.enc
  lookupKey = keys.lookup
  return { created: false, record: vault }
}

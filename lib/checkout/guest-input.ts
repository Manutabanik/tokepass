export const DNI_ERROR = "El DNI debe tener 7 u 8 dígitos."
export const PHONE_ERROR = "Ingresá un celular argentino con código de área."
export const EMAIL_ERROR = "Ingresá un mail válido para la confirmación."

const STRICT_EMAIL_RE =
  /^[a-z0-9](?:[a-z0-9._%+\-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z]{2,})+$/i

const KNOWN_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "live.com",
  "proton.me",
  "protonmail.com",
] as const

const DOMAIN_TYPOS: Record<string, string> = {
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.com.ar": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "icloud.co": "icloud.com",
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isStrictEmail(raw: string): boolean {
  const email = normalizeEmail(raw)
  if (!STRICT_EMAIL_RE.test(email)) return false
  if (email.includes("..")) return false
  return true
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const rows = a.length + 1
  const cols = b.length + 1
  const grid = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
  for (let i = 0; i < rows; i++) grid[i][0] = i
  for (let j = 0; j < cols; j++) grid[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,
        grid[i][j - 1] + 1,
        grid[i - 1][j - 1] + cost,
      )
    }
  }
  return grid[a.length][b.length]
}

export function suggestEmailTypo(raw: string): string | null {
  const email = normalizeEmail(raw)
  const at = email.lastIndexOf("@")
  if (at <= 0 || at === email.length - 1) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (!local || !domain) return null

  const mapped = DOMAIN_TYPOS[domain]
  if (mapped && mapped !== domain) return `${local}@${mapped}`

  let best: string | null = null
  let bestDistance = 3
  for (const known of KNOWN_DOMAINS) {
    if (known === domain) return null
    const distance = levenshtein(domain, known)
    if (distance > 0 && distance < bestDistance) {
      bestDistance = distance
      best = known
    }
  }
  if (!best || bestDistance > 2) return null
  return `${local}@${best}`
}

export function normalizeDni(raw: string): string {
  return raw.replace(/\D/g, "")
}

export function isValidDni(raw: string): boolean {
  return /^\d{7,8}$/.test(normalizeDni(raw))
}

/**
 * Normalizes Argentine mobiles to E.164 (+549…).
 * Accepts 11 2345 6789, 15 2345 6789 (CABA legacy), 549… and +54 9 ….
 */
export function normalizeArgentineMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, "")
  if (digits.startsWith("00")) digits = digits.slice(2)

  if (digits.startsWith("54")) {
    const rest = digits.slice(2)
    digits = rest.startsWith("9") ? `54${rest}` : `549${rest}`
  } else if (digits.startsWith("9") && digits.length >= 11) {
    digits = `54${digits}`
  } else if (digits.startsWith("15") && digits.length === 10) {
    digits = `54911${digits.slice(2)}`
  } else if (digits.length === 10) {
    digits = `549${digits}`
  }

  if (!/^549\d{10}$/.test(digits)) return null
  return `+${digits}`
}

export function isValidArgentineMobile(raw: string): boolean {
  return normalizeArgentineMobile(raw) != null
}

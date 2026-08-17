export function moneyToCents(
  value: number | string | null | undefined,
): number {
  if (value == null || value === "") return 0
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0
    return Math.round(value * 100)
  }

  const trimmed = String(value).trim().replace(",", ".")
  const match = trimmed.match(/^(-)?(\d+)(?:\.(\d{0,2}))?$/)
  if (match) {
    const sign = match[1] ? -1 : 1
    const whole = Number(match[2])
    const frac = Number((match[3] ?? "").padEnd(2, "0").slice(0, 2) || "0")
    if (!Number.isFinite(whole) || !Number.isFinite(frac)) return 0
    return sign * (whole * 100 + frac)
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(parsed * 100)
}

export function moneyToCentsBigInt(
  value: number | string | null | undefined,
): bigint {
  return BigInt(moneyToCents(value))
}

export function centsToMoney(cents: number): number {
  if (!Number.isFinite(cents)) return 0
  return cents / 100
}

export function centsBigIntToMoney(cents: bigint): number {
  return centsToMoney(Number(cents))
}

/** Visual/CSV layer only. Processing stays in integer cents. */
export function formatCentsAsDecimal(cents: bigint): string {
  const negative = cents < BigInt(0)
  const abs = negative ? -cents : cents
  const hundred = BigInt(100)
  const whole = abs / hundred
  const frac = (abs % hundred).toString().padStart(2, "0")
  return `${negative ? "-" : ""}${whole.toString()},${frac}`
}

/** Visual layer only. Processing stays in integer cents. */
export function formatCentsAsArs(cents: bigint): string {
  const negative = cents < BigInt(0)
  const abs = negative ? -cents : cents
  const hundred = BigInt(100)
  const whole = Number(abs / hundred)
  const frac = Number(abs % hundred) / 100
  const amount = whole + frac
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(negative ? -amount : amount)
}

export function moneyAmountsEqual(
  left: number | string | null | undefined,
  right: number | string | null | undefined,
): boolean {
  const leftNum = typeof left === "number" ? left : Number(left)
  const rightNum = typeof right === "number" ? right : Number(right)
  if (!Number.isFinite(leftNum) || !Number.isFinite(rightNum)) return false
  return moneyToCents(left) === moneyToCents(right)
}

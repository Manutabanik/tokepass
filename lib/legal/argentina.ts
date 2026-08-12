export function normalizeCuit(value: string): string {
  return value.replace(/\D/g, "")
}

export function isValidCuit(value: string): boolean {
  const digits = normalizeCuit(value)
  if (!/^\d{11}$/.test(digits)) return false

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const sum = weights.reduce(
    (total, weight, index) => total + Number(digits[index]) * weight,
    0,
  )
  const remainder = 11 - (sum % 11)
  const verifier = remainder === 11 ? 0 : remainder

  return verifier !== 10 && verifier === Number(digits[10])
}

export function formatCuit(value: string): string {
  const digits = normalizeCuit(value)
  if (digits.length !== 11) return value
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`
}

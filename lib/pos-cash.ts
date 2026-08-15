export function cashTenderSuggestions(total: number): number[] {
  if (!Number.isFinite(total) || total <= 0) return []
  const ceilTo = (step: number) => Math.ceil(total / step) * step
  const unique: number[] = []
  const push = (value: number) => {
    if (value >= total && !unique.includes(value)) unique.push(value)
  }
  push(ceilTo(10_000))
  push(ceilTo(50_000))
  if (total <= 200_000) push(200_000)
  else push(ceilTo(100_000))
  for (const extra of [150_000, 500_000, 1_000_000]) {
    if (unique.length >= 3) break
    push(extra)
  }
  return unique.slice(0, 4)
}

export function cashChangeDue(total: number, tendered: number): number {
  if (!Number.isFinite(total) || !Number.isFinite(tendered)) return 0
  return Math.max(0, Math.round((tendered - total) * 100) / 100)
}

export const POS_EXPRESS_DNI = "00000000"
export const POS_EXPRESS_NAME = "Consumidor Final"

export function resolvePosBuyer(input: {
  express: boolean
  dni: string
  name: string
}): { dni: string; name: string } {
  if (input.express) {
    return { dni: POS_EXPRESS_DNI, name: POS_EXPRESS_NAME }
  }
  const dni = input.dni.replace(/\D/g, "")
  return {
    dni: dni.length >= 7 && dni.length <= 11 ? dni : POS_EXPRESS_DNI,
    name: input.name.trim() || POS_EXPRESS_NAME,
  }
}

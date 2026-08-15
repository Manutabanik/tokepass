import type { AccessibleRowNode, AccessibleSeatNode } from "@/lib/seating/accessible-seat-tree"

export type SeatMatrixGroup = {
  title: string
  seats: AccessibleSeatNode[]
}

const TRAILING_NUMBER = /[\s.\-_·–—]*(\d+)\s*$/

export function compactSeatToken(
  label: string,
  number?: number,
): string {
  const trimmed = label.trim()
  const match = TRAILING_NUMBER.exec(trimmed)
  if (match?.[1]) {
    return match[1].length === 1 ? match[1].padStart(2, "0") : match[1]
  }
  if (number != null && Number.isFinite(number) && number > 0) {
    const digits = String(Math.floor(number))
    return digits.length === 1 ? digits.padStart(2, "0") : digits
  }
  const lastChunk = trimmed.split(/[\s·\-–—]+/).filter(Boolean).at(-1)
  return lastChunk || trimmed || "—"
}

export function seatGroupKey(input: {
  row?: string
  label?: string
}): string {
  const row = input.row?.trim() || ""
  const label = input.label?.trim() || ""
  const source = row || label
  if (!source) return "Lugares"
  if (/^\d+$/.test(source)) return source
  const prefix = source.replace(TRAILING_NUMBER, "").replace(/[\s·\-–—]+$/g, "").trim()
  if (prefix && prefix !== source) return prefix
  return source
}

export function formatSeatGroupTitle(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return "Lugares"
  if (/^fila\b/i.test(trimmed)) return trimmed
  if (/^\d+$/.test(trimmed)) return `Fila ${trimmed}`
  return trimmed
}

export function groupSeatsForMatrix(rows: AccessibleRowNode[]): SeatMatrixGroup[] {
  const grouped = rows.reduce((acc, row) => {
    for (const seat of row.seats) {
      const key = seatGroupKey({ row: row.label, label: seat.label })
      const list = acc.get(key) ?? []
      list.push(seat)
      acc.set(key, list)
    }
    return acc
  }, new Map<string, AccessibleSeatNode[]>())

  return [...grouped.entries()]
    .sort((left, right) => left[0].localeCompare(right[0], "es", { numeric: true }))
    .map(([key, seats]) => ({
      title: formatSeatGroupTitle(key),
      seats: [...seats].sort((left, right) => {
        if (left.number !== right.number) return left.number - right.number
        return left.label.localeCompare(right.label, "es", { numeric: true })
      }),
    }))
}

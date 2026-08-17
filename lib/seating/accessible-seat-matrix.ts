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

function unpaddedToken(seat: AccessibleSeatNode): string {
  const token = compactSeatToken(seat.label, seat.number)
  return token.replace(/^0+(?=\d)/, "") || token
}

export function formatSeatChunkTitle(
  base: string,
  seats: AccessibleSeatNode[],
): string {
  const heading = base.trim() || "Lugares"
  if (seats.length === 0) return heading
  const first = unpaddedToken(seats[0]!)
  const last = unpaddedToken(seats[seats.length - 1]!)
  if (/^fila\b/i.test(heading)) {
    if (first === last) return `${heading} · ${first}`
    return `${heading} · ${first} a ${last}`
  }
  if (first === last) return `${heading} ${first}`.trim()
  return `${heading} ${first} a ${last}`
}

const DEFAULT_CHUNK_SIZE = 10

export function selectableSeats(
  seats: AccessibleSeatNode[],
): AccessibleSeatNode[] {
  return seats.filter(
    (seat) => seat.status === "available" || seat.status === "selected",
  )
}

export function chunkSeatMatrixGroups(
  groups: SeatMatrixGroup[],
  size = DEFAULT_CHUNK_SIZE,
): SeatMatrixGroup[] {
  const chunkSize = Math.max(1, Math.floor(size) || DEFAULT_CHUNK_SIZE)
  const chunks: SeatMatrixGroup[] = []
  for (const group of groups) {
    const seats = selectableSeats(group.seats)
    if (seats.length === 0) continue
    for (let index = 0; index < seats.length; index += chunkSize) {
      const slice = seats.slice(index, index + chunkSize)
      chunks.push({
        title: formatSeatChunkTitle(group.title, slice),
        seats: slice,
      })
    }
  }
  return chunks
}

export type SeatAllocationStatus =
  | "available"
  | "occupied"
  | "blocked"
  | "selected"

export type Seat = {
  id: string
  number: number
  status: SeatAllocationStatus
  row_id?: string
  row_name?: string
  row?: string
}

export type SeatRow = {
  id: string
  label: string
  seats: Seat[]
}

export type RowPriorityConfig = {
  /** `front-first` = Fila 1 mas cerca del escenario. */
  direction?: "front-first" | "back-first"
  /** Orden explicito de filas, de mas cerca a mas lejos del escenario. */
  rowOrder?: readonly string[]
}

type ContiguousBlock = {
  startIndex: number
  seats: Seat[]
  orphanPenalty: boolean
  centerDistance: number
}

function rowKey(seat: Seat): string {
  const raw = seat.row_id ?? seat.row_name ?? seat.row ?? ""
  return raw.trim() || "1"
}

function parseRowIndex(label: string): number | null {
  const match = label.match(/-?\d+/)
  if (!match) return null
  const value = Number(match[0])
  return Number.isFinite(value) ? value : null
}

function compareRowLabels(left: string, right: string): number {
  const leftNum = parseRowIndex(left)
  const rightNum = parseRowIndex(right)
  if (leftNum != null && rightNum != null && leftNum !== rightNum) {
    return leftNum - rightNum
  }
  return left.localeCompare(right, "es", { numeric: true })
}

function isSelectable(status: SeatAllocationStatus): boolean {
  return status === "available" || status === "selected"
}

function isTaken(status: SeatAllocationStatus): boolean {
  return status === "occupied" || status === "blocked"
}

function groupSeatsByRow(seats: readonly Seat[]): SeatRow[] {
  const groups = new Map<string, Seat[]>()
  for (const seat of seats) {
    const key = rowKey(seat)
    const list = groups.get(key)
    if (list) {
      list.push(seat)
      continue
    }
    groups.set(key, [seat])
  }

  return [...groups.entries()].map(([label, rowSeats]) => ({
    id: label,
    label,
    seats: rowSeats.slice().sort((left, right) => left.number - right.number),
  }))
}

function sortRows(rows: SeatRow[], config?: RowPriorityConfig): SeatRow[] {
  const order = config?.rowOrder
  if (order && order.length > 0) {
    const rank = new Map(order.map((label, index) => [label, index]))
    return rows.slice().sort((left, right) => {
      const leftRank = rank.get(left.label)
      const rightRank = rank.get(right.label)
      if (leftRank != null && rightRank != null) return leftRank - rightRank
      if (leftRank != null) return -1
      if (rightRank != null) return 1
      return compareRowLabels(left.label, right.label)
    })
  }

  const sorted = rows.slice().sort((left, right) =>
    compareRowLabels(left.label, right.label),
  )
  return config?.direction === "back-first" ? sorted.reverse() : sorted
}

function isStrictlyContiguous(window: readonly Seat[]): boolean {
  for (let index = 1; index < window.length; index += 1) {
    const previous = window[index - 1]
    const current = window[index]
    if (!previous || !current) return false
    if (current.number !== previous.number + 1) return false
  }
  return true
}

function availableGap(
  seats: readonly Seat[],
  fromIndex: number,
  step: -1 | 1,
): number {
  let gap = 0
  for (let index = fromIndex; index >= 0 && index < seats.length; index += step) {
    const seat = seats[index]
    if (!seat) break
    if (isTaken(seat.status)) break
    if (!isSelectable(seat.status)) break
    gap += 1
  }
  return gap
}

function leavesOrphan(
  seats: readonly Seat[],
  startIndex: number,
  endIndex: number,
): boolean {
  const leftGap = availableGap(seats, startIndex - 1, -1)
  const rightGap = availableGap(seats, endIndex + 1, 1)
  return leftGap === 1 || rightGap === 1
}

function rowGeometricCenter(seats: readonly Seat[]): number {
  const first = seats[0]
  const last = seats[seats.length - 1]
  if (!first || !last) return 0
  return (first.number + last.number) / 2
}

function blockGeometricCenter(seats: readonly Seat[]): number {
  const first = seats[0]
  const last = seats[seats.length - 1]
  if (!first || !last) return 0
  return (first.number + last.number) / 2
}

function collectBlocks(
  rowSeats: readonly Seat[],
  requiredQuantity: number,
): ContiguousBlock[] {
  const rowCenter = rowGeometricCenter(rowSeats)
  const blocks: ContiguousBlock[] = []
  const lastStart = rowSeats.length - requiredQuantity

  for (let start = 0; start <= lastStart; start += 1) {
    const window = rowSeats.slice(start, start + requiredQuantity)
    if (window.length !== requiredQuantity) continue
    if (!window.every((seat) => isSelectable(seat.status))) continue
    if (!isStrictlyContiguous(window)) continue

    const endIndex = start + requiredQuantity - 1
    blocks.push({
      startIndex: start,
      seats: window,
      orphanPenalty: leavesOrphan(rowSeats, start, endIndex),
      centerDistance: Math.abs(rowCenter - blockGeometricCenter(window)),
    })
  }

  return blocks
}

function pickBestBlock(blocks: readonly ContiguousBlock[]): Seat[] | null {
  if (blocks.length === 0) return null
  const ranked = blocks.slice().sort((left, right) => {
    if (left.orphanPenalty !== right.orphanPenalty) {
      return left.orphanPenalty ? 1 : -1
    }
    if (left.centerDistance !== right.centerDistance) {
      return left.centerDistance - right.centerDistance
    }
    return left.startIndex - right.startIndex
  })
  return ranked[0]?.seats.slice() ?? null
}

/**
 * Best Available Seat: contiguidad estricta, fila mas cercana al escenario,
 * anti-huerfanos y centro de gravedad. Funcion pura.
 */
export function findBestAvailableSeats(
  seats: Seat[],
  requiredQuantity: number,
  rowPriorityConfig?: RowPriorityConfig,
): Seat[] | null {
  const quantity = Math.floor(requiredQuantity)
  if (!Number.isFinite(quantity) || quantity <= 0) return null
  if (seats.length < quantity) return null

  const rows = sortRows(groupSeatsByRow(seats), rowPriorityConfig)

  for (const row of rows) {
    if (row.seats.length < quantity) continue
    const chosen = pickBestBlock(collectBlocks(row.seats, quantity))
    if (chosen) return chosen
  }

  return null
}

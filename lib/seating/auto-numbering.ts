import type { VenueMapElement } from "@/types/venue-map"

export type AutoNumberDirection = "ltr" | "rtl" | "inner_to_outer"

export type AutoNumberOptions = {
  start: number
  prefix: string
  suffix: string
  direction: AutoNumberDirection
  pad?: number
}

export type MatrixRowAxis = "letters" | "numbers"

export type MatrixAisleMode = "sequential" | "theatre_odds_evens"

export type MatrixNumberOptions = {
  rowAxis: MatrixRowAxis
  aisleMode: MatrixAisleMode
  rowPrefix?: string
  seatPrefix?: string
  rowThreshold?: number
}

function padWidth(count: number, start: number, explicit?: number): number {
  if (explicit && explicit > 0) return explicit
  const last = start + Math.max(0, count - 1)
  if (last >= 1000) return 4
  if (last >= 100) return 3
  return 2
}

function formatToken(n: number, width: number): string {
  return String(n).padStart(width, "0")
}

function isLocked(element: VenueMapElement): boolean {
  return element.labelLocked === true
}

function applySeatNumber(
  element: VenueMapElement,
  label: string,
  sequence: number,
): VenueMapElement {
  const next: VenueMapElement = {
    ...element,
    label,
    seats: element.seats.map((seat, seatIndex) =>
      element.type === "vip_chair" && seatIndex === 0
        ? { ...seat, number: sequence }
        : seat,
    ),
  }
  delete next.customLabel
  return next
}

export function sortElementsForNumbering(
  elements: VenueMapElement[],
  direction: AutoNumberDirection,
): VenueMapElement[] {
  if (elements.length === 0) return []
  const cx =
    elements.reduce((sum, element) => sum + element.x, 0) / elements.length
  const cy =
    elements.reduce((sum, element) => sum + element.y, 0) / elements.length
  const decorated = elements.map((element) => ({
    element,
    angle: Math.atan2(element.x - cx, -(element.y - cy)),
    ring: element.ringIndex ?? 0,
    x: element.x,
  }))

  decorated.sort((a, b) => {
    if (direction === "inner_to_outer") {
      if (a.ring !== b.ring) return a.ring - b.ring
      return a.angle - b.angle
    }
    if (a.ring !== b.ring) return a.ring - b.ring
    if (direction === "rtl") return b.x - a.x
    return a.x - b.x
  })

  return decorated.map((item) => item.element)
}

export function applyAutoNumbering(
  elements: VenueMapElement[],
  selectedIds: Set<string>,
  options: AutoNumberOptions,
): VenueMapElement[] {
  const start = Math.max(1, Math.floor(options.start) || 1)
  const selected = elements.filter((element) => selectedIds.has(element.id))
  const ordered = sortElementsForNumbering(selected, options.direction)
  const width = padWidth(ordered.length, start, options.pad)
  const prefix = options.prefix.slice(0, 16)
  const suffix = options.suffix.slice(0, 16)
  const nextLabel = new Map<string, { label: string; sequence: number }>()
  const used = new Set<string>()

  ordered.forEach((element, index) => {
    let sequence = start + index
    let label = `${prefix}${formatToken(sequence, width)}${suffix}`
    while (used.has(label)) {
      sequence += 1
      label = `${prefix}${formatToken(sequence, width)}${suffix}`
    }
    used.add(label)
    nextLabel.set(element.id, { label, sequence })
  })

  return elements.map((element) => {
    const assigned = nextLabel.get(element.id)
    if (!assigned || isLocked(element)) return element
    return applySeatNumber(element, assigned.label, assigned.sequence)
  })
}

export function applySequentialLabels(
  elements: VenueMapElement[],
  selectedIds: string[],
  prefix: string,
  start = 1,
): VenueMapElement[] {
  const base = prefix.trim()
  const begin = Number.isFinite(start) ? Math.floor(start) : 1
  const labels = new Map<string, { label: string; sequence: number }>()
  selectedIds.forEach((id, index) => {
    if (labels.has(id)) return
    const sequence = begin + index
    labels.set(id, {
      sequence,
      label: base ? `${base} ${sequence}` : String(sequence),
    })
  })
  return elements.map((element) => {
    const assigned = labels.get(element.id)
    if (!assigned || isLocked(element)) return element
    return applySeatNumber(element, assigned.label, assigned.sequence)
  })
}

/** 0 → A, 25 → Z, 26 → AA */
export function rowIndexToLetter(index: number): string {
  let n = Math.max(0, Math.floor(index))
  let out = ""
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

export function rowIndexToLabel(index: number, axis: MatrixRowAxis): string {
  return axis === "numbers" ? String(index + 1) : rowIndexToLetter(index)
}

/**
 * Theatre aisle: odds grow left of center, evens grow right.
 * 4 seats → 3, 1, 2, 4. 8 seats → 7, 5, 3, 1, 2, 4, 6, 8.
 */
export function theatreSeatNumbers(count: number): number[] {
  const n = Math.max(0, Math.floor(count))
  if (n <= 0) return []
  if (n === 1) return [1]
  const leftCount = Math.floor(n / 2)
  const rightCount = n - leftCount
  const result = Array.from({ length: n }, () => 0)
  for (let i = 0; i < leftCount; i += 1) {
    result[leftCount - 1 - i] = 1 + i * 2
  }
  for (let i = 0; i < rightCount; i += 1) {
    result[leftCount + i] = 2 + i * 2
  }
  return result
}

export function clusterElementsIntoRows(
  elements: VenueMapElement[],
  threshold = 14,
): VenueMapElement[][] {
  if (elements.length === 0) return []
  const sorted = [...elements].sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: VenueMapElement[][] = []
  for (const element of sorted) {
    const last = rows[rows.length - 1]
    if (!last) {
      rows.push([element])
      continue
    }
    const rowY = last.reduce((sum, item) => sum + item.y, 0) / last.length
    const tol = Math.max(
      threshold,
      Math.max(element.height, last[0]?.height ?? element.height) * 0.45,
    )
    if (Math.abs(element.y - rowY) <= tol) last.push(element)
    else rows.push([element])
  }
  return rows.map((row) => [...row].sort((a, b) => a.x - b.x))
}

export function groupElementsIntoRows(
  elements: VenueMapElement[],
  threshold = 14,
): VenueMapElement[][] {
  if (elements.length === 0) return []
  const allIndexed = elements.every((element) => element.ringIndex != null)
  if (allIndexed) {
    const byRing = new Map<number, VenueMapElement[]>()
    for (const element of elements) {
      const key = element.ringIndex ?? 0
      const list = byRing.get(key) ?? []
      list.push(element)
      byRing.set(key, list)
    }
    return [...byRing.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, list]) => [...list].sort((a, b) => a.x - b.x))
  }
  return clusterElementsIntoRows(elements, threshold)
}

export function formatMatrixLabel(
  rowLabel: string,
  seatNumber: number,
  options?: Pick<MatrixNumberOptions, "rowPrefix" | "seatPrefix">,
): string {
  const rowPrefix = (options?.rowPrefix ?? "Fila").trim() || "Fila"
  const seatPrefix = (options?.seatPrefix ?? "Asiento").trim() || "Asiento"
  return `${rowPrefix} ${rowLabel} - ${seatPrefix} ${seatNumber}`
}

export function applyMatrixNumbering(
  elements: VenueMapElement[],
  selectedIds: Set<string> | string[],
  options: MatrixNumberOptions,
): VenueMapElement[] {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds)
  const selected = elements.filter((element) => ids.has(element.id))
  const rows = groupElementsIntoRows(selected, options.rowThreshold ?? 14)
  const nextLabel = new Map<string, { label: string; sequence: number }>()

  rows.forEach((row, rowIndex) => {
    const rowLabel = rowIndexToLabel(rowIndex, options.rowAxis)
    const numbers =
      options.aisleMode === "theatre_odds_evens"
        ? theatreSeatNumbers(row.length)
        : row.map((_, index) => index + 1)
    row.forEach((element, col) => {
      const sequence = numbers[col] ?? col + 1
      nextLabel.set(element.id, {
        sequence,
        label: formatMatrixLabel(rowLabel, sequence, options),
      })
    })
  })

  return elements.map((element) => {
    const assigned = nextLabel.get(element.id)
    if (!assigned || isLocked(element)) return element
    return applySeatNumber(element, assigned.label, assigned.sequence)
  })
}

export function applyLabelOverride(
  elements: VenueMapElement[],
  id: string,
  label: string,
): VenueMapElement[] {
  const nextLabel = label.trim().slice(0, 80)
  if (!nextLabel) return elements
  return elements.map((element) =>
    element.id === id
      ? { ...element, label: nextLabel, customLabel: nextLabel, labelLocked: true }
      : element,
  )
}

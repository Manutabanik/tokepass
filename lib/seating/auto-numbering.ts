import type { VenueMapElement } from "@/types/venue-map"

export type AutoNumberDirection = "ltr" | "rtl" | "inner_to_outer"

export type AutoNumberOptions = {
  start: number
  prefix: string
  suffix: string
  direction: AutoNumberDirection
  pad?: number
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
    if (!assigned) return element
    const next: VenueMapElement = {
      ...element,
      label: assigned.label,
      seats: element.seats.map((seat, seatIndex) =>
        element.type === "vip_chair" && seatIndex === 0
          ? { ...seat, number: assigned.sequence }
          : seat,
      ),
    }
    return next
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
  const labels = new Map<string, string>()
  selectedIds.forEach((id, index) => {
    if (labels.has(id)) return
    const sequence = begin + index
    labels.set(id, base ? `${base} ${sequence}` : String(sequence))
  })
  return elements.map((element) => {
    const label = labels.get(element.id)
    if (!label) return element
    return { ...element, label }
  })
}

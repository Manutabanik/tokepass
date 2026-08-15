import { rebuildElementSeats } from "@/lib/seating/venue-element-geometry"
import {
  isInfrastructureElement,
  type VenueMapElement,
} from "@/types/venue-map"

export function normalizeVenueColor(color: string): string {
  return color.trim().toLowerCase()
}

export function selectSimilarElementIds(
  elements: VenueMapElement[],
  sourceId: string,
): string[] {
  const source = elements.find((item) => item.id === sourceId)
  if (!source) return []
  const color = normalizeVenueColor(source.color)
  const infra = isInfrastructureElement(source)
  return elements
    .filter(
      (item) =>
        normalizeVenueColor(item.color) === color &&
        isInfrastructureElement(item) === infra,
    )
    .map((item) => item.id)
}

export function applyBulkElementPrice(
  elements: VenueMapElement[],
  selectedIds: string[],
  price: number,
): VenueMapElement[] {
  const ids = new Set(selectedIds)
  const nextPrice = Number.isFinite(price) ? Number(price) : 0
  return elements.map((item) =>
    ids.has(item.id) && !isInfrastructureElement(item)
      ? { ...item, price: nextPrice }
      : item,
  )
}

export function applyBulkElementColor(
  elements: VenueMapElement[],
  selectedIds: string[],
  color: string,
): VenueMapElement[] {
  const ids = new Set(selectedIds)
  return elements.map((item) =>
    ids.has(item.id) ? { ...item, color } : item,
  )
}

export function applyBulkElementCapacity(
  elements: VenueMapElement[],
  selectedIds: string[],
  capacity: number,
): VenueMapElement[] {
  const ids = new Set(selectedIds)
  const count = Math.max(1, Math.floor(capacity) || 1)
  return elements.map((item) => {
    if (!ids.has(item.id) || isInfrastructureElement(item)) return item
    if (item.type === "standing_zone") {
      return { ...item, capacity: count }
    }
    if (item.type === "vip_chair") return item
    const next: VenueMapElement = { ...item }
    if (item.type === "long_table") {
      next.sideA = Math.max(1, Math.ceil(count / 2))
      next.sideB = Math.max(0, Math.floor(count / 2))
      next.chairCount = next.sideA + next.sideB
    } else {
      next.chairCount = Math.min(12, Math.max(2, count))
    }
    next.capacity = next.chairCount
    next.seats = rebuildElementSeats(next)
    return next
  })
}

export function defaultBulkPrefix(elements: VenueMapElement[]): string {
  const type = elements[0]?.type
  if (type === "long_table") return "Tablón"
  if (type === "vip_box") return "Palco"
  if (type === "vip_chair") return "Butaca"
  if (type === "standing_zone") return "Zona"
  return "Mesa"
}
